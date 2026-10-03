import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  CancelOrderResponse,
  CreateOrderResponse,
  GetOrderResponse,
  ListMyOrdersResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/order';
import { OrderGrpcClient } from '../../grpc/order.client';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { callGrpc } from '../../common/grpc-call.util';
import { toOrderView } from '../../common/mappers/order.view';
import { toPaginationView } from '../../common/mappers/product.view';
import { stringToProtoOrderStatus } from '../../common/mappers/proto.mapper';
import { CreateOrderDto } from './dto/create-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ListMyOrdersQueryDto } from './dto/list-orders.query';
import { HttpErrorResponse, OrderListResponse, OrderResponse } from '../../swagger/response-models';

// Customer-facing order routes. All authenticated: ownership (list my orders,
// cancel my order) is enforced by the order-service from the x-user-id header.
@ApiTags('orders')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponse,
})
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrderGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Place a new order. Starts PENDING until stock reservation resolves.' })
  @ApiCreatedResponse({ type: OrderResponse })
  async create(@Body() body: CreateOrderDto) {
    const response = await callGrpc<CreateOrderResponse>(
      this.orders.service.createOrder(
        {
          addressId: body.addressId,
          items: body.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
        this.metadata.build(),
      ),
    );
    if (!response.order) {
      throw new BadRequestException('Invalid response from order service');
    }
    return toOrderView(response.order);
  }

  @Get()
  @ApiOperation({ summary: 'List orders owned by the authenticated user.' })
  @ApiOkResponse({ type: OrderListResponse })
  async listMine(@Query() query: ListMyOrdersQueryDto) {
    const response = await callGrpc<ListMyOrdersResponse>(
      this.orders.service.listMyOrders(
        {
          pagination: { page: query.page, pageSize: query.pageSize },
          status: query.status ? stringToProtoOrderStatus(query.status) : undefined,
        },
        this.metadata.build(),
      ),
    );
    return {
      orders: (response.orders ?? []).map(toOrderView),
      pagination: toPaginationView(response.pagination),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one of the caller’s orders by id.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({
    description: 'Order not found or not owned by caller',
    type: HttpErrorResponse,
  })
  async get(@Param('id') id: string) {
    const response = await callGrpc<GetOrderResponse>(
      this.orders.service.getOrder({ orderId: id }, this.metadata.build()),
    );
    if (!response.order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderView(response.order);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order the caller owns (PENDING or CONFIRMED only).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({
    description: 'Order not found or not owned by caller',
    type: HttpErrorResponse,
  })
  async cancel(@Param('id') id: string, @Body() body: CancelOrderDto) {
    const response = await callGrpc<CancelOrderResponse>(
      this.orders.service.cancelOrder({ orderId: id, reason: body.reason }, this.metadata.build()),
    );
    if (!response.order) {
      throw new BadRequestException('Invalid response from order service');
    }
    return toOrderView(response.order);
  }
}
