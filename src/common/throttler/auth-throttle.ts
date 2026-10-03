import { Throttle } from '@nestjs/throttler';

// GW-8: tighter budget for credential-handling endpoints (login, register,
// refresh). These are the brute-force / token-stuffing surface, so they get
// a far smaller allowance than the global baseline. Expressed as a literal
// because `@Throttle` is a decorator — it runs at class-load time, before
// Nest's DI container exists, so it cannot read ConfigService. Change here if
// the policy shifts; operators also still have the baseline knobs via
// THROTTLE_TTL_MS / THROTTLE_LIMIT for everything else.
export const AUTH_THROTTLE_LIMIT = 10;
export const AUTH_THROTTLE_TTL_MS = 60_000;

export const AuthThrottle = (): MethodDecorator & ClassDecorator =>
  Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } });
