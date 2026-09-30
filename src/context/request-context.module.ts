import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from './request-context.interceptor';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

@Module({
  providers: [
    RequestContextService,
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to every route so a health probe or a 404 still opens an ALS
    // scope — anything that later touches RequestContextService can rely on
    // the store being present.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
