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

// Only the config surface needed for GW-1 (HTTP + logging + downstream
// service addresses used by later phases). GW-3/GW-7/GW-8/GW-9 will extend
// this schema with JWT keys, CORS origins, throttler settings and Swagger
// toggles as those tasks land.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: numericString(3000),

  // Downstream gRPC targets (host:port). Wired up in GW-2 when the gRPC
  // clients are added; declared here so compose/env is complete from day one.
  USER_SERVICE_URL: z.string().default('localhost:5001'),
  PRODUCT_SERVICE_URL: z.string().default('localhost:5002'),
  ORDER_SERVICE_URL: z.string().default('localhost:5003'),
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
  return parsed.data;
}
