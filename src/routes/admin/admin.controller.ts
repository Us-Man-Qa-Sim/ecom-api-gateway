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
  AdjustStockRequest,
  AdjustStockResponse,
  AttributesUpdate,
  CreateProductRequest,
  CreateProductResponse,
  DeleteProductResponse,
  ImagesUpdate,
  UpdateProductRequest,
  UpdateProductResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import type { Money } from '@us-man-qa-sim/ecom-contracts/generated/common';
import type {
  DeliverOrderResponse,
  ListAllOrdersRequest,
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
import { parsePagination } from '../../common/dto/pagination.dto';
import { isOrderStatus, stringToProtoOrderStatus } from '../../common/mappers/proto.mapper';

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
  async createProduct(@Body() body: unknown) {
    const request = coerceCreateProduct(body);
    const response = await callGrpc<CreateProductResponse>(
      this.products.service.createProduct(request, this.metadata.build()),
    );
    if (!response.product) {
      throw new BadRequestException('Invalid response from product service');
    }
    return toProductView(response.product);
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: unknown) {
    const request = coerceUpdateProduct(id, body);
    const response = await callGrpc<UpdateProductResponse>(
      this.products.service.updateProduct(request, this.metadata.build()),
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
  async adjustStock(@Param('id') id: string, @Body() body: unknown) {
    const request = coerceAdjustStock(id, body);
    const response = await callGrpc<AdjustStockResponse>(
      this.products.service.adjustStock(request, this.metadata.build()),
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }

  // ---- Order admin ------------------------------------------------------

  @Get('orders')
  async listAllOrders(@Query() query: Record<string, unknown>) {
    const pagination = parsePagination(query);
    const statusRaw = query['status'];
    let status: number | undefined;
    if (statusRaw !== undefined && statusRaw !== null && statusRaw !== '') {
      if (!isOrderStatus(statusRaw)) {
        throw new BadRequestException(
          'status must be one of PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED',
        );
      }
      status = stringToProtoOrderStatus(statusRaw);
    }
    const userIdRaw = query['userId'];
    const userId = typeof userIdRaw === 'string' && userIdRaw.length > 0 ? userIdRaw : undefined;
    const request: ListAllOrdersRequest = { pagination, status, userId };
    const response = await callGrpc<ListAllOrdersResponse>(
      this.orders.service.listAllOrders(request, this.metadata.build()),
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

// ---- Coercers (GW-6 will replace these with class-validator DTOs) --------

function coerceCreateProduct(body: unknown): CreateProductRequest {
  const b = asObject(body);
  return {
    name: requireString(b, 'name'),
    description: requireString(b, 'description'),
    category: requireString(b, 'category'),
    price: requireMoney(b['price']),
    initialStock: requireNonNegativeInt(b, 'initialStock'),
    attributes: optionalAttributes(b['attributes']) ?? {},
    images: optionalStringArray(b['images']) ?? [],
  };
}

function coerceUpdateProduct(productId: string, body: unknown): UpdateProductRequest {
  const b = asObject(body);
  const price = optionalMoney(b['price']);
  const attributesValues = optionalAttributes(b['attributes']);
  const imagesUrls = optionalStringArray(b['images']);
  // Proto wraps attributes/images in presence-carrying messages so an absent
  // field (don't touch) is distinguishable from an empty replacement.
  const attributes: AttributesUpdate | undefined =
    attributesValues === undefined ? undefined : { values: attributesValues };
  const images: ImagesUpdate | undefined =
    imagesUrls === undefined ? undefined : { urls: imagesUrls };
  return {
    productId,
    name: optionalString(b, 'name'),
    description: optionalString(b, 'description'),
    category: optionalString(b, 'category'),
    price,
    attributes,
    images,
    isActive: optionalBoolean(b, 'isActive'),
  };
}

function coerceAdjustStock(productId: string, body: unknown): AdjustStockRequest {
  const b = asObject(body);
  const delta = b['delta'];
  if (!Number.isInteger(delta)) {
    throw new BadRequestException('delta must be an integer');
  }
  return { productId, delta: delta as number };
}

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return value;
}

function requireNonNegativeInt(obj: Record<string, unknown>, field: string): number {
  const value = obj[field];
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return value as number;
}

function optionalBoolean(obj: Record<string, unknown>, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function requireMoney(value: unknown): Money {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('price must be an object { amountMinor, currency }');
  }
  const obj = value as Record<string, unknown>;
  const amountMinor = obj['amountMinor'];
  const currency = obj['currency'];
  if (!Number.isInteger(amountMinor) || (amountMinor as number) < 0) {
    throw new BadRequestException('price.amountMinor must be a non-negative integer');
  }
  if (typeof currency !== 'string' || currency.length !== 3) {
    throw new BadRequestException('price.currency must be a 3-letter ISO 4217 code');
  }
  return { amountMinor: amountMinor as number, currency };
}

function optionalMoney(value: unknown): Money | undefined {
  if (value === undefined || value === null) return undefined;
  return requireMoney(value);
}

function optionalAttributes(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('attributes must be an object of string→string');
  }
  const result: Record<string, string> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new BadRequestException(`attributes.${key} must be a string`);
    }
    result[key] = v;
  }
  return result;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new BadRequestException('images must be an array of strings');
  }
  return value.map((v, i) => {
    if (typeof v !== 'string') {
      throw new BadRequestException(`images[${i}] must be a string`);
    }
    return v;
  });
}
