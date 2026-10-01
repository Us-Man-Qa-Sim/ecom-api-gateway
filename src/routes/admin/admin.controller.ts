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
import { callGrpc } from '../../common/grpc-call.util';
import { toOrderView } from '../../common/mappers/order.view';
import { toPaginationView, toProductView } from '../../common/mappers/product.view';
import { stringToProtoOrderStatus } from '../../common/mappers/proto.mapper';
import {
  AdjustStockDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product-admin.dto';
import { ListAllOrdersQueryDto } from '../orders/dto/list-orders.query';

// Everything under /admin/* requires the ADMIN role. The downstream services
// also enforce their own ownership/role rules; this decorator exists so a
// forgotten downstream check does not silently expose a destructive operation.
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly products: ProductGrpcClient,
    private readonly orders: OrderGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  // ---- Product admin ----------------------------------------------------

  @Post('products')
  async createProduct(@Body() body: CreateProductDto) {
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
    );
    if (!response.product) {
      throw new BadRequestException('Invalid response from product service');
    }
    return toProductView(response.product);
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: UpdateProductDto) {
    // Proto wraps attributes/images in presence-carrying messages so an absent
    // field (don't touch) is distinguishable from an empty replacement.
    const attributes: AttributesUpdate | undefined =
      body.attributes === undefined ? undefined : { values: body.attributes };
    const images: ImagesUpdate | undefined =
      body.images === undefined ? undefined : { urls: body.images };
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
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(@Param('id') id: string): Promise<void> {
    await callGrpc<DeleteProductResponse>(
      this.products.service.deleteProduct({ productId: id }, this.metadata.build()),
    );
  }

  @Post('products/:id/adjust-stock')
  async adjustStock(@Param('id') id: string, @Body() body: AdjustStockDto) {
    const response = await callGrpc<AdjustStockResponse>(
      this.products.service.adjustStock(
        { productId: id, delta: body.delta },
        this.metadata.build(),
      ),
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }

  // ---- Order admin ------------------------------------------------------

  @Get('orders')
  async listAllOrders(@Query() query: ListAllOrdersQueryDto) {
    const response = await callGrpc<ListAllOrdersResponse>(
      this.orders.service.listAllOrders(
        {
          pagination: { page: query.page, pageSize: query.pageSize },
          status: query.status ? stringToProtoOrderStatus(query.status) : undefined,
          userId: query.userId,
        },
        this.metadata.build(),
      ),
    );
    return {
      orders: (response.orders ?? []).map(toOrderView),
      pagination: toPaginationView(response.pagination),
    };
  }

  @Post('orders/:id/ship')
  @HttpCode(HttpStatus.OK)
  async shipOrder(@Param('id') id: string) {
    const response = await callGrpc<ShipOrderResponse>(
      this.orders.service.shipOrder({ orderId: id }, this.metadata.build()),
    );
    if (!response.order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderView(response.order);
  }

  @Post('orders/:id/deliver')
  @HttpCode(HttpStatus.OK)
  async deliverOrder(@Param('id') id: string) {
    const response = await callGrpc<DeliverOrderResponse>(
      this.orders.service.deliverOrder({ orderId: id }, this.metadata.build()),
    );
    if (!response.order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderView(response.order);
  }
}
