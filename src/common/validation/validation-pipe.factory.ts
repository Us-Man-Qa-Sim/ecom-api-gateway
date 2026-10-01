import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

// Centralised ValidationPipe configuration (GW-6). Lives in a factory so
// bootstrap and e2e tests build the same pipe.
//
// - `whitelist` strips unknown properties: callers can't smuggle fields past
//   the DTO (e.g. role escalation via a stray `role` on the register body).
// - `forbidNonWhitelisted` turns a stray field into an explicit 400 instead
//   of a silent drop — easier for clients to notice typos during development.
// - `transform` runs class-transformer so query strings become numbers and
//   nested DTOs become instances of their class (needed for @ValidateNested).
// - `exceptionFactory` produces a stable `{ statusCode, message, errors[] }`
//   shape so the frontend can show per-field errors without parsing strings.
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) => new BadRequestException(buildValidationErrorBody(errors)),
  });
}

export interface ValidationErrorDetail {
  field: string;
  errors: string[];
}

export interface ValidationErrorBody {
  statusCode: 400;
  error: 'Bad Request';
  message: string;
  errors: ValidationErrorDetail[];
}

export function buildValidationErrorBody(errors: ValidationError[]): ValidationErrorBody {
  const flattened = flatten(errors);
  // Pick the first field-level message for the top-line `message` so curl
  // output stays legible; the full map lives in `errors[]`.
  const first = flattened.find((e) => e.errors.length > 0);
  const summary =
    first !== undefined && first.errors.length > 0
      ? `${first.field}: ${first.errors[0]}`
      : 'Validation failed';
  return {
    statusCode: 400,
    error: 'Bad Request',
    message: summary,
    errors: flattened,
  };
}

// Depth-first flatten of nested ValidationError trees. The `children` branch
// is populated for @ValidateNested fields; we join path segments with "." so
// e.g. a bad `quantity` in `items[0]` surfaces as `items.0.quantity`.
function flatten(errors: ValidationError[], prefix = ''): ValidationErrorDetail[] {
  const out: ValidationErrorDetail[] = [];
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      out.push({ field: path, errors: Object.values(err.constraints) });
    }
    if (err.children && err.children.length > 0) {
      out.push(...flatten(err.children, path));
    }
  }
  return out;
}
