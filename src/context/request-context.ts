import type { Role } from '../auth/types';

// Header names the gateway both accepts on the inbound HTTP request (for
// x-request-id) and emits on the outbound gRPC metadata. Kept in one place so
// the middleware, interceptor, and metadata factory stay in sync with the
// downstream services (see user-service/src/identity/identity.util.ts, which
// reads the same three keys).
export const HEADER_REQUEST_ID = 'x-request-id';
export const HEADER_USER_ID = 'x-user-id';
export const HEADER_USER_ROLE = 'x-user-role';

// Mutable per-request context stored inside AsyncLocalStorage. The middleware
// creates it with a request id (the guard-driven identity is filled in later
// by RequestContextInterceptor, once JwtAuthGuard has attached req.user).
export interface RequestContext {
  requestId: string;
  userId?: string;
  role?: Role;
}
