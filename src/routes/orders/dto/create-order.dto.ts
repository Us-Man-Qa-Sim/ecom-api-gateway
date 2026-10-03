import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// `MAX_ITEMS_PER_ORDER` is a defensive bound so a hostile client can't post a
// 1M-item array and bog the order-service down before it even looks at stock.
// Downstream services may enforce their own stricter ceiling.
const MAX_ITEMS_PER_ORDER = 100;
const MAX_QUANTITY_PER_ITEM = 10_000;

export class CreateOrderItemDto {
  @ApiProperty({ format: 'uuid', description: 'Product id to order.' })
  @IsString()
  @IsNotEmpty({ message: 'items[].productId is required' })
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY_PER_ITEM, example: 2 })
  @IsInt({ message: 'items[].quantity must be a positive integer' })
  @Min(1, { message: 'items[].quantity must be a positive integer' })
  @Max(MAX_QUANTITY_PER_ITEM, { message: `items[].quantity must be <= ${MAX_QUANTITY_PER_ITEM}` })
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Caller-owned shipping address id. Snapshotted into the order.',
  })
  @IsString()
  @IsNotEmpty({ message: 'addressId is required' })
  addressId!: string;

  @ApiProperty({
    type: [CreateOrderItemDto],
    minItems: 1,
    maxItems: MAX_ITEMS_PER_ORDER,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'items must be a non-empty array' })
  @ArrayMaxSize(MAX_ITEMS_PER_ORDER, {
    message: `items must have at most ${MAX_ITEMS_PER_ORDER} entries`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
