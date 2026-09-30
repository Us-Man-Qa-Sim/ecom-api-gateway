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
