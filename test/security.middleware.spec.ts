import { Body, Controller, Get, Module, Post, Req } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { applySecurityMiddleware } from '../src/common/security/security.middleware';
import { validateEnv } from '../src/config/env.validation';

// A minimal controller is enough to exercise CORS, Helmet, and the body
// parser limits. We don't need the real app wiring — just an HTTP surface the
// middleware stack can wrap.
@Controller()
class EchoController {
  @Get('/')
  ping(): { ok: true } {
    return { ok: true };
  }

  @Get('/ip')
  ip(@Req() req: { ip?: string }): { ip?: string } {
    return { ip: req.ip };
  }

  @Post('/echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

async function makeApp(env: Record<string, string>): Promise<NestExpressApplication> {
  // Run the raw inputs through the real zod schema so booleans, lists, and
  // the other transforms match what the production bootstrap sees — Nest's
  // ConfigModule only runs `validate` on process.env, not on `load` output.
  const validated = validateEnv({ NODE_ENV: 'test', ...env });
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => validated],
      }),
      EchoModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  const config = app.get(ConfigService);
  applySecurityMiddleware(app, config);
  await app.init();
  return app;
}

describe('applySecurityMiddleware', () => {
  describe('Helmet', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await makeApp({});
    });
    afterAll(async () => {
      await app.close();
    });

    it('sets the standard security headers on every response', async () => {
      const res = await request(app.getHttpServer()).get('/');
      expect(res.status).toBe(200);
      // Helmet defaults — just a few, enough to confirm the middleware is on.
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      // Default CSP; the exact string is Helmet-defined so just assert presence.
      expect(res.headers['content-security-policy']).toBeDefined();
      // Helmet 8 drops X-Powered-By; make sure it isn't leaking back.
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS allow-list', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await makeApp({
        CORS_ORIGINS: 'http://localhost:3001,https://app.example.com',
      });
    });
    afterAll(async () => {
      await app.close();
    });

    it('echoes an allowed origin on preflight', async () => {
      const res = await request(app.getHttpServer())
        .options('/echo')
        .set('Origin', 'https://app.example.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');
      expect(res.status).toBeLessThan(300);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
      expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
    });

    it('omits ACAO when the origin is not in the allow-list', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('Origin', 'https://evil.example.com');
      // The actual request still succeeds (CORS failures are enforced
      // client-side by the browser), but no ACAO means the browser blocks
      // the response from JavaScript.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('passes through requests without an Origin header unchanged', async () => {
      const res = await request(app.getHttpServer()).get('/');
      expect(res.status).toBe(200);
      // No Origin → nothing to echo. Server-to-server / curl path.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not advertise credentials by default', async () => {
      const res = await request(app.getHttpServer())
        .options('/echo')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'POST');
      // CORS_CREDENTIALS defaults to false, so the header must be absent.
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  describe('CORS credentials toggle', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await makeApp({
        CORS_ORIGINS: 'http://localhost:3001',
        CORS_CREDENTIALS: 'true',
      });
    });
    afterAll(async () => {
      await app.close();
    });

    it('advertises credentials when CORS_CREDENTIALS=true', async () => {
      const res = await request(app.getHttpServer())
        .options('/echo')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('request-size limits', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      // Tiny cap keeps the test payload small and fast.
      app = await makeApp({ BODY_LIMIT_JSON: '1kb' });
    });
    afterAll(async () => {
      await app.close();
    });

    it('accepts a payload below the limit', async () => {
      const res = await request(app.getHttpServer())
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send({ hello: 'world' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ hello: 'world' });
    });

    it('rejects a payload above the JSON limit with 413', async () => {
      // 2 KiB string → serialised JSON easily clears the 1 KiB cap.
      const big = 'x'.repeat(2048);
      const res = await request(app.getHttpServer())
        .post('/echo')
        .set('Content-Type', 'application/json')
        .send({ big });
      expect(res.status).toBe(413);
    });
  });

  describe('trust proxy', () => {
    it('ignores X-Forwarded-For by default (client cannot spoof its throttle key)', async () => {
      const app = await makeApp({});
      const res = await request(app.getHttpServer())
        .get('/ip')
        .set('X-Forwarded-For', '203.0.113.9');
      expect(res.body.ip).not.toBe('203.0.113.9');
      await app.close();
    });

    it('uses the forwarded client address when TRUST_PROXY is set', async () => {
      const app = await makeApp({ TRUST_PROXY: '1' });
      const res = await request(app.getHttpServer())
        .get('/ip')
        .set('X-Forwarded-For', '203.0.113.9');
      expect(res.body.ip).toBe('203.0.113.9');
      await app.close();
    });
  });
});
