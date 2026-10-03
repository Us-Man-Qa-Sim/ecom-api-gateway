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
import { callGrpc } from '../../common/grpc-call.util';
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
  @ApiOperation({ summary: 'Fetch one product by id.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ description: 'Product not found', type: HttpErrorResponse })
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
