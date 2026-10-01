import { Role as ProtoRole } from '@us-man-qa-sim/ecom-contracts/generated/user';
import { OrderStatus as ProtoOrderStatus } from '@us-man-qa-sim/ecom-contracts/generated/order';
import type { Role } from '../../auth/types';

// Timestamp isn't re-exported from the contracts package's top-level entry and
// its google.protobuf subpath isn't declared in exports; structural typing is
// sufficient because ts-proto's Timestamp is exactly { seconds; nanos }.
interface Timestamp {
  seconds: number;
  nanos: number;
}

// Shared proto → REST JSON conversions. Keeping Money as integer minor units
// is a cross-cutting rule from the plan ("Money: integer minor units (cents)
// everywhere — no floats, no Decimal"); the REST surface mirrors that.

export function timestampToIso(ts: Timestamp | undefined | null): string | null {
  if (!ts) return null;
  // @grpc/proto-loader may surface int64 fields as strings; coerce defensively.
  const seconds =
    typeof ts.seconds === 'string' ? Number(ts.seconds as unknown as string) : ts.seconds;
  const nanos = typeof ts.nanos === 'string' ? Number(ts.nanos as unknown as string) : ts.nanos;
  if (!Number.isFinite(seconds) || !Number.isFinite(nanos)) return null;
  const millis = seconds * 1000 + Math.trunc(nanos / 1_000_000);
  return new Date(millis).toISOString();
}

export function protoRoleToString(role: ProtoRole | number | undefined): Role | undefined {
  switch (role) {
    case ProtoRole.ROLE_CUSTOMER:
      return 'CUSTOMER';
    case ProtoRole.ROLE_ADMIN:
      return 'ADMIN';
    default:
      return undefined;
  }
}

export function stringToProtoRole(role: Role): ProtoRole {
  return role === 'ADMIN' ? ProtoRole.ROLE_ADMIN : ProtoRole.ROLE_CUSTOMER;
}

// String-literal order status mirrors the server-side enum names (minus the
// ORDER_STATUS_ prefix). The frontend thinks in these strings, not numbers.
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function protoOrderStatusToString(
  status: ProtoOrderStatus | number | undefined,
): OrderStatus | undefined {
  switch (status) {
    case ProtoOrderStatus.ORDER_STATUS_PENDING:
      return 'PENDING';
    case ProtoOrderStatus.ORDER_STATUS_CONFIRMED:
      return 'CONFIRMED';
    case ProtoOrderStatus.ORDER_STATUS_SHIPPED:
      return 'SHIPPED';
    case ProtoOrderStatus.ORDER_STATUS_DELIVERED:
      return 'DELIVERED';
    case ProtoOrderStatus.ORDER_STATUS_CANCELLED:
      return 'CANCELLED';
    default:
      return undefined;
  }
}

export function stringToProtoOrderStatus(status: OrderStatus): ProtoOrderStatus {
  switch (status) {
    case 'PENDING':
      return ProtoOrderStatus.ORDER_STATUS_PENDING;
    case 'CONFIRMED':
      return ProtoOrderStatus.ORDER_STATUS_CONFIRMED;
    case 'SHIPPED':
      return ProtoOrderStatus.ORDER_STATUS_SHIPPED;
    case 'DELIVERED':
      return ProtoOrderStatus.ORDER_STATUS_DELIVERED;
    case 'CANCELLED':
      return ProtoOrderStatus.ORDER_STATUS_CANCELLED;
  }
}
