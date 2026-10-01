import { firstValueFrom, Observable, timeout } from 'rxjs';

// Default call deadline. GW-10 will fold this into a per-call deadline passed
// over gRPC itself; for GW-5 we just use an rxjs timeout so a slow downstream
// cannot pin a request indefinitely.
export const DEFAULT_GRPC_CALL_TIMEOUT_MS = 5_000;

// Materialises a gRPC call Observable into a Promise. ts-proto's nestJs clients
// return Observables with a single `next` and then `complete`; firstValueFrom
// is the correct terminator for that pattern (unlike toPromise/lastValueFrom,
// which complicate the semantics or are deprecated).
export function callGrpc<T>(
  obs: Observable<T>,
  timeoutMs = DEFAULT_GRPC_CALL_TIMEOUT_MS,
): Promise<T> {
  return firstValueFrom(obs.pipe(timeout({ each: timeoutMs })));
}
