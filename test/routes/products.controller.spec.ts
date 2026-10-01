import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsController } from '../../src/routes/products/products.controller';
import { ListProductsQueryDto } from '../../src/routes/products/dto/list-products.query';
import { makeMetadataFactory, makeProductClient, okObs } from './_helpers';

const sampleProduct = {
  id: 'p-1',
  name: 'Thing',
  description: 'desc',
  category: 'cat',
  price: { amountMinor: 1000, currency: 'EUR' },
  stock: { available: 5, reserved: 0 },
  attributes: { color: 'red' },
  images: ['https://example/i.jpg'],
  isActive: true,
  createdAt: { seconds: 1_700_000_000, nanos: 0 },
  updatedAt: { seconds: 1_700_000_000, nanos: 0 },
};

function makeQuery(overrides: Partial<ListProductsQueryDto> = {}): ListProductsQueryDto {
  // Default pagination mirrors what the pipe would synthesise from `?` with
  // no params present (page=1, pageSize=20 via class field initialisers).
  const q = new ListProductsQueryDto();
  Object.assign(q, overrides);
  return q;
}

describe('ProductsController', () => {
  it('lists products with default pagination', async () => {
    const listProducts = okObs({
      products: [sampleProduct],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    const ctrl = new ProductsController(makeProductClient({ listProducts }), makeMetadataFactory());
    const result = await ctrl.list(makeQuery());
    expect(listProducts.mock.calls[0][0]).toMatchObject({ pagination: { page: 1, pageSize: 20 } });
    expect(result.products[0]).toMatchObject({
      id: 'p-1',
      price: { amountMinor: 1000, currency: 'EUR' },
      stock: { available: 5, reserved: 0 },
    });
  });

  it('passes filters through to the gRPC request', async () => {
    const listProducts = okObs({ products: [], pagination: undefined });
    const ctrl = new ProductsController(makeProductClient({ listProducts }), makeMetadataFactory());
    await ctrl.list(
      makeQuery({
        page: 2,
        pageSize: 50,
        category: 'books',
        search: 'ring',
        isActive: true,
        minPriceMinor: 100,
        maxPriceMinor: 500,
      }),
    );
    expect(listProducts.mock.calls[0][0]).toEqual({
      pagination: { page: 2, pageSize: 50 },
      category: 'books',
      search: 'ring',
      isActive: true,
      minPriceMinor: 100,
      maxPriceMinor: 500,
    });
  });

  it('rejects an inverted price range', async () => {
    const ctrl = new ProductsController(
      makeProductClient({ listProducts: jest.fn() }),
      makeMetadataFactory(),
    );
    await expect(
      ctrl.list(makeQuery({ minPriceMinor: 500, maxPriceMinor: 100 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gets a product by id', async () => {
    const getProduct = okObs({ product: sampleProduct });
    const ctrl = new ProductsController(makeProductClient({ getProduct }), makeMetadataFactory());
    const result = await ctrl.get('p-1');
    expect(getProduct.mock.calls[0][0]).toEqual({ productId: 'p-1' });
    expect(result.id).toBe('p-1');
  });

  it('404s on missing product', async () => {
    const getProduct = okObs({ product: undefined });
    const ctrl = new ProductsController(makeProductClient({ getProduct }), makeMetadataFactory());
    await expect(ctrl.get('p-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
