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

// Config surface for GW-1 → GW-3. GW-7/GW-8/GW-9 will extend this schema with
// CORS origins, throttler settings and Swagger toggles as those tasks land.
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
