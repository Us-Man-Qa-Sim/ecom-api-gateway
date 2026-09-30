import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '../auth/types';
import type { RequestContext } from './request-context';

// Thin injectable wrapper around a module-level AsyncLocalStorage so the
// middleware, interceptor, and any downstream service (in particular
// GrpcMetadataFactory) all share the exact same store instance across the
// async chain of a single HTTP request.
@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return RequestContextService.storage.run(context, callback);
  }

  // Returns undefined when called outside of any request scope (e.g. from a
  // health probe or during bootstrap). Callers that require identity should
  // treat missing metadata as an error rather than silently omitting it.
  get(): RequestContext | undefined {
    return RequestContextService.storage.getStore();
  }

  setIdentity(userId: string, role: Role): void {
    const store = RequestContextService.storage.getStore();
    if (!store) return;
    store.userId = userId;
    store.role = role;
  }
}
