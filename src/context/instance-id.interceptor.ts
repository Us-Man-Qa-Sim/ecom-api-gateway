import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { hostname } from 'node:os';
import type { Observable } from 'rxjs';

const HEADER_GATEWAY_INSTANCE = 'x-gateway-instance';
const INSTANCE_ID = hostname();

@Injectable()
export class InstanceIdInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      ctx.switchToHttp().getResponse<Response>().setHeader(HEADER_GATEWAY_INSTANCE, INSTANCE_ID);
    }
    return next.handle();
  }
}
