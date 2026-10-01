import type {
  Order as ProtoOrder,
  OrderItem as ProtoOrderItem,
  ShippingAddress as ProtoShippingAddress,
} from '@us-man-qa-sim/ecom-contracts/generated/order';
import { protoOrderStatusToString, timestampToIso, type OrderStatus } from './proto.mapper';
import type { MoneyView, PaginationView } from './product.view';

export interface ShippingAddressView {
  street: string;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
}

export interface OrderItemView {
  id: string;
  productId: string;
  productName: string;
  unitPrice: MoneyView | null;
  quantity: number;
}

export interface OrderView {
  id: string;
  userId: string;
  status: OrderStatus | undefined;
  total: MoneyView | null;
  shippingAddress: ShippingAddressView | null;
  items: OrderItemView[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OrderListView {
  orders: OrderView[];
  pagination: PaginationView | null;
}

export function toShippingAddressView(
  addr: ProtoShippingAddress | undefined,
): ShippingAddressView | null {
  if (!addr) return null;
  return {
    street: addr.street,
    city: addr.city,
    state: addr.state ?? null,
    postalCode: addr.postalCode,
    country: addr.country,
  };
}

export function toOrderItemView(item: ProtoOrderItem): OrderItemView {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice
      ? { amountMinor: item.unitPrice.amountMinor, currency: item.unitPrice.currency }
      : null,
    quantity: item.quantity,
  };
}

export function toOrderView(order: ProtoOrder): OrderView {
  return {
    id: order.id,
    userId: order.userId,
    status: protoOrderStatusToString(order.status),
    total: order.total
      ? { amountMinor: order.total.amountMinor, currency: order.total.currency }
      : null,
    shippingAddress: toShippingAddressView(order.shippingAddress),
    items: (order.items ?? []).map(toOrderItemView),
    createdAt: timestampToIso(order.createdAt),
    updatedAt: timestampToIso(order.updatedAt),
  };
}
