import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { emptyStringToUndefined, toIntOrOriginal } from '../../../common/dto/transforms';

// No `isActive` filter: the public catalog only ever shows active products —
// the controller pins `isActive: true` on every ListProducts call.
export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100, example: 'shoes' })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'running' })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ minimum: 0, example: 1000 })
  @IsOptional()
  @Transform(toIntOrOriginal)
  @IsInt({ message: 'minPriceMinor must be a non-negative integer' })
  @Min(0, { message: 'minPriceMinor must be a non-negative integer' })
  minPriceMinor?: number;

  @ApiPropertyOptional({ minimum: 0, example: 50000 })
  @IsOptional()
  @Transform(toIntOrOriginal)
  @IsInt({ message: 'maxPriceMinor must be a non-negative integer' })
  @Min(0, { message: 'maxPriceMinor must be a non-negative integer' })
  maxPriceMinor?: number;
}
