import { ClientGrpc } from '@nestjs/microservices';
import {
  USER_SERVICE_NAME,
  type UserServiceClient,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import {
  PRODUCT_SERVICE_NAME,
  type ProductServiceClient,
} from '@us-man-qa-sim/ecom-contracts/generated/product';
import {
  ORDER_SERVICE_NAME,
  type OrderServiceClient,
} from '@us-man-qa-sim/ecom-contracts/generated/order';
import { UserGrpcClient } from '../src/grpc/user.client';
import { ProductGrpcClient } from '../src/grpc/product.client';
import { OrderGrpcClient } from '../src/grpc/order.client';
import { GrpcHealthIndicator } from '../src/grpc/grpc-health.indicator';
import { HealthIndicatorService } from '@nestjs/terminus';

// The three wrappers are structurally identical: they resolve the typed
// service handle lazily in onModuleInit and expose it via `.service`. We
// avoid booting the real ClientsModule here because @grpc/grpc-js is loaded
// by @nestjs/microservices with `createRequire(import.meta.url)`, which is
// undefined once swc/jest has rewritten the ESM to CJS — a boot cost the
// unit tests do not need to pay. Real network wiring is exercised end-to-
// end in Phase 10.

function fakeClientGrpc<T>(name: string, service: T): ClientGrpc {
  return {
    getService: jest.fn((requested: string) => {
      expect(requested).toBe(name);
      return service;
    }),
    getClientByServiceName: jest.fn(),
  } as unknown as ClientGrpc;
}

describe('gRPC client wrappers', () => {
  it('UserGrpcClient resolves the UserService handle by the contract name', () => {
    const stub: UserServiceClient = {} as UserServiceClient;
    const wrapper = new UserGrpcClient(fakeClientGrpc(USER_SERVICE_NAME, stub));
    wrapper.onModuleInit();
    expect(wrapper.service).toBe(stub);
  });

  it('ProductGrpcClient resolves the ProductService handle by the contract name', () => {
    const stub: ProductServiceClient = {} as ProductServiceClient;
    const wrapper = new ProductGrpcClient(fakeClientGrpc(PRODUCT_SERVICE_NAME, stub));
    wrapper.onModuleInit();
    expect(wrapper.service).toBe(stub);
  });

  it('OrderGrpcClient resolves the OrderService handle by the contract name', () => {
    const stub: OrderServiceClient = {} as OrderServiceClient;
    const wrapper = new OrderGrpcClient(fakeClientGrpc(ORDER_SERVICE_NAME, stub));
    wrapper.onModuleInit();
    expect(wrapper.service).toBe(stub);
  });
});

describe('GrpcHealthIndicator', () => {
  function stubIndicators(): HealthIndicatorService {
    const state = {
      up: jest.fn(() => ({ ok: true })),
      down: jest.fn((extra) => ({ ok: false, ...extra })),
    };
    return {
      check: jest.fn(() => state),
    } as unknown as HealthIndicatorService;
  }

  function stubClientGrpc(waitBehaviour: 'resolves' | 'rejects'): ClientGrpc {
    const rawClient = {
      waitForReady: (_deadline: Date, cb: (err?: Error) => void) => {
        setImmediate(() => cb(waitBehaviour === 'resolves' ? undefined : new Error('unreachable')));
      },
    };
    return {
      getService: jest.fn(),
      getClientByServiceName: jest.fn(() => rawClient),
    } as unknown as ClientGrpc;
  }

  it('reports up when waitForReady resolves', async () => {
    const indicator = new GrpcHealthIndicator(
      stubIndicators(),
      stubClientGrpc('resolves'),
      stubClientGrpc('resolves'),
      stubClientGrpc('resolves'),
      {} as UserGrpcClient,
      {} as ProductGrpcClient,
      {} as OrderGrpcClient,
    );
    const result = await indicator.check('user_service_grpc', 'user', 500)();
    expect(result).toEqual({ ok: true });
  });

  it('reports down with an error message when waitForReady rejects', async () => {
    const indicator = new GrpcHealthIndicator(
      stubIndicators(),
      stubClientGrpc('rejects'),
      stubClientGrpc('resolves'),
      stubClientGrpc('resolves'),
      {} as UserGrpcClient,
      {} as ProductGrpcClient,
      {} as OrderGrpcClient,
    );
    const result = await indicator.check('user_service_grpc', 'user', 500)();
    expect(result).toEqual({ ok: false, error: 'unreachable' });
  });
});
