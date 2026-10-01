import type { TransformFnParams } from 'class-transformer';

// Shared @Transform helpers for query/body DTOs. Express surfaces every query
// param as a string, so an `@IsInt`-decorated property only works if we coerce
// first. The helpers deliberately return the original value when parsing fails
// so the subsequent class-validator decorator (`@IsInt`, `@IsBoolean`, …)
// produces the field-level 400 instead of a silent NaN.

const NULLISH = new Set<unknown>([undefined, null, '']);

export function toIntOrOriginal({ value }: TransformFnParams): number | unknown {
  if (NULLISH.has(value)) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export function toBooleanOrOriginal({ value }: TransformFnParams): boolean | unknown {
  if (NULLISH.has(value)) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

// Collapses empty strings on optional text query params so `?category=` behaves
// like the param being absent rather than failing `@IsString` or `@MinLength`.
export function emptyStringToUndefined({ value }: TransformFnParams): unknown {
  return value === '' ? undefined : value;
}
