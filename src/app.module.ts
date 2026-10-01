import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { GrpcModule } from './grpc/grpc.module';
import { RequestContextModule } from './context/request-context.module';
import { HEADER_REQUEST_ID } from './context/request-context';
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
    // RequestContextModule is imported before LoggerModule so its middleware
    // runs first and canonicalises `x-request-id` before pino-http reads it.
    RequestContextModule,
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.LOG_LEVEL ?? 'info',
          transport:
            process.env.NODE_ENV === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
          customProps: () => ({ service: 'api-gateway' }),
          // RequestContextMiddleware canonicalises this header before pino-http
          // sees the request, so log records carry the same id we forward on
          // gRPC metadata to the downstream services. The middleware guarantees
          // the header is a non-empty string; the fallback is only for the
          // narrow window (before middleware runs) where pino calls genReqId.
          genReqId: (req: IncomingMessage) => {
            const value = req.headers[HEADER_REQUEST_ID];
            const resolved = Array.isArray(value) ? value[0] : value;
            return resolved ?? 'unknown';
          },
        },
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
  ],
})
export class AppModule {}
