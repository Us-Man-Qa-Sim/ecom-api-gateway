import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  AUTH_THROTTLE_LIMIT,
  AUTH_THROTTLE_TTL_MS,
  AuthThrottle,
} from '../src/common/throttler/auth-throttle';

// GW-8: integration tests for the global rate limiter. The real wiring lives
// in AppModule but booting the whole thing just to count 429s pulls in gRPC
// clients and JWT verification. A trimmed test module with the same
// ThrottlerModule + APP_GUARD shape is enough — the behaviour under test is
// the guard, not the controllers it protects.

// Baseline throttler for the test is intentionally tiny: 3 requests per
// 60s. That keeps the test fast without racing the TTL.
const BASELINE_LIMIT = 3;
const BASELINE_TTL_MS = 60_000;

@Controller()
class PublicRoutesController {
  @Get('/public')
  publicRoute(): { ok: true } {
    return { ok: true };
  }

  @Get('/auth-sensitive')
  @AuthThrottle()
  authRoute(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: BASELINE_TTL_MS, limit: BASELINE_LIMIT }],
    }),
  ],
  controllers: [PublicRoutesController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class TestThrottlerModule {}

async function makeApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [TestThrottlerModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  // Trust the proxy header so supertest's loopback IP doesn't collide into a
  // single bucket across tests — supertest still uses 127.0.0.1 but this
  // mirrors the production setup (NGINX in front, X-Forwarded-For honoured).
  app.set('trust proxy', 'loopback');
  await app.init();
  return app;
}

describe('ThrottlerGuard (GW-8)', () => {
  describe('global baseline', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await makeApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('allows requests up to the configured limit, then returns 429', async () => {
      const server = app.getHttpServer();

      for (let i = 0; i < BASELINE_LIMIT; i += 1) {
        // Each request from a distinct forwarded IP so earlier tests do not
        // bleed into this one via a shared bucket.
        const res = await request(server)
          .get('/public')
          .set('X-Forwarded-For', '10.0.0.1');
        expect(res.status).toBe(200);
      }

      const blocked = await request(server)
        .get('/public')
        .set('X-Forwarded-For', '10.0.0.1');
      expect(blocked.status).toBe(429);
    });

    it('keys per-IP, so a different client has its own budget', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .get('/public')
        .set('X-Forwarded-For', '10.0.0.2');
      // 10.0.0.2 is fresh; a single call must pass even though 10.0.0.1 is
      // exhausted from the previous test.
      expect(res.status).toBe(200);
    });
  });

  describe('AuthThrottle override', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await makeApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('uses the stricter AUTH_THROTTLE budget on decorated routes', async () => {
      // The baseline in this test module is 3/min, but AuthThrottle hardcodes
      // 10/min — so verify the override is picked up by making sure we get
      // more than BASELINE_LIMIT requests through before any 429.
      const server = app.getHttpServer();
      const ip = '10.0.0.3';

      // BASELINE_LIMIT + 1 would 429 if the baseline were in effect; auth
      // override must let it through because AUTH_THROTTLE_LIMIT (10) >
      // BASELINE_LIMIT (3).
      for (let i = 0; i < BASELINE_LIMIT + 1; i += 1) {
        const res = await request(server)
          .get('/auth-sensitive')
          .set('X-Forwarded-For', ip);
        expect(res.status).toBe(200);
      }
    });

    it('exposes the configured constants for traceability', () => {
      // Belt-and-braces: lock the policy in a test so a casual change to the
      // constants gets noticed in review.
      expect(AUTH_THROTTLE_LIMIT).toBe(10);
      expect(AUTH_THROTTLE_TTL_MS).toBe(60_000);
    });
  });
});
