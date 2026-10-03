import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, Observable, timeout } from 'rxjs';

// Named timeout profiles. Picking a profile at the call site forces the
// author to think about the shape of the downstream work:
//   fast     → single-row reads that should always be sub-second (getMe,
//              getProduct, getAddress, …). Anything slower is a signal.
//   standard → most mutations and single-service list calls. The default.
//   long     → calls that fan out to other services (createOrder reads from
//              product + user) or scan a lot of data (admin list queries).
// The actual millisecond values come from env (see env.validation.ts) so a
// slow CI environment or a staging target can relax them without a code
// change.
export type GrpcCallTimeoutProfile = 'fast' | 'standard' | 'long';

// Baseline deadlines used when the gateway boots outside a configured env
// (e.g. unit tests building controllers directly). env.validation.ts carries
// the same defaults so the config path and the raw-constructor path agree.
export const DEFAULT_GRPC_TIMEOUT_MS: Record<GrpcCallTimeoutProfile, number> = {
  fast: 2_000,
  standard: 5_000,
  long: 10_000,
};

// Resolves a profile name to the configured deadline in milliseconds.
// Injected into every controller alongside the gRPC clients so a call site
// reads as `callGrpc(obs, this.timeouts.standard)` — the profile is visible
// at the point of use and reviewers can flag the wrong choice without
// chasing a shared constant through the tree.
@Injectable()
export class GrpcCallTimeouts {
  readonly fast: number;
  readonly standard: number;
  readonly long: number;

  constructor(config?: ConfigService) {
    // ConfigService is optional so a test can `new GrpcCallTimeouts()` without
    // spinning up a module. In production Nest always injects it.
    this.fast = readOr(config, 'GRPC_TIMEOUT_FAST_MS', DEFAULT_GRPC_TIMEOUT_MS.fast);
    this.standard = readOr(config, 'GRPC_TIMEOUT_STANDARD_MS', DEFAULT_GRPC_TIMEOUT_MS.standard);
    this.long = readOr(config, 'GRPC_TIMEOUT_LONG_MS', DEFAULT_GRPC_TIMEOUT_MS.long);
  }

  get(profile: GrpcCallTimeoutProfile): number {
    return this[profile];
  }
}

// Materialises a gRPC call Observable into a Promise with a hard deadline.
// Unsubscribing on timeout cancels the underlying grpc-js call (via the
// unsubscribe handler that @nestjs/microservices registers on the created
// Observable), so a slow downstream cannot pin a gateway request — the
// cancellation surfaces downstream as CANCELLED, upstream as a TimeoutError
// that the GrpcToHttpExceptionFilter maps to 504 Gateway Timeout.
//
// firstValueFrom is the correct terminator for the single-value Observables
// that ts-proto's nestJs clients return (one `next` then `complete`);
// toPromise is deprecated and lastValueFrom would wait for completion for
// no benefit.
export function callGrpc<T>(obs: Observable<T>, timeoutMs: number): Promise<T> {
  return firstValueFrom(obs.pipe(timeout({ each: timeoutMs })));
}

function readOr(config: ConfigService | undefined, key: string, fallback: number): number {
  if (!config) return fallback;
  const value = config.get<number>(key);
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
