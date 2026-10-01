import { of, throwError } from 'rxjs';
import { Metadata } from '@grpc/grpc-js';
import type { UserServiceClient } from '@us-man-qa-sim/ecom-contracts/generated/user';
import type { ProductServiceClient } from '@us-man-qa-sim/ecom-contracts/generated/product';
import type { OrderServiceClient } from '@us-man-qa-sim/ecom-contracts/generated/order';
import { UserGrpcClient } from '../../src/grpc/user.client';
import { ProductGrpcClient } from '../../src/grpc/product.client';
import { OrderGrpcClient } from '../../src/grpc/order.client';
import { GrpcMetadataFactory } from '../../src/grpc/grpc-metadata.factory';
import type { RequestContextService } from '../../src/context/request-context.service';

// Build a GrpcMetadataFactory that always returns a canned context so each
// test does not have to open an AsyncLocalStorage scope just to call a
// controller method. Both `build()` and `buildAnonymous()` are hit.
export function makeMetadataFactory(
  context: { userId?: string; role?: 'CUSTOMER' | 'ADMIN'; requestId?: string } = {},
): GrpcMetadataFactory {
  const stub: RequestContextService = {
    get: () => ({
      requestId: context.requestId ?? 'req-test',
      userId: context.userId,
      role: context.role,
    }),
    setIdentity: jest.fn(),
    run: (_ctx: unknown, cb: () => unknown) => cb(),
  } as unknown as RequestContextService;
  return new GrpcMetadataFactory(stub);
}

export function makeUserClient(
  overrides: Partial<Record<keyof UserServiceClient, jest.Mock>>,
): UserGrpcClient {
  const client = baseServiceStub(overrides);
  const wrapper = Object.create(UserGrpcClient.prototype) as UserGrpcClient;
  Object.defineProperty(wrapper, 'service', { value: client });
  return wrapper;
}

export function makeProductClient(
  overrides: Partial<Record<keyof ProductServiceClient, jest.Mock>>,
): ProductGrpcClient {
  const client = baseServiceStub(overrides);
  const wrapper = Object.create(ProductGrpcClient.prototype) as ProductGrpcClient;
  Object.defineProperty(wrapper, 'service', { value: client });
  return wrapper;
}

export function makeOrderClient(
  overrides: Partial<Record<keyof OrderServiceClient, jest.Mock>>,
): OrderGrpcClient {
  const client = baseServiceStub(overrides);
  const wrapper = Object.create(OrderGrpcClient.prototype) as OrderGrpcClient;
  Object.defineProperty(wrapper, 'service', { value: client });
  return wrapper;
}

function baseServiceStub<K extends string>(
  overrides: Partial<Record<K, jest.Mock>>,
): Record<K, jest.Mock> {
  // Default every method to reject so an unexpected call surfaces loudly
  // instead of hanging on an unresolved Observable.
  return new Proxy(overrides as Record<K, jest.Mock>, {
    get(target, prop: K | symbol) {
      if (typeof prop === 'symbol') return undefined;
      if (prop in target) return target[prop as K];
      return (): ReturnType<typeof throwError> =>
        throwError(() => new Error(`Unexpected call to ${String(prop)}`));
    },
  });
}

export function okObs<T>(value: T) {
  return jest.fn(() => of(value));
}

export function errObs(code: number, details = 'error') {
  return jest.fn(() => throwError(() => ({ code, details })));
}

// Metadata matcher: accepts Metadata and asserts the given headers.
export function expectMetadata(mock: jest.Mock, headers: Record<string, string>): void {
  const args = mock.mock.calls[0];
  const meta: Metadata = args[1];
  for (const [k, v] of Object.entries(headers)) {
    const got = meta.get(k);
    expect(got[0]?.toString()).toBe(v);
  }
}
