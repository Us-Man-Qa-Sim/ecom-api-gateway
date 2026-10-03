import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches, Min } from 'class-validator';

// Shared money shape — matches `ecom.common.v1.Money`. Integer minor units
// (cents) everywhere; the plan forbids floats/Decimal across the system.
export class MoneyDto {
  @ApiProperty({ example: 1999, minimum: 0, description: 'Non-negative integer minor units' })
  @IsInt({ message: 'amountMinor must be a non-negative integer' })
  @Min(0, { message: 'amountMinor must be a non-negative integer' })
  amountMinor!: number;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;
}
