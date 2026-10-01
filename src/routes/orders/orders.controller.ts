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

// Customer-facing order routes. All authenticated: ownership (list my orders,
// cancel my order) is enforced by the order-service from the x-user-id header.
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrderGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Post()
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
  async cancel(@Param('id') id: string, @Body() body: CancelOrderDto) {
    const response = await callGrpc<CancelOrderResponse>(
      this.orders.service.cancelOrder(
        { orderId: id, reason: body.reason },
        this.metadata.build(),
      ),
    );
    if (!response.order) {
      throw new BadRequestException('Invalid response from order service');
    }
    return toOrderView(response.order);
  }
}
