import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

// Custom decorator for free-form `string → string` records (proto `map<string,
// string>`). class-validator has no built-in that expresses "object whose
// values are all strings"; `@IsObject + @IsString({ each: true })` works on
// arrays but not Record<string, V>.
export function IsStringRecord(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isStringRecord',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
          return Object.values(value as Record<string, unknown>).every(
            (v) => typeof v === 'string',
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an object with string values`;
        },
      },
    });
  };
}
