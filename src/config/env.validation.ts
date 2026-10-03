import { z } from 'zod';

const numericString = (defaultValue: number) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value, ctx) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${value} is not a number` });
        return z.NEVER;
      }
      return parsed;
    });

// CORS allow-list parser. The gateway sits behind NGINX in prod, but direct
// browser access from the Next.js dev server (`http://localhost:3001` by
// default) still has to be CORS-approved. The env var is comma-separated so
// multiple origins (staging + prod + localhost) can be configured in one line.
// Entries are trimmed and empties dropped so trailing commas don't matter.
const corsOriginsSchema = z
  .string()
  .default('http://localhost:3001')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

// Config surface for GW-1 → GW-3 and GW-7. GW-8/GW-9 will extend this schema
// further with throttler settings and Swagger toggles as those tasks land.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: numericString(3000),

  // Downstream gRPC targets (host:port). Consumed by GrpcModule to build one
  // ClientsModule.registerAsync entry per service.
  USER_SERVICE_URL: z.string().default('localhost:5001'),
  PRODUCT_SERVICE_URL: z.string().default('localhost:5002'),
  ORDER_SERVICE_URL: z.string().default('localhost:5003'),

  // JWT verification (GW-3). Public key only — the gateway verifies, it never
  // signs. Issuer/audience must match what user-service embeds in its tokens.
  // Path is optional in `test` (unit tests mock the guard); required otherwise
  // and the app fails fast at boot if the file is missing or not RSA.
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('user-service'),
  JWT_AUDIENCE: z.string().default('ecom-api'),
  // Small skew tolerance so freshly-issued tokens and near-expiry tokens do
  // not bounce when the two hosts' clocks disagree by a few seconds.
  JWT_CLOCK_TOLERANCE_SECONDS: numericString(5),

  // CORS allow-list (GW-7). Comma-separated list of exact-match origins.
  // Default covers the Next.js dev server; staging/prod set their real origins.
  CORS_ORIGINS: corsOriginsSchema,
  // Whether to send Access-Control-Allow-Credentials. Needed if the Next.js
  // client ever stores the refresh token in a cookie (not the current plan,
  // which keeps auth in Authorization headers, but keep the knob available).
  CORS_CREDENTIALS: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),

  // Request-size limits (GW-7). Keep JSON tight — the public API only accepts
  // small payloads (login bodies, order items, address updates). URL-encoded
  // mirrors JSON so stray form posts don't slip past the JSON cap.
  BODY_LIMIT_JSON: z.string().default('100kb'),
  BODY_LIMIT_URLENCODED: z.string().default('100kb'),

  // Rate limiting (GW-8). In-memory store means limits are PER INSTANCE —
  // behind a load balancer with N replicas, a client effectively gets N× the
  // configured budget. That's acceptable here as a defence-in-depth layer; a
  // Redis-backed storage can swap in later without touching routes/guards.
  // Only the baseline is env-driven; stricter per-route limits (e.g. for
  // auth routes) are expressed with @Throttle(AUTH_THROTTLE) using
  // module-level constants since class decorators cannot read ConfigService.
  THROTTLE_TTL_MS: numericString(60_000),
  THROTTLE_LIMIT: numericString(60),

  // OpenAPI / Swagger UI (GW-9). The Next.js client is generated from the
  // emitted spec, so dev defaults to serving the UI at /docs. In production
  // the public gateway can either leave it on (useful for API consumers) or
  // set SWAGGER_ENABLED=false so NGINX doesn't need an allow-list rule.
  SWAGGER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
  // Path (relative to the HTTP root) where the UI is served. The raw JSON
  // spec is served at `${SWAGGER_PATH}-json` by @nestjs/swagger.
  SWAGGER_PATH: z.string().default('docs'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }
  if (parsed.data.NODE_ENV !== 'test' && !parsed.data.JWT_PUBLIC_KEY_PATH) {
    throw new Error(
      'Invalid environment configuration:\n  JWT_PUBLIC_KEY_PATH: required outside NODE_ENV=test',
    );
  }
  return parsed.data;
}
