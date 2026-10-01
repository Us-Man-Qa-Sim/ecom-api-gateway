import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import type {
  GetProductResponse,
  ListProductsRequest,
  ListProductsResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import { Public } from '../../auth/decorators/public.decorator';
import { ProductGrpcClient } from '../../grpc/product.client';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { callGrpc } from '../../common/grpc-call.util';
import { toPaginationView, toProductView } from '../../common/mappers/product.view';
import { parsePagination } from '../../common/dto/pagination.dto';

// Public product browse. Admin writes (create/update/delete, AdjustStock) live
// under /admin/products in AdminController so the authorization is obvious from
// the route tree.
@Controller('products')
@Public()
export class ProductsController {
  constructor(
    private readonly products: ProductGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    const request = this.coerceListRequest(query);
    const response = await callGrpc<ListProductsResponse>(
      this.products.service.listProducts(request, this.metadata.buildAnonymous()),
    );
    return {
      products: (response.products ?? []).map(toProductView),
      pagination: toPaginationView(response.pagination),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const response = await callGrpc<GetProductResponse>(
      this.products.service.getProduct({ productId: id }, this.metadata.buildAnonymous()),
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }

  private coerceListRequest(query: Record<string, unknown>): ListProductsRequest {
    const pagination = parsePagination(query);
    const minPriceMinor = optionalNonNegativeInt(query, 'minPriceMinor');
    const maxPriceMinor = optionalNonNegativeInt(query, 'maxPriceMinor');
    if (
      minPriceMinor !== undefined &&
      maxPriceMinor !== undefined &&
      minPriceMinor > maxPriceMinor
    ) {
      throw new BadRequestException('minPriceMinor must be <= maxPriceMinor');
    }
    return {
      pagination,
      category: optionalString(query, 'category'),
      search: optionalString(query, 'search'),
      isActive: optionalBoolean(query, 'isActive'),
      minPriceMinor,
      maxPriceMinor,
    };
  }
}

function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return value;
}

function optionalBoolean(obj: Record<string, unknown>, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw new BadRequestException(`${field} must be a boolean`);
}

function optionalNonNegativeInt(obj: Record<string, unknown>, field: string): number | undefined {
  const value = obj[field];
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return parsed;
}
