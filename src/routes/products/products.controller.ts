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
  ListProductsResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import { Public } from '../../auth/decorators/public.decorator';
import { ProductGrpcClient } from '../../grpc/product.client';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { callGrpc } from '../../common/grpc-call.util';
import { toPaginationView, toProductView } from '../../common/mappers/product.view';
import { ListProductsQueryDto } from './dto/list-products.query';

// Public product browse. Admin writes (create/update/delete, AdjustStock) live
// under /admin/products in AdminController so the authorization is obvious
// from the route tree.
@Controller('products')
@Public()
export class ProductsController {
  constructor(
    private readonly products: ProductGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Get()
  async list(@Query() query: ListProductsQueryDto) {
    // Cross-field check — class-validator can express it with a custom
    // decorator but it's one line here and keeps the DTO declarative.
    if (
      query.minPriceMinor !== undefined &&
      query.maxPriceMinor !== undefined &&
      query.minPriceMinor > query.maxPriceMinor
    ) {
      throw new BadRequestException('minPriceMinor must be <= maxPriceMinor');
    }
    const response = await callGrpc<ListProductsResponse>(
      this.products.service.listProducts(
        {
          pagination: { page: query.page, pageSize: query.pageSize },
          category: query.category,
          search: query.search,
          isActive: query.isActive,
          minPriceMinor: query.minPriceMinor,
          maxPriceMinor: query.maxPriceMinor,
        },
        this.metadata.buildAnonymous(),
      ),
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
}
