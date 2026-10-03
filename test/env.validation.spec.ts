import type { z } from 'zod';
import { envSchema, validateEnv } from '../src/config/env.validation';

type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

describe('env validation', () => {
  it('applies defaults when the environment is empty (NODE_ENV=test skips JWT_PUBLIC_KEY_PATH)', () => {
    const env = validateEnv({ NODE_ENV: 'test' });
    expect(env.NODE_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.HTTP_HOST).toBe('0.0.0.0');
    expect(env.HTTP_PORT).toBe(3000);
    expect(env.USER_SERVICE_URL).toBe('localhost:5001');
    expect(env.PRODUCT_SERVICE_URL).toBe('localhost:5002');
    expect(env.ORDER_SERVICE_URL).toBe('localhost:5003');
    expect(env.JWT_ISSUER).toBe('user-service');
    expect(env.JWT_AUDIENCE).toBe('ecom-api');
    expect(env.JWT_CLOCK_TOLERANCE_SECONDS).toBe(5);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3001']);
    expect(env.CORS_CREDENTIALS).toBe(false);
    expect(env.BODY_LIMIT_JSON).toBe('100kb');
    expect(env.BODY_LIMIT_URLENCODED).toBe('100kb');
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.SWAGGER_PATH).toBe('docs');
  });

  it('parses SWAGGER_ENABLED case-insensitively (anything but "true" → false)', () => {
    expect(validateEnv({ NODE_ENV: 'test', SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
    expect(validateEnv({ NODE_ENV: 'test', SWAGGER_ENABLED: 'TRUE' }).SWAGGER_ENABLED).toBe(true);
    expect(validateEnv({ NODE_ENV: 'test', SWAGGER_ENABLED: 'no' }).SWAGGER_ENABLED).toBe(false);
  });

  it('parses CORS_ORIGINS as a comma-separated allow-list and trims entries', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      CORS_ORIGINS: 'https://app.example.com, https://staging.example.com ,,',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://app.example.com', 'https://staging.example.com']);
  });

  it('parses CORS_CREDENTIALS case-insensitively', () => {
    expect(validateEnv({ NODE_ENV: 'test', CORS_CREDENTIALS: 'true' }).CORS_CREDENTIALS).toBe(true);
    expect(validateEnv({ NODE_ENV: 'test', CORS_CREDENTIALS: 'TRUE' }).CORS_CREDENTIALS).toBe(true);
    expect(validateEnv({ NODE_ENV: 'test', CORS_CREDENTIALS: 'false' }).CORS_CREDENTIALS).toBe(
      false,
    );
    // Anything else resolves to false — safer default than true.
    expect(validateEnv({ NODE_ENV: 'test', CORS_CREDENTIALS: 'yes' }).CORS_CREDENTIALS).toBe(false);
  });

  it('honours body-limit overrides', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      BODY_LIMIT_JSON: '250kb',
      BODY_LIMIT_URLENCODED: '50kb',
    });
    expect(env.BODY_LIMIT_JSON).toBe('250kb');
    expect(env.BODY_LIMIT_URLENCODED).toBe('50kb');
  });

  it('coerces HTTP_PORT to a number', () => {
    const env = validateEnv({ NODE_ENV: 'test', HTTP_PORT: '8080' });
    expect(env.HTTP_PORT).toBe(8080);
  });

  it('rejects a non-numeric HTTP_PORT', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', HTTP_PORT: 'not-a-number' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('accepts every supported LOG_LEVEL', () => {
    const levels: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
    for (const level of levels) {
      expect(validateEnv({ NODE_ENV: 'test', LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
    }
  });

  it('requires JWT_PUBLIC_KEY_PATH outside NODE_ENV=test', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/JWT_PUBLIC_KEY_PATH/);
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_PUBLIC_KEY_PATH/);
  });

  it('accepts JWT_PUBLIC_KEY_PATH in production and honours overrides', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      JWT_PUBLIC_KEY_PATH: '/etc/keys/public.pem',
      JWT_ISSUER: 'issuer-1',
      JWT_AUDIENCE: 'audience-1',
      JWT_CLOCK_TOLERANCE_SECONDS: '10',
    });
    expect(env.JWT_PUBLIC_KEY_PATH).toBe('/etc/keys/public.pem');
    expect(env.JWT_ISSUER).toBe('issuer-1');
    expect(env.JWT_AUDIENCE).toBe('audience-1');
    expect(env.JWT_CLOCK_TOLERANCE_SECONDS).toBe(10);
  });
});
