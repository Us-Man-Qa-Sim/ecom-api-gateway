import { IsInt, Matches, Min } from 'class-validator';

// Shared money shape — matches `ecom.common.v1.Money`. Integer minor units
// (cents) everywhere; the plan forbids floats/Decimal across the system.
export class MoneyDto {
  @IsInt({ message: 'amountMinor must be a non-negative integer' })
  @Min(0, { message: 'amountMinor must be a non-negative integer' })
  amountMinor!: number;

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;
}
