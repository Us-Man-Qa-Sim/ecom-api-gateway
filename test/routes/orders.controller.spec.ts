import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus as ProtoOrderStatus } from '@us-man-qa-sim/ecom-contracts/generated/order';
import { OrdersController } from '../../src/routes/orders/orders.controller';
import { makeMetadataFactory, makeOrderClient, okObs } from './_helpers';

const sampleOrder = {
  id: 'o-1',
  userId: 'u-1',
  status: ProtoOrderStatus.ORDER_STATUS_PENDING,
  total: { amountMinor: 1000, currency: 'EUR' },
  shippingAddress: {
    street: '1 lane',
    city: 'city',
    state: undefined,
    postalCode: '00000',
    country: 'FR',
  },
  items: [
    {
      id: 'oi-1',
      productId: 'p-1',
      productName: 'Thing',
      unitPrice: { amountMinor: 500, currency: 'EUR' },
      quantity: 2,
    },
  ],
  createdAt: { seconds: 1_700_000_000, nanos: 0 },
  updatedAt: { seconds: 1_700_000_000, nanos: 0 },
};

const metadata = makeMetadataFactory({ userId: 'u-1', role: 'CUSTOMER' });

describe('OrdersController', () => {
  describe('create', () => {
    it('maps the request through and returns the order', async () => {
      const createOrder = okObs({ order: sampleOrder });
      const ctrl = new OrdersController(makeOrderClient({ createOrder }), metadata);
      const result = await ctrl.create({
        addressId: 'a-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      });
      expect(createOrder.mock.calls[0][0]).toEqual({
        addressId: 'a-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      });
      expect(result).toMatchObject({ id: 'o-1', status: 'PENDING' });
    });

    it('rejects missing items', async () => {
      const ctrl = new OrdersController(makeOrderClient({ createOrder: jest.fn() }), metadata);
      await expect(ctrl.create({ addressId: 'a-1', items: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(ctrl.create({ addressId: 'a-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-positive quantity', async () => {
      const ctrl = new OrdersController(makeOrderClient({ createOrder: jest.fn() }), metadata);
      await expect(
        ctrl.create({ addressId: 'a-1', items: [{ productId: 'p-1', quantity: 0 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listMine', () => {
    it('passes status filter through as the enum value', async () => {
      const listMyOrders = okObs({ orders: [sampleOrder], pagination: undefined });
      const ctrl = new OrdersController(makeOrderClient({ listMyOrders }), metadata);
      await ctrl.listMine({ status: 'CONFIRMED' });
      expect(listMyOrders.mock.calls[0][0]).toMatchObject({
        status: ProtoOrderStatus.ORDER_STATUS_CONFIRMED,
      });
    });

    it('rejects unknown status', async () => {
      const ctrl = new OrdersController(makeOrderClient({ listMyOrders: jest.fn() }), metadata);
      await expect(ctrl.listMine({ status: 'PAID' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('get', () => {
    it('404s on missing order', async () => {
      const getOrder = okObs({ order: undefined });
      const ctrl = new OrdersController(makeOrderClient({ getOrder }), metadata);
      await expect(ctrl.get('o-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('forwards an optional reason', async () => {
      const cancelOrder = okObs({ order: sampleOrder });
      const ctrl = new OrdersController(makeOrderClient({ cancelOrder }), metadata);
      await ctrl.cancel('o-1', { reason: 'changed mind' });
      expect(cancelOrder.mock.calls[0][0]).toEqual({ orderId: 'o-1', reason: 'changed mind' });
    });

    it('tolerates a missing body', async () => {
      const cancelOrder = okObs({ order: sampleOrder });
      const ctrl = new OrdersController(makeOrderClient({ cancelOrder }), metadata);
      await ctrl.cancel('o-1', undefined);
      expect(cancelOrder.mock.calls[0][0]).toEqual({ orderId: 'o-1', reason: undefined });
    });
  });
});
