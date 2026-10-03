import type { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Env } from '../config/env.validation';

// GW-9 — OpenAPI/Swagger UI.
// Centralised so the main bootstrap and the e2e tests can both wire the same
// document without duplicating configuration. Returns `true` when the UI was
// mounted so callers can log/assert, `false` when disabled by env.
export function setupSwagger(app: INestApplication, config: ConfigService<Env, true>): boolean {
  if (!config.get('SWAGGER_ENABLED', { infer: true })) {
    return false;
  }

  const builder = new DocumentBuilder()
    .setTitle('ecom API gateway')
    .setDescription(
      'Public REST surface for the ecom platform. Every endpoint here is a thin ' +
        'façade over an internal gRPC call; see BACKEND_PLAN.md for the architecture.',
    )
    .setVersion('0.1.0')
    // One tag per route group — matches the folders in src/routes/* and the
    // @ApiTags on each controller. Order here fixes the sidebar order in the UI.
    .addTag('auth', 'Registration, login, refresh and logout')
    .addTag('users', 'Current user profile and shipping addresses')
    .addTag('products', 'Public catalog browse')
    .addTag('orders', 'Customer order lifecycle')
    .addTag('admin', 'Admin-only product and order management (role=ADMIN)')
    .addTag('health', 'Liveness and readiness probes')
    // RS256 bearer tokens issued by user-service. @ApiBearerAuth('bearer') on
    // controllers that require auth picks this up.
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token issued by POST /auth/login',
      },
      'bearer',
    );

  const document = SwaggerModule.createDocument(app, builder.build());
  const path = normalisePath(config.get('SWAGGER_PATH', { infer: true }));
  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      // Keep the auth header across page reloads — otherwise every refresh
      // forces re-pasting the token when exploring the UI.
      persistAuthorization: true,
      // Hide the Nest-emitted schemas section by default — too noisy for a
      // first browse of the surface. Users can expand it from the UI.
      defaultModelsExpandDepth: 0,
    },
  });

  return true;
}

// Strip a leading slash so SwaggerModule.setup() handles the path consistently
// regardless of whether the operator wrote `docs` or `/docs` in the env file.
function normalisePath(raw: string): string {
  return raw.replace(/^\/+/, '');
}
