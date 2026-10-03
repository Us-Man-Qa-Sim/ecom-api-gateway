import { NotFoundException } from '@nestjs/common';
import { OrderStatus as ProtoOrderStatus } from '@us-man-qa-sim/ecom-contracts/generated/order';
import { OrdersController } from '../../src/routes/orders/orders.controller';
import { CreateOrderDto } from '../../src/routes/orders/dto/create-order.dto';
import { CancelOrderDto } from '../../src/routes/orders/dto/cancel-order.dto';
import { ListMyOrdersQueryDto } from '../../src/routes/orders/dto/list-orders.query';
import { makeMetadataFactory, makeOrderClient, makeTimeouts, okObs } from './_helpers';

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

function createOrderDto(data: {
  addressId: string;
  items: Array<{ productId: string; quantity: number }>;
}): CreateOrderDto {
  const dto = new CreateOrderDto();
  dto.addressId = data.addressId;
  dto.items = data.items as CreateOrderDto['items'];
  return dto;
}

function cancelOrderDto(reason?: string): CancelOrderDto {
  const dto = new CancelOrderDto();
  dto.reason = reason;
  return dto;
}

function listMyOrdersQueryDto(overrides: Partial<ListMyOrdersQueryDto> = {}): ListMyOrdersQueryDto {
  const q = new ListMyOrdersQueryDto();
  Object.assign(q, overrides);
  return q;
}

describe('OrdersController', () => {
  describe('create', () => {
    it('maps the request through and returns the order', async () => {
      const createOrder = okObs({ order: sampleOrder });
      const ctrl = new OrdersController(
        makeOrderClient({ createOrder }),
        metadata,
        makeTimeouts(),
      );
      const result = await ctrl.create(
        createOrderDto({
          addressId: 'a-1',
          items: [{ productId: 'p-1', quantity: 2 }],
        }),
      );
      expect(createOrder.mock.calls[0][0]).toEqual({
        addressId: 'a-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      });
      expect(result).toMatchObject({ id: 'o-1', status: 'PENDING' });
    });
  });

  describe('listMine', () => {
    it('passes status filter through as the enum value', async () => {
      const listMyOrders = okObs({ orders: [sampleOrder], pagination: undefined });
      const ctrl = new OrdersController(
        makeOrderClient({ listMyOrders }),
        metadata,
        makeTimeouts(),
      );
      await ctrl.listMine(listMyOrdersQueryDto({ status: 'CONFIRMED' }));
      expect(listMyOrders.mock.calls[0][0]).toMatchObject({
        status: ProtoOrderStatus.ORDER_STATUS_CONFIRMED,
      });
    });

    it('omits status when unset', async () => {
      const listMyOrders = okObs({ orders: [], pagination: undefined });
      const ctrl = new OrdersController(
        makeOrderClient({ listMyOrders }),
        metadata,
        makeTimeouts(),
      );
      await ctrl.listMine(listMyOrdersQueryDto());
      expect(listMyOrders.mock.calls[0][0]).toMatchObject({ status: undefined });
    });
  });

  describe('get', () => {
    it('404s on missing order', async () => {
      const getOrder = okObs({ order: undefined });
      const ctrl = new OrdersController(
        makeOrderClient({ getOrder }),
        metadata,
        makeTimeouts(),
      );
      await expect(ctrl.get('o-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('forwards an optional reason', async () => {
      const cancelOrder = okObs({ order: sampleOrder });
      const ctrl = new OrdersController(
        makeOrderClient({ cancelOrder }),
        metadata,
        makeTimeouts(),
      );
      await ctrl.cancel('o-1', cancelOrderDto('changed mind'));
      expect(cancelOrder.mock.calls[0][0]).toEqual({ orderId: 'o-1', reason: 'changed mind' });
    });

    it('tolerates a missing reason', async () => {
      const cancelOrder = okObs({ order: sampleOrder });
      const ctrl = new OrdersController(
        makeOrderClient({ cancelOrder }),
        metadata,
        makeTimeouts(),
      );
      await ctrl.cancel('o-1', cancelOrderDto());
      expect(cancelOrder.mock.calls[0][0]).toEqual({ orderId: 'o-1', reason: undefined });
    });
  });
});
