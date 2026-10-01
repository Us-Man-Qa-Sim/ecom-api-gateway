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
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(NAME_MAX)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'description is required' })
  @MaxLength(DESCRIPTION_MAX)
  description!: string;

  @IsString()
  @IsNotEmpty({ message: 'category is required' })
  @MaxLength(CATEGORY_MAX)
  category!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  @IsObject({ message: 'price must be an object { amountMinor, currency }' })
  price!: MoneyDto;

  @IsInt({ message: 'initialStock must be a non-negative integer' })
  @Min(0, { message: 'initialStock must be a non-negative integer' })
  initialStock!: number;

  @IsOptional()
  @IsStringRecord({ message: 'attributes must be an object of string→string' })
  attributes?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMAGES_MAX, { message: `images must have at most ${IMAGES_MAX} entries` })
  @IsString({ each: true, message: 'images[] must be strings' })
  @MaxLength(IMAGE_URL_MAX, { each: true })
  images?: string[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(NAME_MAX)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'description must not be empty' })
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'category must not be empty' })
  @MaxLength(CATEGORY_MAX)
  category?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  @IsObject({ message: 'price must be an object { amountMinor, currency }' })
  price?: MoneyDto;

  @IsOptional()
  @IsStringRecord({ message: 'attributes must be an object of string→string' })
  attributes?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMAGES_MAX, { message: `images must have at most ${IMAGES_MAX} entries` })
  @IsString({ each: true, message: 'images[] must be strings' })
  @MaxLength(IMAGE_URL_MAX, { each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class AdjustStockDto {
  @IsInt({ message: 'delta must be an integer' })
  delta!: number;
}
