import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
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
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

// `?page=` (present but empty) reaches the transform and would overwrite the
// field initialiser with `undefined`; fall back to the default instead so the
// downstream service never receives an unset page.
const intOrDefault =
  (fallback: number) =>
  (params: TransformFnParams): unknown =>
    toIntOrOriginal(params) ?? fallback;

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Transform(intOrDefault(DEFAULT_PAGE))
  @IsInt({ message: 'page must be a positive integer' })
  @Min(1, { message: 'page must be a positive integer' })
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20, example: 20 })
  @IsOptional()
  @Transform(intOrDefault(DEFAULT_PAGE_SIZE))
  @IsInt({ message: 'pageSize must be a positive integer' })
  @Min(1, { message: 'pageSize must be a positive integer' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize must be <= ${MAX_PAGE_SIZE}` })
  pageSize: number = DEFAULT_PAGE_SIZE;
}
