import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { toIntOrOriginal } from './transforms';

// Reusable base for every `?page=&pageSize=` list endpoint. Controllers that
// need additional filter params extend this class with their own decorated
// fields (`@IsOptional() @IsString() category?: string;` etc).
//
// `pageSize` is capped at 100 to match the single source of truth that used to
// live in the hand-rolled `parsePagination` helper — the downstream services
// still accept whatever the gateway sends, so the gateway owns this ceiling.
const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Transform(toIntOrOriginal)
  @IsInt({ message: 'page must be a positive integer' })
  @Min(1, { message: 'page must be a positive integer' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20, example: 20 })
  @IsOptional()
  @Transform(toIntOrOriginal)
  @IsInt({ message: 'pageSize must be a positive integer' })
  @Min(1, { message: 'pageSize must be a positive integer' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize must be <= ${MAX_PAGE_SIZE}` })
  pageSize: number = 20;
}
