import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Address fields mirror the proto `Address` message. `country` is the 2-letter
// ISO 3166-1 alpha-2 code so the frontend/user-service can agree on a single
// canonical representation; postalCode stays a free string because formats
// vary wildly by country.
const STREET_MAX = 200;
const CITY_MAX = 100;
const STATE_MAX = 100;
const POSTAL_MAX = 20;
const LABEL_MAX = 50;

export class CreateAddressDto {
  @ApiPropertyOptional({ maxLength: LABEL_MAX, example: 'home' })
  @IsOptional()
  @IsString()
  @MaxLength(LABEL_MAX)
  label?: string;

  @ApiProperty({ maxLength: STREET_MAX, example: '221B Baker Street' })
  @IsString()
  @IsNotEmpty({ message: 'street is required' })
  @MaxLength(STREET_MAX)
  street!: string;

  @ApiProperty({ maxLength: CITY_MAX, example: 'London' })
  @IsString()
  @IsNotEmpty({ message: 'city is required' })
  @MaxLength(CITY_MAX)
  city!: string;

  @ApiPropertyOptional({ maxLength: STATE_MAX, example: 'Greater London' })
  @IsOptional()
  @IsString()
  @MaxLength(STATE_MAX)
  state?: string;

  @ApiProperty({ maxLength: POSTAL_MAX, example: 'NW1 6XE' })
  @IsString()
  @IsNotEmpty({ message: 'postalCode is required' })
  @MaxLength(POSTAL_MAX)
  postalCode!: string;

  @ApiProperty({ example: 'GB', description: 'ISO 3166-1 alpha-2 country code' })
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO 3166-1 alpha-2 code' })
  country!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;
}

// Partial update — all fields optional, but any provided field is validated.
export class UpdateAddressDto {
  @ApiPropertyOptional({ maxLength: LABEL_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(LABEL_MAX)
  label?: string;

  @ApiPropertyOptional({ maxLength: STREET_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'street must not be empty' })
  @MaxLength(STREET_MAX)
  street?: string;

  @ApiPropertyOptional({ maxLength: CITY_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'city must not be empty' })
  @MaxLength(CITY_MAX)
  city?: string;

  @ApiPropertyOptional({ maxLength: STATE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(STATE_MAX)
  state?: string;

  @ApiPropertyOptional({ maxLength: POSTAL_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'postalCode must not be empty' })
  @MaxLength(POSTAL_MAX)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'GB' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO 3166-1 alpha-2 code' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;
}
