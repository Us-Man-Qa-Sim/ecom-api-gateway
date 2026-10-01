import { BadRequestException } from '@nestjs/common';
import { OrderStatus as ProtoOrderStatus } from '@us-man-qa-sim/ecom-contracts/generated/order';
import { AdminController } from '../../src/routes/admin/admin.controller';
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

describe('AdminController', () => {
  describe('createProduct', () => {
    it('coerces the body and calls the product service', async () => {
      const createProduct = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ createProduct }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.createProduct({
        name: 'Thing',
        description: 'desc',
        category: 'cat',
        price: { amountMinor: 1000, currency: 'EUR' },
        initialStock: 5,
        attributes: { color: 'red' },
        images: ['https://example/i.jpg'],
      });
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

    it('rejects a non-3-letter currency', async () => {
      const ctrl = new AdminController(
        makeProductClient({ createProduct: jest.fn() }),
        makeOrderClient({}),
        metadata,
      );
      await expect(
        ctrl.createProduct({
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: { amountMinor: 1000, currency: 'EURO' },
          initialStock: 5,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects negative initialStock', async () => {
      const ctrl = new AdminController(
        makeProductClient({ createProduct: jest.fn() }),
        makeOrderClient({}),
        metadata,
      );
      await expect(
        ctrl.createProduct({
          name: 'Thing',
          description: 'desc',
          category: 'cat',
          price: { amountMinor: 1000, currency: 'EUR' },
          initialStock: -1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
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
      await ctrl.updateProduct('p-1', {
        name: 'New',
        attributes: { color: 'blue' },
        images: ['https://x'],
      });
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
      await ctrl.updateProduct('p-1', { name: 'New' });
      const req = updateProduct.mock.calls[0][0];
      expect(req.attributes).toBeUndefined();
      expect(req.images).toBeUndefined();
    });
  });

  describe('adjustStock', () => {
    it('requires an integer delta', async () => {
      const ctrl = new AdminController(
        makeProductClient({ adjustStock: jest.fn() }),
        makeOrderClient({}),
        metadata,
      );
      await expect(ctrl.adjustStock('p-1', { delta: 'two' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepts a negative delta', async () => {
      const adjustStock = okObs({ product: sampleProduct });
      const ctrl = new AdminController(
        makeProductClient({ adjustStock }),
        makeOrderClient({}),
        metadata,
      );
      await ctrl.adjustStock('p-1', { delta: -3 });
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
      await ctrl.listAllOrders({ status: 'CONFIRMED', userId: 'u-1', page: '1', pageSize: '20' });
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
