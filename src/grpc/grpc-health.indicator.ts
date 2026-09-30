import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { UserGrpcClient } from './user.client';
import { ProductGrpcClient } from './product.client';
import { OrderGrpcClient } from './order.client';
import { USER_GRPC_PACKAGE, PRODUCT_GRPC_PACKAGE, ORDER_GRPC_PACKAGE } from './grpc-tokens';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { USER_SERVICE_NAME } from '@us-man-qa-sim/ecom-contracts/generated/user';
import { PRODUCT_SERVICE_NAME } from '@us-man-qa-sim/ecom-contracts/generated/product';
import { ORDER_SERVICE_NAME } from '@us-man-qa-sim/ecom-contracts/generated/order';

// grpc-js Client shape exposed by ClientGrpcProxy.getClientByServiceName. Only
// the two methods we actually call are typed; everything else stays `unknown`.
interface RawGrpcClient {
  waitForReady(deadline: Date, callback: (err?: Error) => void): void;
  close?(): void;
}

const DEFAULT_TIMEOUT_MS = 2_000;

interface GrpcTarget {
  key: string;
  serviceName: string;
  grpc: ClientGrpc & {
    getClientByServiceName?<T = unknown>(name: string): T;
  };
}

@Injectable()
export class GrpcHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @Inject(USER_GRPC_PACKAGE) private readonly userClient: ClientGrpc,
    @Inject(PRODUCT_GRPC_PACKAGE) private readonly productClient: ClientGrpc,
    @Inject(ORDER_GRPC_PACKAGE) private readonly orderClient: ClientGrpc,
    // Injected so their onModuleInit runs before the first health probe.
    private readonly _user: UserGrpcClient,
    private readonly _product: ProductGrpcClient,
    private readonly _order: OrderGrpcClient,
  ) {}

  check(key: string, target: 'user' | 'product' | 'order', timeoutMs = DEFAULT_TIMEOUT_MS) {
    return async (): Promise<HealthIndicatorResult> => {
      const indicator = this.indicators.check(key);
      const grpcTarget = this.pickTarget(key, target);
      try {
        await waitForReady(grpcTarget, timeoutMs);
        return indicator.up();
      } catch (err) {
        return indicator.down({ error: err instanceof Error ? err.message : String(err) });
      }
    };
  }

  private pickTarget(key: string, target: 'user' | 'product' | 'order'): GrpcTarget {
    switch (target) {
      case 'user':
        return { key, serviceName: USER_SERVICE_NAME, grpc: this.userClient };
      case 'product':
        return { key, serviceName: PRODUCT_SERVICE_NAME, grpc: this.productClient };
      case 'order':
        return { key, serviceName: ORDER_SERVICE_NAME, grpc: this.orderClient };
    }
  }
}

// Reaches through the Nest proxy to the raw grpc-js client and calls its
// waitForReady, which resolves once the channel has an active connection or
// fails on deadline. This is the cheapest liveness signal we can get without
// implementing grpc.health.v1.Health on every service (a later task).
function waitForReady(target: GrpcTarget, timeoutMs: number): Promise<void> {
  const getRawClient = target.grpc.getClientByServiceName;
  if (typeof getRawClient !== 'function') {
    return Promise.reject(new Error('ClientGrpc.getClientByServiceName is not available'));
  }
  const rawClient = getRawClient.call(target.grpc, target.serviceName) as RawGrpcClient;
  return new Promise<void>((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    rawClient.waitForReady(deadline, (err) => (err ? reject(err) : resolve()));
  });
}
