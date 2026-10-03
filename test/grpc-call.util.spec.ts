import { ConfigService } from '@nestjs/config';
import { Subject, throwError } from 'rxjs';
import { callGrpc, DEFAULT_GRPC_TIMEOUT_MS, GrpcCallTimeouts } from '../src/common/grpc-call.util';

function stubConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('GrpcCallTimeouts', () => {
  it('falls back to the baked-in defaults when no ConfigService is injected', () => {
    const timeouts = new GrpcCallTimeouts();
    expect(timeouts.fast).toBe(DEFAULT_GRPC_TIMEOUT_MS.fast);
    expect(timeouts.standard).toBe(DEFAULT_GRPC_TIMEOUT_MS.standard);
    expect(timeouts.long).toBe(DEFAULT_GRPC_TIMEOUT_MS.long);
  });

  it('reads configured values from ConfigService', () => {
    const timeouts = new GrpcCallTimeouts(
      stubConfig({
        GRPC_TIMEOUT_FAST_MS: 1_000,
        GRPC_TIMEOUT_STANDARD_MS: 3_000,
        GRPC_TIMEOUT_LONG_MS: 7_500,
      }),
    );
    expect(timeouts.fast).toBe(1_000);
    expect(timeouts.standard).toBe(3_000);
    expect(timeouts.long).toBe(7_500);
  });

  it('falls back when a configured value is non-finite or non-positive', () => {
    // Guards against a misconfigured env silently producing a 0ms deadline
    // that would fail every call instantly. Non-positive and NaN both
    // trigger the fallback.
    const timeouts = new GrpcCallTimeouts(
      stubConfig({
        GRPC_TIMEOUT_FAST_MS: 0,
        GRPC_TIMEOUT_STANDARD_MS: Number.NaN,
        GRPC_TIMEOUT_LONG_MS: -500,
      }),
    );
    expect(timeouts.fast).toBe(DEFAULT_GRPC_TIMEOUT_MS.fast);
    expect(timeouts.standard).toBe(DEFAULT_GRPC_TIMEOUT_MS.standard);
    expect(timeouts.long).toBe(DEFAULT_GRPC_TIMEOUT_MS.long);
  });

  it('falls back when the key is undefined', () => {
    const timeouts = new GrpcCallTimeouts(stubConfig({}));
    expect(timeouts.fast).toBe(DEFAULT_GRPC_TIMEOUT_MS.fast);
  });

  it('exposes a get() lookup keyed by profile name', () => {
    const timeouts = new GrpcCallTimeouts(
      stubConfig({
        GRPC_TIMEOUT_FAST_MS: 11,
        GRPC_TIMEOUT_STANDARD_MS: 22,
        GRPC_TIMEOUT_LONG_MS: 33,
      }),
    );
    expect(timeouts.get('fast')).toBe(11);
    expect(timeouts.get('standard')).toBe(22);
    expect(timeouts.get('long')).toBe(33);
  });
});

describe('callGrpc', () => {
  it('resolves with the first emitted value', async () => {
    const subject = new Subject<string>();
    const promise = callGrpc(subject.asObservable(), 1_000);
    subject.next('ok');
    subject.complete();
    await expect(promise).resolves.toBe('ok');
  });

  it('rejects when the Observable errors (gRPC error shape passes through)', async () => {
    const err = { code: 5, details: 'not found' };
    await expect(
      callGrpc(
        throwError(() => err),
        1_000,
      ),
    ).rejects.toEqual(err);
  });

  it('rejects with a TimeoutError when no value arrives before the deadline', async () => {
    // A Subject that never emits models a stuck downstream. The deadline is
    // deliberately tiny so the test completes well under the Jest timeout.
    const subject = new Subject<unknown>();
    await expect(callGrpc(subject.asObservable(), 10)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
});
