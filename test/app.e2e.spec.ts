import { Controller, Get, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Metadata } from '@grpc/grpc-js';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';
import { of } from 'rxjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Public } from '../src/auth/decorators/public.decorator';
import { applySecurityMiddleware } from '../src/common/security/security.middleware';
import { buildValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { OrderGrpcClient } from '../src/grpc/order.client';
import { ProductGrpcClient } from '../src/grpc/product.client';
import { UserGrpcClient } from '../src/grpc/user.client';

// Full-pipeline test: the real AppModule (so a DI wiring mistake fails here,
// not at container start), the same middleware/pipe wiring as main.ts, and
// only the three gRPC wrappers stubbed. Controller specs call methods
// directly; this one proves the pieces between HTTP and gRPC fit together —
// request-id correlation, ALS identity propagation, guard + role checks.

@Controller('__probe')
@Public()
class ProbeController {
  @Get()
  get(@Req() req: { id?: unknown; headers: Record<string, unknown> }) {
    return { logId: req.id, headerId: req.headers['x-request-id'] };
  }
}

const USER_ID = '6f1c2a8e-3b7d-4c55-9a2e-1d4f7b9c0e11';

describe('api-gateway (e2e)', () => {
  let app: NestExpressApplication;
  let keyDir: string;
  let privateKey: KeyObject;
  const previousKeyPath = process.env.JWT_PUBLIC_KEY_PATH;
  const previousLogLevel = process.env.LOG_LEVEL;

  const getMe = jest.fn((_req: unknown, _meta: Metadata) =>
    of({ user: { id: USER_ID, email: 'a@example.com', firstName: 'A', lastName: 'B', role: 1 } }),
  );
  const login = jest.fn((_req: unknown, _meta: Metadata) => of({}));
  const listProducts = jest.fn((_req: unknown, _meta: Metadata) =>
    of({ products: [], pagination: undefined }),
  );

  async function token(role: 'CUSTOMER' | 'ADMIN'): Promise<string> {
    return new SignJWT({ role })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(USER_ID)
      .setIssuer('user-service')
      .setAudience('ecom-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  beforeAll(async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    keyDir = mkdtempSync(join(tmpdir(), 'gw-e2e-'));
    const keyPath = join(keyDir, 'jwt-public.pem');
    writeFileSync(keyPath, pair.publicKey.export({ type: 'spki', format: 'pem' }));
    process.env.JWT_PUBLIC_KEY_PATH = keyPath;
    process.env.LOG_LEVEL = 'silent';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(UserGrpcClient)
      .useValue({ service: { getMe, login } })
      .overrideProvider(ProductGrpcClient)
      .useValue({ service: { listProducts } })
      .overrideProvider(OrderGrpcClient)
      .useValue({ service: {} })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    applySecurityMiddleware(app, app.get(ConfigService));
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(keyDir, { recursive: true, force: true });
    process.env.JWT_PUBLIC_KEY_PATH = previousKeyPath;
    process.env.LOG_LEVEL = previousLogLevel;
  });

  beforeEach(() => jest.clearAllMocks());

  describe('request id', () => {
    it('mints one id and uses it for logs and the response header', async () => {
      const res = await request(app.getHttpServer()).get('/__probe').expect(200);
      const headerId = res.headers['x-request-id'];
      expect(headerId).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body).toEqual({ logId: headerId, headerId });
    });

    it('keeps a sane client-supplied id and forwards it on gRPC metadata', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-request-id', 'client-abc-123')
        .send({ email: 'a@example.com', password: 'secret-pass' })
        .expect('x-request-id', 'client-abc-123');
      const meta = login.mock.calls[0][1];
      expect(meta.get('x-request-id')).toEqual(['client-abc-123']);
    });

    it('replaces a malformed client id', async () => {
      const res = await request(app.getHttpServer())
        .get('/__probe')
        .set('x-request-id', 'has spaces in it')
        .expect(200);
      expect(res.headers['x-request-id']).not.toBe('has spaces in it');
      expect(res.body.logId).toBe(res.headers['x-request-id']);
    });
  });

  describe('auth + identity forwarding', () => {
    it('rejects an authenticated route without a token', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
      expect(getMe).not.toHaveBeenCalled();
    });

    it('forwards the verified identity as gRPC metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${await token('CUSTOMER')}`)
        .expect(200);
      expect(res.body.id).toBe(USER_ID);
      const meta = getMe.mock.calls[0][1];
      expect(meta.get('x-user-id')).toEqual([USER_ID]);
      expect(meta.get('x-user-role')).toEqual(['CUSTOMER']);
      expect(meta.get('x-request-id')).toEqual([res.headers['x-request-id']]);
    });

    it('returns 403 for a customer on /admin/*', async () => {
      await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${await token('CUSTOMER')}`)
        .expect(403);
    });

    it('maps a malformed upstream response to 502', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'a@example.com', password: 'secret-pass' })
        .expect(502);
    });
  });

  describe('validation', () => {
    it('falls back to default pagination for empty query params', async () => {
      await request(app.getHttpServer()).get('/products?page=&pageSize=').expect(200);
      expect(listProducts.mock.calls[0][0]).toMatchObject({
        pagination: { page: 1, pageSize: 20 },
      });
    });

    it('rejects unknown query params with a field-level 400', async () => {
      const res = await request(app.getHttpServer()).get('/products?bogus=1').expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'bogus' })]);
    });

    it('does not let public callers opt into inactive products', async () => {
      const res = await request(app.getHttpServer()).get('/products?isActive=false').expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'isActive' })]);
      expect(listProducts).not.toHaveBeenCalled();
    });
  });
});
