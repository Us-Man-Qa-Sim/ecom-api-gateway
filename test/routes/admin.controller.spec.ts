import { OrderStatus as ProtoOrderStatus } from '@us-man-qa-sim/ecom-contracts/generated/order';
import { AdminController } from '../../src/routes/admin/admin.controller';
import {
  AdjustStockDto,
  CreateProductDto,
  UpdateProductDto,
} from '../../src/routes/admin/dto/product-admin.dto';
import { ListAllOrdersQueryDto } from '../../src/routes/orders/dto/list-orders.query';
import { MoneyDto } from '../../src/common/dto/money.dto';
import { makeMetadataFactory, makeOrderClient, makeProductClient, okObs } from './_helpers';

const metadata = makeMetadataFactory({ userId: 'admin-1', role: 'ADMIN' });

const sampleProduct = {
  id: 'p-1',
  name: 'Thing',
  description: 'desc',
  category: 'cat',
  price: { amountMinor: 1000, currency: 'EUR' },
  stock: { available: 5, reserved: 0 },
  attributes: {},
  images: [],
  isActive: true,
  createdAt: undefined,
  updatedAt: undefined,
};

const sampleOrder = {
  id: 'o-1',
  userId: 'u-1',
  status: ProtoOrderStatus.ORDER_STATUS_CONFIRMED,
  total: { amountMinor: 1000, currency: 'EUR' },
  shippingAddress: undefined,
  items: [],
  createdAt: undefined,
  updatedAt: undefined,
};

function moneyDto(amountMinor: number, currency: string): MoneyDto {
  const m = new MoneyDto();
  m.amountMinor = amountMinor;
  m.currency = currency;
  return m;
}

function createProductDto(data: {
  name: string;
  description: string;
  category: string;
  price: MoneyDto;
  initialStock: number;
  attributes?: Record<string, string>;
  images?: string[];
}): CreateProductDto {
  const dto = new CreateProductDto();
  Object.assign(dto, data);
  return dto;
}

function updateProductDto(data: Partial<UpdateProductDto>): UpdateProductDto {
  const dto = new UpdateProductDto();
  Object.assign(dto, data);
  return dto;
}

function adjustStockDto(delta: number): AdjustStockDto {
  const dto = new AdjustStockDto();
  dto.delta = delta;
  return dto;
}

function listAllOrdersQueryDto(overrides: Partial<ListAllOrdersQueryDto> = {}): ListAllOrdersQueryDto {
  const q = new ListAllOrdersQueryDto();
  Object.assign(q, overrides);
  return q;
}

describe('AdminController', () => {
  describe('createProduct', () => {
    it('maps the DTO through to the product service', async () => {
      const createProduct = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ createProduct }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.createProduct(
        createProductDto({
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: moneyDto(1000, 'EUR'),
          initialStock: 5,
          attributes: { color: 'red' },
          images: ['https://example/i.jpg'],
        }),
      );
      expect(createProduct.mock.calls[0][0]).toEqual({
        name: 'Thing',
        description: 'desc',
        category: 'cat',
        price: { amountMinor: 1000, currency: 'EUR' },
        initialStock: 5,
        attributes: { color: 'red' },
        images: ['https://example/i.jpg'],
      });
    });

    it('defaults attributes and images when omitted', async () => {
      const createProduct = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ createProduct }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.createProduct(
        createProductDto({
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: moneyDto(1000, 'EUR'),
          initialStock: 5,
        }),
      );
      expect(createProduct.mock.calls[0][0]).toMatchObject({ attributes: {}, images: [] });
    });
  });

  describe('updateProduct', () => {
    it('wraps attributes and images in presence messages', async () => {
      const updateProduct = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ updateProduct }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.updateProduct(
        'p-1',
        updateProductDto({
          name: 'New',
          attributes: { color: 'blue' },
          images: ['https://x'],
        }),
      );
      expect(updateProduct.mock.calls[0][0]).toMatchObject({
        productId: 'p-1',
        name: 'New',
        attributes: { values: { color: 'blue' } },
        images: { urls: ['https://x'] },
      });
    });

    it('omits attributes/images when the client did not pass them', async () => {
      const updateProduct = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ updateProduct }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.updateProduct('p-1', updateProductDto({ name: 'New' }));
      const req = updateProduct.mock.calls[0][0];
      expect(req.attributes).toBeUndefined();
      expect(req.images).toBeUndefined();
    });
  });

  describe('adjustStock', () => {
    it('accepts a negative delta', async () => {
      const adjustStock = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ adjustStock }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.adjustStock('p-1', adjustStockDto(-3));
      expect(adjustStock.mock.calls[0][0]).toEqual({ productId: 'p-1', delta: -3 });
    });
  });

  describe('listAllOrders', () => {
    it('passes status and userId through', async () => {
      const listAllOrders = okObs({
        orders: [sampleOrder],
        pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      });
      const ctrl = new AdminController(
        makeProductClient({}),
        makeOrderClient({ listAllOrders }),
        metadata,
      );
      await ctrl.listAllOrders(
        listAllOrdersQueryDto({
          status: 'CONFIRMED',
          userId: 'u-1',
          page: 1,
          pageSize: 20,
        }),
      );
      expect(listAllOrders.mock.calls[0][0]).toEqual({
        pagination: { page: 1, pageSize: 20 },
        status: ProtoOrderStatus.ORDER_STATUS_CONFIRMED,
        userId: 'u-1',
      });
    });
  });

  describe('ship/deliver', () => {
    it('ships an order', async () => {
      const shipOrder = okObs({ order: sampleOrder });
      const ctrl = new AdminController(
        makeProductClient({}),
        makeOrderClient({ shipOrder }),
        metadata,
      );
      const result = await ctrl.shipOrder('o-1');
      expect(result.status).toBe('CONFIRMED');
      expect(shipOrder.mock.calls[0][0]).toEqual({ orderId: 'o-1' });
    });

    it('delivers an order', async () => {
      const deliverOrder = okObs({ order: sampleOrder });
      const ctrl = new AdminController(
        makeProductClient({}),
        makeOrderClient({ deliverOrder }),
        metadata,
      );
      await ctrl.deliverOrder('o-1');
      expect(deliverOrder.mock.calls[0][0]).toEqual({ orderId: 'o-1' });
    });
  });
});
