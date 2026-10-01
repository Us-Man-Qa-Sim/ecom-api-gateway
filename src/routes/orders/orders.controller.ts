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
  CancelOrderRequest,
  CancelOrderResponse,
  CreateOrderItemInput,
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderResponse,
  ListMyOrdersRequest,
  ListMyOrdersResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/order';
import { OrderGrpcClient } from '../../grpc/order.client';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { callGrpc } from '../../common/grpc-call.util';
import { toOrderView } from '../../common/mappers/order.view';
import { toPaginationView } from '../../common/mappers/product.view';
import { parsePagination } from '../../common/dto/pagination.dto';
import { isOrderStatus, stringToProtoOrderStatus } from '../../common/mappers/proto.mapper';

// Customer-facing order routes. All authenticated: ownership (list my orders,
// cancel my order) is enforced by the order-service from the x-user-id header.
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrderGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const request = this.coerceCreateOrder(body);
    const response = await callGrpc<CreateOrderResponse>(
      this.orders.service.createOrder(request, this.metadata.build()),
    );
    if (!response.order) {
      throw new BadRequestException('Invalid response from order service');
    }
    return toOrderView(response.order);
  }

  @Get()
  async listMine(@Query() query: Record<string, unknown>) {
    const pagination = parsePagination(query);
    const statusFilter = parseStatusQuery(query['status']);
    const request: ListMyOrdersRequest = {
      pagination,
      status: statusFilter,
    };
    const response = await callGrpc<ListMyOrdersResponse>(
      this.orders.service.listMyOrders(request, this.metadata.build()),
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
  async cancel(@Param('id') id: string, @Body() body: unknown) {
    const b =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const reasonRaw = b['reason'];
    const reason = typeof reasonRaw === 'string' && reasonRaw.length > 0 ? reasonRaw : undefined;
    const request: CancelOrderRequest = { orderId: id, reason };
    const response = await callGrpc<CancelOrderResponse>(
      this.orders.service.cancelOrder(request, this.metadata.build()),
    );
    if (!response.order) {
      throw new BadRequestException('Invalid response from order service');
    }
    return toOrderView(response.order);
  }

  private coerceCreateOrder(body: unknown): CreateOrderRequest {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    const b = body as Record<string, unknown>;
    const addressId = b['addressId'];
    if (typeof addressId !== 'string' || addressId.length === 0) {
      throw new BadRequestException('addressId is required');
    }
    const rawItems = b['items'];
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    const items: CreateOrderItemInput[] = rawItems.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestException(`items[${index}] must be an object`);
      }
      const item = raw as Record<string, unknown>;
      const productId = item['productId'];
      const quantity = item['quantity'];
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new BadRequestException(`items[${index}].productId is required`);
      }
      if (!Number.isInteger(quantity) || (quantity as number) < 1) {
        throw new BadRequestException(`items[${index}].quantity must be a positive integer`);
      }
      return { productId, quantity: quantity as number };
    });
    return { addressId, items };
  }
}

function parseStatusQuery(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (!isOrderStatus(raw)) {
    throw new BadRequestException(
      `status must be one of PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED`,
    );
  }
  return stringToProtoOrderStatus(raw);
}
