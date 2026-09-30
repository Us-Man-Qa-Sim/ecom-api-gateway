import { SetMetadata } from '@nestjs/common';

// Marks a route (or an entire controller) as skipping JwtAuthGuard. Reserved
// for genuinely unauthenticated endpoints — `/auth/login`, `/auth/register`,
// `/health`, `/products` (browse). Every other route is authenticated by
// default because the guard is registered globally via APP_GUARD.
export const IS_PUBLIC_KEY = 'auth:isPublic';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
