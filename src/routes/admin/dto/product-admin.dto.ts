import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MoneyDto } from '../../../common/dto/money.dto';
import { IsStringRecord } from '../../../common/dto/validators';

const NAME_MAX = 200;
const DESCRIPTION_MAX = 5_000;
const CATEGORY_MAX = 100;
const IMAGES_MAX = 20;
const IMAGE_URL_MAX = 2_000;

export class CreateProductDto {
  @ApiProperty({ maxLength: NAME_MAX, example: 'Air Zoom Trail' })
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(NAME_MAX)
  name!: string;

  @ApiProperty({ maxLength: DESCRIPTION_MAX })
  @IsString()
  @IsNotEmpty({ message: 'description is required' })
  @MaxLength(DESCRIPTION_MAX)
  description!: string;

  @ApiProperty({ maxLength: CATEGORY_MAX, example: 'shoes' })
  @IsString()
  @IsNotEmpty({ message: 'category is required' })
  @MaxLength(CATEGORY_MAX)
  category!: string;

  @ApiProperty({ type: MoneyDto })
  @ValidateNested()
  @Type(() => MoneyDto)
  @IsObject({ message: 'price must be an object { amountMinor, currency }' })
  price!: MoneyDto;

  @ApiProperty({ minimum: 0, example: 50 })
  @IsInt({ message: 'initialStock must be a non-negative integer' })
  @Min(0, { message: 'initialStock must be a non-negative integer' })
  initialStock!: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { color: 'black', size: 'EU 42' },
  })
  @IsOptional()
  @IsStringRecord({ message: 'attributes must be an object of string→string' })
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ type: [String], maxItems: IMAGES_MAX })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMAGES_MAX, { message: `images must have at most ${IMAGES_MAX} entries` })
  @IsString({ each: true, message: 'images[] must be strings' })
  @MaxLength(IMAGE_URL_MAX, { each: true })
  images?: string[];
}

export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'description must not be empty' })
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ maxLength: CATEGORY_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'category must not be empty' })
  @MaxLength(CATEGORY_MAX)
  category?: string;

  @ApiPropertyOptional({ type: MoneyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  @IsObject({ message: 'price must be an object { amountMinor, currency }' })
  price?: MoneyDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Replace entire attribute map. Omit to leave untouched.',
  })
  @IsOptional()
  @IsStringRecord({ message: 'attributes must be an object of string→string' })
  attributes?: Record<string, string>;

  @ApiPropertyOptional({
    type: [String],
    maxItems: IMAGES_MAX,
    description: 'Replace entire image array. Omit to leave untouched.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMAGES_MAX, { message: `images must have at most ${IMAGES_MAX} entries` })
  @IsString({ each: true, message: 'images[] must be strings' })
  @MaxLength(IMAGE_URL_MAX, { each: true })
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class AdjustStockDto {
  @ApiProperty({
    example: 10,
    description: 'Positive to restock, negative to decrement. Admin-only.',
  })
  @IsInt({ message: 'delta must be an integer' })
  delta!: number;
}
