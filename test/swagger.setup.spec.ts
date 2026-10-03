import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { setupSwagger } from '../src/swagger/swagger.setup';
import { validateEnv } from '../src/config/env.validation';

// A tiny controller gives the generated OpenAPI document at least one path +
// one schema to pin assertions on. It also exercises ApiTags/ApiOperation —
// without those, the spec is almost empty and the test proves little.
class SamplePayload {
  @ApiProperty({ example: 'hello' })
  message!: string;
}

@ApiTags('sample')
@Controller('sample')
class SampleController {
  @Get()
  @ApiOperation({ summary: 'Return a sample payload' })
  // The explicit `type` here is what mounts SamplePayload into
  // components.schemas — without the swc/ts Swagger plugin, Nest cannot infer
  // schemas from TS return types alone.
  @ApiOkResponse({ type: SamplePayload })
  ping(): SamplePayload {
    return { message: 'hello' };
  }
}

@Module({ controllers: [SampleController] })
class SampleModule {}

async function makeApp(overrides: Record<string, string>): Promise<NestExpressApplication> {
  const validated = validateEnv({ NODE_ENV: 'test', ...overrides });
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => validated] }),
      SampleModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  const config = app.get(ConfigService);
  setupSwagger(app, config);
  await app.init();
  return app;
}

describe('setupSwagger (GW-9)', () => {
  describe('enabled by default', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await makeApp({});
    });
    afterAll(async () => {
      await app.close();
    });

    it('serves the OpenAPI JSON at /docs-json', async () => {
      const res = await request(app.getHttpServer()).get('/docs-json');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      // Minimal shape check — the real contract is OpenAPI 3.
      expect(res.body.openapi).toMatch(/^3\./);
    });

    it('includes the API metadata and bearer security scheme', async () => {
      const spec = (await request(app.getHttpServer()).get('/docs-json')).body;
      expect(spec.info.title).toBe('ecom API gateway');
      expect(spec.info.version).toBe('0.1.0');
      expect(spec.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });

    it('declares every route-group tag in a stable order', async () => {
      const spec = (await request(app.getHttpServer()).get('/docs-json')).body;
      const names = (spec.tags as Array<{ name: string }>).map((t) => t.name);
      expect(names).toEqual(['auth', 'users', 'products', 'orders', 'admin', 'health']);
    });

    it('registers paths and schemas emitted by the sample controller', async () => {
      const spec = (await request(app.getHttpServer()).get('/docs-json')).body;
      expect(spec.paths['/sample']).toBeDefined();
      expect(spec.paths['/sample'].get.tags).toContain('sample');
      expect(spec.components.schemas.SamplePayload).toBeDefined();
    });

    it('serves the Swagger UI HTML at /docs', async () => {
      const res = await request(app.getHttpServer()).get('/docs').redirects(1);
      // SwaggerModule may 301 to /docs/ depending on version; follow once and
      // assert on the final body — the UI bundle references swagger-ui.
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/swagger/i);
    });
  });

  describe('env toggles', () => {
    it('does not mount routes when SWAGGER_ENABLED=false', async () => {
      const app = await makeApp({ SWAGGER_ENABLED: 'false' });
      try {
        const res = await request(app.getHttpServer()).get('/docs-json');
        expect(res.status).toBe(404);
      } finally {
        await app.close();
      }
    });

    it('respects SWAGGER_PATH', async () => {
      const app = await makeApp({ SWAGGER_PATH: 'openapi' });
      try {
        const res = await request(app.getHttpServer()).get('/openapi-json');
        expect(res.status).toBe(200);
        expect(res.body.openapi).toMatch(/^3\./);
        // The old path is now empty.
        const missing = await request(app.getHttpServer()).get('/docs-json');
        expect(missing.status).toBe(404);
      } finally {
        await app.close();
      }
    });

    it('normalises a leading slash in SWAGGER_PATH', async () => {
      const app = await makeApp({ SWAGGER_PATH: '/openapi' });
      try {
        const res = await request(app.getHttpServer()).get('/openapi-json');
        expect(res.status).toBe(200);
      } finally {
        await app.close();
      }
    });

    it('returns false from setupSwagger when disabled', async () => {
      const validated = validateEnv({ NODE_ENV: 'test', SWAGGER_ENABLED: 'false' });
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => validated] }),
          SampleModule,
        ],
      }).compile();
      const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
      const mounted = setupSwagger(app, app.get(ConfigService));
      expect(mounted).toBe(false);
      await app.init();
      await app.close();
    });
  });
});
