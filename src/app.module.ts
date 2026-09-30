import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { GrpcModule } from './grpc/grpc.module';
import { RequestContextModule } from './context/request-context.module';
import { HEADER_REQUEST_ID } from './context/request-context';

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
  ],
})
export class AppModule {}
