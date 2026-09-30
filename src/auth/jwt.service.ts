import { createPublicKey, KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, JWTPayload } from 'jose';
import { AuthenticatedIdentity, isRole } from './types';

// user-service signs access tokens with RS256 (see user-service/src/auth/
// jwt.service.ts). The gateway holds only the public key and verifies. Any
// mismatch of alg, issuer, audience or expiry rejects the token.
const ALLOWED_ALG = 'RS256';

@Injectable()
export class JwtService implements OnModuleInit {
  private readonly logger = new Logger(JwtService.name);
  private publicKey!: KeyObject;
  private issuer!: string;
  private audience!: string;
  private clockToleranceSeconds!: number;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const publicKeyPath = this.config.get<string>('JWT_PUBLIC_KEY_PATH');
    if (!publicKeyPath) {
      // env.validation.ts already rejects a missing path outside NODE_ENV=test.
      // In tests the guard/service are mocked, so we never reach verify() with
      // an unset key. Fail loudly if a real request slips through.
      this.logger.warn('JWT_PUBLIC_KEY_PATH is unset — every verify() call will fail');
      return;
    }
    const pem = readFileSync(publicKeyPath, 'utf8');
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'rsa') {
      throw new Error(
        `Expected an RSA public key at ${publicKeyPath}, got ${key.asymmetricKeyType ?? 'unknown'}`,
      );
    }
    this.publicKey = key;
    this.issuer = this.config.getOrThrow<string>('JWT_ISSUER');
    this.audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
    this.clockToleranceSeconds = this.config.getOrThrow<number>('JWT_CLOCK_TOLERANCE_SECONDS');
    this.logger.log(
      `JWT verifier ready (issuer=${this.issuer}, audience=${this.audience}, ` +
        `clockTolerance=${this.clockToleranceSeconds}s)`,
    );
  }

  async verify(token: string): Promise<AuthenticatedIdentity> {
    if (!this.publicKey) {
      throw new Error('JWT public key not loaded');
    }
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: [ALLOWED_ALG],
      issuer: this.issuer,
      audience: this.audience,
      clockTolerance: this.clockToleranceSeconds,
    });
    return toIdentity(payload);
  }
}

// Coerces the verified JWT payload into an AuthenticatedIdentity. Any missing
// required claim throws — jwtVerify already ensured exp/iss/aud, but sub and
// role are still schema-level concerns for us.
function toIdentity(payload: JWTPayload): AuthenticatedIdentity {
  const { sub, role, email, jti } = payload as {
    sub?: unknown;
    role?: unknown;
    email?: unknown;
    jti?: unknown;
  };
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new Error('JWT payload missing sub');
  }
  if (!isRole(role)) {
    throw new Error(`JWT payload has invalid role: ${String(role)}`);
  }
  return {
    userId: sub,
    role,
    email: typeof email === 'string' ? email : undefined,
    jti: typeof jti === 'string' ? jti : undefined,
  };
}
