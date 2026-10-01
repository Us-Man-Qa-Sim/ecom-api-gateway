import { Role as ProtoRole } from '@us-man-qa-sim/ecom-contracts/generated/user';
import { OrderStatus as ProtoOrderStatus } from '@us-man-qa-sim/ecom-contracts/generated/order';
import {
  isOrderStatus,
  protoOrderStatusToString,
  protoRoleToString,
  stringToProtoOrderStatus,
  stringToProtoRole,
  timestampToIso,
} from '../src/common/mappers/proto.mapper';

describe('proto mapper', () => {
  describe('timestampToIso', () => {
    it('returns null for undefined', () => {
      expect(timestampToIso(undefined)).toBeNull();
    });

    it('converts seconds + nanos to ISO', () => {
      const iso = timestampToIso({ seconds: 1_700_000_000, nanos: 500_000_000 });
      expect(iso).toBe(new Date(1_700_000_000_000 + 500).toISOString());
    });

    it('coerces string-encoded int64 fields from proto-loader', () => {
      const iso = timestampToIso({
        seconds: '1700000000' as unknown as number,
        nanos: '0' as unknown as number,
      });
      expect(iso).toBe(new Date(1_700_000_000_000).toISOString());
    });

    it('returns null for garbage input', () => {
      const iso = timestampToIso({ seconds: NaN as unknown as number, nanos: 0 });
      expect(iso).toBeNull();
    });
  });

  describe('role conversions', () => {
    it('maps proto Role → string', () => {
      expect(protoRoleToString(ProtoRole.ROLE_CUSTOMER)).toBe('CUSTOMER');
      expect(protoRoleToString(ProtoRole.ROLE_ADMIN)).toBe('ADMIN');
      expect(protoRoleToString(ProtoRole.ROLE_UNSPECIFIED)).toBeUndefined();
      expect(protoRoleToString(undefined)).toBeUndefined();
    });

    it('maps string → proto Role', () => {
      expect(stringToProtoRole('CUSTOMER')).toBe(ProtoRole.ROLE_CUSTOMER);
      expect(stringToProtoRole('ADMIN')).toBe(ProtoRole.ROLE_ADMIN);
    });
  });

  describe('order status conversions', () => {
    it('maps proto OrderStatus → string for every value', () => {
      expect(protoOrderStatusToString(ProtoOrderStatus.ORDER_STATUS_PENDING)).toBe('PENDING');
      expect(protoOrderStatusToString(ProtoOrderStatus.ORDER_STATUS_CONFIRMED)).toBe('CONFIRMED');
      expect(protoOrderStatusToString(ProtoOrderStatus.ORDER_STATUS_SHIPPED)).toBe('SHIPPED');
      expect(protoOrderStatusToString(ProtoOrderStatus.ORDER_STATUS_DELIVERED)).toBe('DELIVERED');
      expect(protoOrderStatusToString(ProtoOrderStatus.ORDER_STATUS_CANCELLED)).toBe('CANCELLED');
      expect(protoOrderStatusToString(ProtoOrderStatus.ORDER_STATUS_UNSPECIFIED)).toBeUndefined();
    });

    it('maps string → proto OrderStatus for every value', () => {
      expect(stringToProtoOrderStatus('PENDING')).toBe(ProtoOrderStatus.ORDER_STATUS_PENDING);
      expect(stringToProtoOrderStatus('CONFIRMED')).toBe(ProtoOrderStatus.ORDER_STATUS_CONFIRMED);
      expect(stringToProtoOrderStatus('SHIPPED')).toBe(ProtoOrderStatus.ORDER_STATUS_SHIPPED);
      expect(stringToProtoOrderStatus('DELIVERED')).toBe(ProtoOrderStatus.ORDER_STATUS_DELIVERED);
      expect(stringToProtoOrderStatus('CANCELLED')).toBe(ProtoOrderStatus.ORDER_STATUS_CANCELLED);
    });

    it('isOrderStatus accepts only the five canonical strings', () => {
      expect(isOrderStatus('PENDING')).toBe(true);
      expect(isOrderStatus('CONFIRMED')).toBe(true);
      expect(isOrderStatus('pending')).toBe(false);
      expect(isOrderStatus(1)).toBe(false);
      expect(isOrderStatus(undefined)).toBe(false);
    });
  });
});
