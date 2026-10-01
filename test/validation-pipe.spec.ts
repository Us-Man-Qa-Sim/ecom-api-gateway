import { BadRequestException } from '@nestjs/common';
import { buildValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { RegisterDto } from '../src/routes/auth/dto/auth.dto';
import { CreateAddressDto } from '../src/routes/users/dto/address.dto';
import { ListProductsQueryDto } from '../src/routes/products/dto/list-products.query';
import { CreateOrderDto } from '../src/routes/orders/dto/create-order.dto';
import { ListMyOrdersQueryDto } from '../src/routes/orders/dto/list-orders.query';
import { CreateProductDto, UpdateProductDto } from '../src/routes/admin/dto/product-admin.dto';
import { PaginationQueryDto } from '../src/common/dto/pagination-query.dto';

// End-to-end-ish tests that drive the configured ValidationPipe directly
// against each route DTO. These prove the whitelist + transform rules behave
// the way controllers assume, without spinning up HTTP for every case.

const pipe = buildValidationPipe();

async function run<T>(dto: new () => T, value: unknown): Promise<T> {
  return (await pipe.transform(value, {
    type: 'body',
    metatype: dto as unknown as new (...args: unknown[]) => T,
  })) as T;
}

async function runQuery<T>(dto: new () => T, value: unknown): Promise<T> {
  return (await pipe.transform(value, {
    type: 'query',
    metatype: dto as unknown as new (...args: unknown[]) => T,
  })) as T;
}

function errorsOf(payload: unknown): Array<{ field: string; errors: string[] }> {
  const response = (payload as BadRequestException).getResponse();
  if (typeof response !== 'object' || response === null) return [];
  const errors = (response as { errors?: unknown }).errors;
  return (errors ?? []) as Array<{ field: string; errors: string[] }>;
}

async function expectBadRequest(fn: () => Promise<unknown>): Promise<BadRequestException> {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return e as BadRequestException;
  }
  throw new Error('Expected BadRequestException');
}

describe('ValidationPipe', () => {
  describe('RegisterDto', () => {
    it('accepts a well-formed body', async () => {
      const out = await run(RegisterDto, {
        email: 'a@b.com',
        password: 'password-ok',
        firstName: 'A',
        lastName: 'B',
      });
      expect(out).toMatchObject({ email: 'a@b.com' });
    });

    it('rejects missing email with a field-level error', async () => {
      const err = await expectBadRequest(() =>
        run(RegisterDto, { password: 'password-ok', firstName: 'A', lastName: 'B' }),
      );
      const fields = errorsOf(err).map((e) => e.field);
      expect(fields).toContain('email');
    });

    it('rejects a short password', async () => {
      const err = await expectBadRequest(() =>
        run(RegisterDto, { email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B' }),
      );
      expect(errorsOf(err).map((e) => e.field)).toContain('password');
    });

    it('strips unknown fields and reports them as a 400', async () => {
      // forbidNonWhitelisted: unknown fields trigger an error, they are not
      // silently stripped. This is the stricter behaviour clients should see.
      const err = await expectBadRequest(() =>
        run(RegisterDto, {
          email: 'a@b.com',
          password: 'password-ok',
          firstName: 'A',
          lastName: 'B',
          role: 'ADMIN',
        }),
      );
      expect(errorsOf(err).map((e) => e.field)).toContain('role');
    });
  });

  describe('PaginationQueryDto', () => {
    it('coerces string querystring values', async () => {
      const out = await runQuery(PaginationQueryDto, { page: '3', pageSize: '50' });
      expect(out).toEqual({ page: 3, pageSize: 50 });
    });

    it('applies defaults for empty input', async () => {
      const out = await runQuery(PaginationQueryDto, {});
      expect(out).toEqual({ page: 1, pageSize: 20 });
    });

    it('rejects zero', async () => {
      await expectBadRequest(() => runQuery(PaginationQueryDto, { page: '0' }));
    });

    it('rejects non-integer page', async () => {
      await expectBadRequest(() => runQuery(PaginationQueryDto, { page: '1.5' }));
    });

    it('rejects pageSize above 100', async () => {
      await expectBadRequest(() => runQuery(PaginationQueryDto, { pageSize: '101' }));
    });
  });

  describe('CreateAddressDto', () => {
    it('rejects missing required fields', async () => {
      const err = await expectBadRequest(() => run(CreateAddressDto, { street: '1 lane' }));
      const fields = errorsOf(err).map((e) => e.field);
      // city/postalCode/country all missing
      expect(fields).toEqual(expect.arrayContaining(['city', 'postalCode', 'country']));
    });

    it('rejects a 3-letter country code', async () => {
      const err = await expectBadRequest(() =>
        run(CreateAddressDto, {
          street: '1 lane',
          city: 'city',
          postalCode: '00000',
          country: 'FRA',
        }),
      );
      expect(errorsOf(err).map((e) => e.field)).toContain('country');
    });
  });

  describe('ListProductsQueryDto', () => {
    it('coerces string query values', async () => {
      const out = await runQuery(ListProductsQueryDto, {
        page: '2',
        pageSize: '50',
        category: 'books',
        search: 'ring',
        isActive: 'true',
        minPriceMinor: '100',
        maxPriceMinor: '500',
      });
      expect(out).toEqual({
        page: 2,
        pageSize: 50,
        category: 'books',
        search: 'ring',
        isActive: true,
        minPriceMinor: 100,
        maxPriceMinor: 500,
      });
    });

    it('rejects a non-boolean isActive', async () => {
      await expectBadRequest(() => runQuery(ListProductsQueryDto, { isActive: 'yes' }));
    });

    it('treats empty strings as absent for optional filters', async () => {
      const out = await runQuery(ListProductsQueryDto, { category: '', search: '', isActive: '' });
      expect(out).toMatchObject({ category: undefined, search: undefined, isActive: undefined });
    });
  });

  describe('CreateOrderDto', () => {
    it('rejects an empty items array', async () => {
      const err = await expectBadRequest(() =>
        run(CreateOrderDto, { addressId: 'a-1', items: [] }),
      );
      expect(errorsOf(err).map((e) => e.field)).toContain('items');
    });

    it('rejects a non-positive quantity on items[0]', async () => {
      const err = await expectBadRequest(() =>
        run(CreateOrderDto, {
          addressId: 'a-1',
          items: [{ productId: 'p-1', quantity: 0 }],
        }),
      );
      // Nested validation path: items.0.quantity
      expect(errorsOf(err).some((e) => e.field === 'items.0.quantity')).toBe(true);
    });

    it('accepts a minimal valid body and returns typed items', async () => {
      const out = await run(CreateOrderDto, {
        addressId: 'a-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      });
      expect(out.items[0]).toMatchObject({ productId: 'p-1', quantity: 2 });
    });
  });

  describe('ListMyOrdersQueryDto', () => {
    it('rejects an unknown status', async () => {
      await expectBadRequest(() => runQuery(ListMyOrdersQueryDto, { status: 'PAID' }));
    });

    it('allows an empty status (same as absent)', async () => {
      const out = await runQuery(ListMyOrdersQueryDto, { status: '' });
      expect(out.status).toBeUndefined();
    });
  });

  describe('CreateProductDto', () => {
    it('rejects a non-3-letter currency', async () => {
      const err = await expectBadRequest(() =>
        run(CreateProductDto, {
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: { amountMinor: 1000, currency: 'EURO' },
          initialStock: 5,
        }),
      );
      expect(errorsOf(err).some((e) => e.field === 'price.currency')).toBe(true);
    });

    it('rejects negative initialStock', async () => {
      const err = await expectBadRequest(() =>
        run(CreateProductDto, {
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: { amountMinor: 1000, currency: 'EUR' },
          initialStock: -1,
        }),
      );
      expect(errorsOf(err).map((e) => e.field)).toContain('initialStock');
    });

    it('rejects an attributes map that is not string→string', async () => {
      const err = await expectBadRequest(() =>
        run(CreateProductDto, {
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: { amountMinor: 1000, currency: 'EUR' },
          initialStock: 1,
          attributes: { color: 2 },
        }),
      );
      expect(errorsOf(err).map((e) => e.field)).toContain('attributes');
    });
  });

  describe('UpdateProductDto', () => {
    it('allows an empty body', async () => {
      const out = await run(UpdateProductDto, {});
      expect(out).toEqual({});
    });

    it('still validates present fields', async () => {
      const err = await expectBadRequest(() =>
        run(UpdateProductDto, { price: { amountMinor: -1, currency: 'EUR' } }),
      );
      expect(errorsOf(err).some((e) => e.field === 'price.amountMinor')).toBe(true);
    });
  });
});
