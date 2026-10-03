import { ApiProperty } from '@nestjs/swagger';

// Swagger needs concrete classes with decorators to emit schemas. The classes
// below mirror the TS view interfaces in src/common/mappers/*.view.ts one-to-one
// so the generated OpenAPI document matches what controllers actually return.
// Keeping them side-by-side with the view interfaces (instead of trying to
// annotate the interfaces directly) preserves the clean separation between the
// REST wire shape and the proto types feeding it.

const ISO_DATE_EXAMPLE = '2026-10-03T12:34:56.000Z';

export class MoneyResponse {
  @ApiProperty({ example: 1999, description: 'Amount in integer minor units (e.g. cents)' })
  amountMinor!: number;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
  currency!: string;
}

export class PaginationResponse {
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) pageSize!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
}

// ── users ────────────────────────────────────────────────────────────────

export class UserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN'], nullable: true, required: false })
  role!: 'CUSTOMER' | 'ADMIN' | undefined;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) createdAt!: string | null;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) updatedAt!: string | null;
}

export class AuthTokensResponse {
  @ApiProperty({ description: 'RS256-signed JWT. 15 min TTL.' }) accessToken!: string;
  @ApiProperty({ description: 'Opaque rotating refresh token. Send to /auth/refresh.' })
  refreshToken!: string;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE })
  accessTokenExpiresAt!: string | null;
}

export class AddressResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ nullable: true, required: false }) label!: string | null;
  @ApiProperty() street!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ nullable: true, required: false }) state!: string | null;
  @ApiProperty() postalCode!: string;
  @ApiProperty({ example: 'US', description: 'ISO 3166-1 alpha-2 country code' })
  country!: string;
  @ApiProperty({ example: false }) isDefault!: boolean;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) createdAt!: string | null;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) updatedAt!: string | null;
}

export class AddressListResponse {
  @ApiProperty({ type: [AddressResponse] }) addresses!: AddressResponse[];
}

export class RegisterResponse {
  @ApiProperty({ type: UserResponse }) user!: UserResponse;
  @ApiProperty({
    type: AuthTokensResponse,
    nullable: true,
    description: 'Register deliberately mints no tokens — call /auth/login next.',
  })
  tokens!: AuthTokensResponse | null;
}

export class LoginResponse {
  @ApiProperty({ type: UserResponse }) user!: UserResponse;
  @ApiProperty({ type: AuthTokensResponse }) tokens!: AuthTokensResponse;
}

export class RefreshResponse {
  @ApiProperty({ type: AuthTokensResponse }) tokens!: AuthTokensResponse;
}

// ── products ─────────────────────────────────────────────────────────────

export class StockResponse {
  @ApiProperty({ example: 50 }) available!: number;
  @ApiProperty({ example: 2 }) reserved!: number;
}

export class ProductResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: MoneyResponse, nullable: true }) price!: MoneyResponse | null;
  @ApiProperty({ type: StockResponse, nullable: true }) stock!: StockResponse | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { color: 'red', size: 'XL' },
  })
  attributes!: Record<string, string>;
  @ApiProperty({ type: [String], example: ['https://cdn.example.com/p/1.jpg'] })
  images!: string[];
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) createdAt!: string | null;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) updatedAt!: string | null;
}

export class ProductListResponse {
  @ApiProperty({ type: [ProductResponse] }) products!: ProductResponse[];
  @ApiProperty({ type: PaginationResponse, nullable: true })
  pagination!: PaginationResponse | null;
}

// ── orders ───────────────────────────────────────────────────────────────

export class ShippingAddressResponse {
  @ApiProperty() street!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ nullable: true, required: false }) state!: string | null;
  @ApiProperty() postalCode!: string;
  @ApiProperty({ example: 'US' }) country!: string;
}

export class OrderItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ type: MoneyResponse, nullable: true }) unitPrice!: MoneyResponse | null;
  @ApiProperty({ example: 1 }) quantity!: number;
}

export class OrderResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({
    enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    nullable: true,
    required: false,
  })
  status!: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | undefined;
  @ApiProperty({ type: MoneyResponse, nullable: true }) total!: MoneyResponse | null;
  @ApiProperty({ type: ShippingAddressResponse, nullable: true })
  shippingAddress!: ShippingAddressResponse | null;
  @ApiProperty({ type: [OrderItemResponse] }) items!: OrderItemResponse[];
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) createdAt!: string | null;
  @ApiProperty({ nullable: true, example: ISO_DATE_EXAMPLE }) updatedAt!: string | null;
}

export class OrderListResponse {
  @ApiProperty({ type: [OrderResponse] }) orders!: OrderResponse[];
  @ApiProperty({ type: PaginationResponse, nullable: true })
  pagination!: PaginationResponse | null;
}

// ── errors ───────────────────────────────────────────────────────────────

export class ValidationFieldError {
  @ApiProperty({ example: 'email' }) field!: string;
  @ApiProperty({ type: [String], example: ['email must be a valid email address'] })
  errors!: string[];
}

export class HttpErrorResponse {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'Bad Request' }) message!: string | string[];
  @ApiProperty({ required: false, example: 'Validation failed' }) error?: string;
}
