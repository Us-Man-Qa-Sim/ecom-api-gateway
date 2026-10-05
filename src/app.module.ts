import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { GrpcModule } from './grpc/grpc.module';
import { RequestContextModule } from './context/request-context.module';
import { HEADER_REQUEST_ID } from './context/request-context';
import { resolveRequestId } from './context/request-context.middleware';
import { RequestContextService } from './context/request-context.service';
import { GrpcToHttpExceptionFilter } from './common/errors/grpc-to-http.filter';
import { AuthRoutesModule } from './routes/auth/auth-routes.module';
import { UsersRoutesModule } from './routes/users/users-routes.module';
import { ProductsRoutesModule } from './routes/products/products-routes.module';
import { OrdersRoutesModule } from './routes/orders/orders-routes.module';
import { AdminRoutesModule } from './routes/admin/admin-routes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    RequestContextModule,
    LoggerModule.forRootAsync({
      imports: [RequestContextModule],
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => ({
        pinoHttp: {
          level: process.env.LOG_LEVEL ?? 'info',
          transport:
            process.env.NODE_ENV === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
          customProps: () => ({ service: 'api-gateway' }),
          mixin: () => {
            const ctx = requestContext.get();
            return ctx ? { correlationId: ctx.requestId } : {};
          },
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const requestId = resolveRequestId(req.headers[HEADER_REQUEST_ID]);
            req.headers[HEADER_REQUEST_ID] = requestId;
            res.setHeader(HEADER_REQUEST_ID, requestId);
            return requestId;
          },
        },
      }),
    }),
    // GW-8: in-memory rate limiting. The `default` throttler applies to every
    // route; auth routes override it with a stricter @Throttle to blunt
    // credential brute-forcing. In-memory means the budget is PER INSTANCE —
    // behind a load balancer with N replicas, a client effectively gets N× the
    // configured limit, which is fine as defence-in-depth; a Redis storage
    // adapter can swap in later without touching the guard or routes.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.getOrThrow<number>('THROTTLE_TTL_MS'),
            limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
          },
        ],
      }),
    }),
    AuthModule,
    GrpcModule,
    HealthModule,
    AuthRoutesModule,
    UsersRoutesModule,
    ProductsRoutesModule,
    OrdersRoutesModule,
    AdminRoutesModule,
  ],
  providers: [
    // Global exception filter — maps gRPC status codes to HTTP responses so
    // every REST route gets consistent error shapes without per-controller
    // UseFilters. GW-6 will add richer error payloads on top of this.
    { provide: APP_FILTER, useClass: GrpcToHttpExceptionFilter },
    // GW-8: ThrottlerGuard as a global APP_GUARD so every HTTP route is
    // covered without per-controller @UseGuards. It runs alongside the
    // JwtAuthGuard (also APP_GUARD) and keys off the request IP by default;
    // the @Public() decorator only exempts JWT, not throttling, so even
    // unauthenticated /auth/* routes stay rate-limited.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
