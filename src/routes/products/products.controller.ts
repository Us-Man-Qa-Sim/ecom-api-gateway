import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type {
  GetProductResponse,
  ListProductsResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import { Public } from '../../auth/decorators/public.decorator';
import { ProductGrpcClient } from '../../grpc/product.client';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { callGrpc, GrpcCallTimeouts } from '../../common/grpc-call.util';
import { toPaginationView, toProductView } from '../../common/mappers/product.view';
import { ListProductsQueryDto } from './dto/list-products.query';
import {
  HttpErrorResponse,
  ProductListResponse,
  ProductResponse,
} from '../../swagger/response-models';

// Public product browse. Admin writes (create/update/delete, AdjustStock) live
// under /admin/products in AdminController so the authorization is obvious
// from the route tree.
@ApiTags('products')
@Controller('products')
@Public()
export class ProductsController {
  constructor(
    private readonly products: ProductGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
    private readonly timeouts: GrpcCallTimeouts,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Browse the public product catalog with filters + pagination.' })
  @ApiOkResponse({ type: ProductListResponse })
  @ApiBadRequestResponse({
    description: 'Invalid filter/pagination parameters',
    type: HttpErrorResponse,
  })
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
    // long: text search over Mongo with pagination; worst case can scan
    // enough documents that the standard profile is too tight.
    const response = await callGrpc<ListProductsResponse>(
      this.products.service.listProducts(
        {
          pagination: { page: query.page, pageSize: query.pageSize },
          category: query.category,
          search: query.search,
          // Public browse never exposes deactivated products.
          isActive: true,
          minPriceMinor: query.minPriceMinor,
          maxPriceMinor: query.maxPriceMinor,
        },
        this.metadata.buildAnonymous(),
      ),
      this.timeouts.long,
    );
    return {
      products: (response.products ?? []).map(toProductView),
      pagination: toPaginationView(response.pagination),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one product by id.' })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId (24 hex chars)',
    example: '665f1c2e8b3a4d0012ab34cd',
  })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ description: 'Product not found', type: HttpErrorResponse })
  async get(@Param('id') id: string) {
    // fast: indexed single-document lookup.
    const response = await callGrpc<GetProductResponse>(
      this.products.service.getProduct({ productId: id }, this.metadata.buildAnonymous()),
      this.timeouts.fast,
    );
    if (!response.product) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(response.product);
  }
}
