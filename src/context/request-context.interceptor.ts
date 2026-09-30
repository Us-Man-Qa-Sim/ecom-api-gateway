import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { AuthenticatedIdentity } from '../auth/types';
import { RequestContextService } from './request-context.service';

// Guards run before interceptors, so by the time we get here JwtAuthGuard has
// already attached req.user (unless the route is @Public). We copy the two
// identity fields into the ALS store the middleware opened, so downstream
// gRPC calls pick them up without the controller having to thread `req`.
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly context: RequestContextService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedIdentity }>();
      if (req.user) {
        this.context.setIdentity(req.user.userId, req.user.role);
      }
    }
    return next.handle();
  }
}
