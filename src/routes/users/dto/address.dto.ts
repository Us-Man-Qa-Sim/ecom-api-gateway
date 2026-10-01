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
  @IsOptional()
  @IsString()
  @MaxLength(LABEL_MAX)
  label?: string;

  @IsString()
  @IsNotEmpty({ message: 'street is required' })
  @MaxLength(STREET_MAX)
  street!: string;

  @IsString()
  @IsNotEmpty({ message: 'city is required' })
  @MaxLength(CITY_MAX)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(STATE_MAX)
  state?: string;

  @IsString()
  @IsNotEmpty({ message: 'postalCode is required' })
  @MaxLength(POSTAL_MAX)
  postalCode!: string;

  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO 3166-1 alpha-2 code' })
  country!: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;
}

// Partial update — all fields optional, but any provided field is validated.
export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(LABEL_MAX)
  label?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'street must not be empty' })
  @MaxLength(STREET_MAX)
  street?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'city must not be empty' })
  @MaxLength(CITY_MAX)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(STATE_MAX)
  state?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'postalCode must not be empty' })
  @MaxLength(POSTAL_MAX)
  postalCode?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO 3166-1 alpha-2 code' })
  country?: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;
}
