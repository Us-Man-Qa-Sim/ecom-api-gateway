import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedIdentity } from '../types';

// Extracts the identity JwtAuthGuard attached to req.user. On a @Public()
// route the value is undefined; controllers that use this decorator should
// therefore not also be marked @Public.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedIdentity | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedIdentity }>();
    return req.user;
  },
);
