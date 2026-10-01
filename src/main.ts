import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as NestLogger, ShutdownSignal } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildValidationPipe } from './common/validation/validation-pipe.factory';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  // Global DTO validation (GW-6). The factory keeps the configuration in one
  // place so e2e tests can bootstrap a Nest app with the same pipe behaviour.
  app.useGlobalPipes(buildValidationPipe());

  const httpHost = process.env.HTTP_HOST ?? '0.0.0.0';
  const httpPort = Number(process.env.HTTP_PORT ?? 3000);

  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);

  await app.listen(httpPort, httpHost);

  const logger = new NestLogger('bootstrap');
  logger.log(`HTTP listening on ${httpHost}:${httpPort}`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
