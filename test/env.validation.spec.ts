import type { z } from 'zod';
import { envSchema, validateEnv } from '../src/config/env.validation';

type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];

describe('env validation', () => {
  it('applies defaults when the environment is empty', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.HTTP_HOST).toBe('0.0.0.0');
    expect(env.HTTP_PORT).toBe(3000);
    expect(env.USER_SERVICE_URL).toBe('localhost:5001');
    expect(env.PRODUCT_SERVICE_URL).toBe('localhost:5002');
    expect(env.ORDER_SERVICE_URL).toBe('localhost:5003');
  });

  it('coerces HTTP_PORT to a number', () => {
    const env = validateEnv({ HTTP_PORT: '8080' });
    expect(env.HTTP_PORT).toBe(8080);
  });

  it('rejects a non-numeric HTTP_PORT', () => {
    expect(() => validateEnv({ HTTP_PORT: 'not-a-number' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('accepts every supported LOG_LEVEL', () => {
    const levels: LogLevel[] = [
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
      'silent',
    ];
    for (const level of levels) {
      expect(validateEnv({ LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
    }
  });
});
