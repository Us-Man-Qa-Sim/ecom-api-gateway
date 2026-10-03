import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  AdjustStockResponse,
  AttributesUpdate,
  CreateProductResponse,
  DeleteProductResponse,
  ImagesUpdate,
  UpdateProductResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import type {
  DeliverOrderResponse,
  ListAllOrdersResponse,
  ShipOrderResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/order';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { OrderGrpcClient } from '../../grpc/order.client';
import { ProductGrpcClient } from '../../grpc/product.client';
import { callGrpc, GrpcCallTimeouts } from '../../common/grpc-call.util';
import { toOrderView } from '../../common/mappers/order.view';
import { toPaginationView, toProductView } from '../../common/mappers/product.view';
import { stringToProtoOrderStatus } from '../../common/mappers/proto.mapper';
import { AdjustStockDto, CreateProductDto, UpdateProductDto } from './dto/product-admin.dto';
import { ListAllOrdersQueryDto } from '../orders/dto/list-orders.query';
import {
  HttpErrorResponse,
  OrderListResponse,
  OrderResponse,
  ProductResponse,
} from '../../swagger/response-models';

// Everything under /admin/* requires the ADMIN role. The downstream services
// also enforce their own ownership/role rules; this decorator exists so a
// forgotten downstream check does not silently expose a destructive operation.
@ApiTags('admin')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponse,
})
@ApiForbiddenResponse({ description: 'Caller is not an admin', type: HttpErrorResponse })
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly products: ProductGrpcClient,
    private readonly orders: OrderGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
    private readonly timeouts: GrpcCallTimeouts,
  ) {}

  // ---- Product admin ----------------------------------------------------

  @Post('products')
  @ApiOperation({ summary: 'Create a product.' })
  @ApiCreatedResponse({ type: ProductResponse })
  async createProduct(@Body() body: CreateProductDto) {
    // standard: single document insert + outbox write.
    const response = await callGrpc<CreateProductResponse>(
      this.products.service.createProduct(
        {
          name: body.name,
          description: body.description,
          category: body.category,
          price: { amountMinor: body.price.amountMinor, currency: body.price.currency },
          initialStock: body.initialStock,
          attributes: body.attributes ?? {},
          images: body.images ?? [],
        },
        this.metadata.build(),
      ),
      this.timeouts.standard,
    );
    if (!response.product) {
      throw new BadRequestException('Invalid response from product service');
    }
    return toProductView(response.product);
  }

  @Patch('products/:id')
  @ApiOperation({
    summary: 'Partially update a product. Attributes/images are replace-or-leave-alone.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ description: 'Product not found', type: HttpErrorResponse })
  async updateProduct(@Param('id') id: string, @Body() body: UpdateProductDto) {
    // Proto wraps attributes/images in presence-carrying messages so an absent
    // field (don't touch) is distinguishable from an empty replacement.
    const attributes: AttributesUpdate | undefined =
      body.attributes === undefined ? undefined : { values: body.attributes };
    const images: ImagesUpdate | undefined =
      body.images === undefined ? undefined : { urls: body.images };
    // standard: partial update under one document lock.
    const response = await callGrpc<UpdateProductResponse>(
      this.products.service.updateProduct(
        {
          productId: id,
          name: body.name,
          description: body.description,
          category: body.category,
          price: body.price
            ? { amountMinor: body.price.amountMinor, currency: body.price.currency }
            : undefined,
          attributes,
          images,
          isActive: body.isActive,
        },
        this.metadata.build(),
      ),
      this.timeouts.standard,
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product (hard delete).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Product deleted.' })
  async deleteProduct(@Param('id') id: string): Promise<void> {
    // fast: single-document delete.
    await callGrpc<DeleteProductResponse>(
      this.products.service.deleteProduct({ productId: id }, this.metadata.build()),
      this.timeouts.fast,
    );
  }

  @Post('products/:id/adjust-stock')
  @ApiOperation({ summary: 'Admin restock (positive delta) or decrement (negative delta).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ description: 'Product not found', type: HttpErrorResponse })
  async adjustStock(@Param('id') id: string, @Body() body: AdjustStockDto) {
    // standard: conditional update guarded against negative stock.
    const response = await callGrpc<AdjustStockResponse>(
      this.products.service.adjustStock(
        { productId: id, delta: body.delta },
        this.metadata.build(),
      ),
      this.timeouts.standard,
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }

  // ---- Order admin ------------------------------------------------------

  @Get('orders')
  @ApiOperation({
    summary: 'List all orders across customers (optionally filtered by status/user).',
  })
  @ApiOkResponse({ type: OrderListResponse })
  async listAllOrders(@Query() query: ListAllOrdersQueryDto) {
    // long: unbounded cross-tenant scan with optional filters; worst case
    // walks a growing table.
    const response = await callGrpc<ListAllOrdersResponse>(
      this.orders.service.listAllOrders(
        {
          pagination: { page: query.page, pageSize: query.pageSize },
          status: query.status ? stringToProtoOrderStatus(query.status) : undefined,
          userId: query.userId,
        },
        this.metadata.build(),
      ),
      this.timeouts.long,
    );
    return {
      orders: (response.orders ?? []).map(toOrderView),
      pagination: toPaginationView(response.pagination),
    };
  }

  @Post('orders/:id/ship')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition a CONFIRMED order to SHIPPED.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({ description: 'Order not found', type: HttpErrorResponse })
  async shipOrder(@Param('id') id: string) {
    // standard: state-machine transition + outbox write in one tx.
    const response = await callGrpc<ShipOrderResponse>(
      this.orders.service.shipOrder({ orderId: id }, this.metadata.build()),
      this.timeouts.standard,
    );
    if (!response.order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderView(response.order);
  }

  @Post('orders/:id/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition a SHIPPED order to DELIVERED.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({ description: 'Order not found', type: HttpErrorResponse })
  async deliverOrder(@Param('id') id: string) {
    // standard: state-machine transition + outbox write in one tx.
    const response = await callGrpc<DeliverOrderResponse>(
      this.orders.service.deliverOrder({ orderId: id }, this.metadata.build()),
      this.timeouts.standard,
    );
    if (!response.order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderView(response.order);
  }
}
