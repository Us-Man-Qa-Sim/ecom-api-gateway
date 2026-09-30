import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';
import { JwtService } from '../src/auth/jwt.service';

interface Fixture {
  service: JwtService;
  keyDir: string;
  privateKeyPem: string;
  publicKeyPem: string;
  issuer: string;
  audience: string;
}

function writeFixture(): Fixture {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyDir = mkdtempSync(join(tmpdir(), 'gw-jwt-'));
  const publicKeyPath = join(keyDir, 'jwt-public.pem');
  writeFileSync(publicKeyPath, publicKeyPem);

  const issuer = 'user-service';
  const audience = 'ecom-api';
  const config = new ConfigService({
    JWT_PUBLIC_KEY_PATH: publicKeyPath,
    JWT_ISSUER: issuer,
    JWT_AUDIENCE: audience,
    JWT_CLOCK_TOLERANCE_SECONDS: 5,
  });
  const service = new JwtService(config);
  service.onModuleInit();
  return { service, keyDir, privateKeyPem, publicKeyPem, issuer, audience };
}

async function sign(
  fixture: Fixture,
  overrides: {
    sub?: string;
    role?: string;
    issuer?: string;
    audience?: string;
    expiresIn?: number;
    email?: string;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(fixture.privateKeyPem, 'RS256');
  return new SignJWT({ role: overrides.role ?? 'CUSTOMER', email: overrides.email ?? 'a@b.co' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test' })
    .setSubject(overrides.sub ?? 'user-1')
    .setIssuer(overrides.issuer ?? fixture.issuer)
    .setAudience(overrides.audience ?? fixture.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + (overrides.expiresIn ?? 60))
    .sign(key);
}

describe('JwtService', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = writeFixture();
  });

  afterEach(() => {
    rmSync(fixture.keyDir, { recursive: true, force: true });
  });

  it('verifies a well-formed token and returns the identity', async () => {
    const token = await sign(fixture, { sub: 'user-42', role: 'ADMIN', email: 'a@x.co' });
    const identity = await fixture.service.verify(token);
    expect(identity).toEqual({ userId: 'user-42', role: 'ADMIN', email: 'a@x.co', jti: undefined });
  });

  it('rejects a token signed by a different key', async () => {
    const otherFixture = writeFixture();
    const token = await sign(otherFixture);
    await expect(fixture.service.verify(token)).rejects.toThrow();
    rmSync(otherFixture.keyDir, { recursive: true, force: true });
  });

  it('rejects an expired token', async () => {
    const token = await sign(fixture, { expiresIn: -60 });
    await expect(fixture.service.verify(token)).rejects.toThrow();
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await sign(fixture, { issuer: 'someone-else' });
    await expect(fixture.service.verify(token)).rejects.toThrow();
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await sign(fixture, { audience: 'other-audience' });
    await expect(fixture.service.verify(token)).rejects.toThrow();
  });

  it('rejects a token with an unknown role', async () => {
    const token = await sign(fixture, { role: 'MODERATOR' });
    await expect(fixture.service.verify(token)).rejects.toThrow(/invalid role/);
  });

  it('rejects a token with no sub', async () => {
    const key = await importPKCS8(fixture.privateKeyPem, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ role: 'CUSTOMER' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test' })
      .setIssuer(fixture.issuer)
      .setAudience(fixture.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(key);
    await expect(fixture.service.verify(token)).rejects.toThrow(/sub/);
  });

  it('throws when the configured key file is not RSA', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const dir = mkdtempSync(join(tmpdir(), 'gw-jwt-bad-'));
    const path = join(dir, 'ec-public.pem');
    writeFileSync(path, pem);
    const config = new ConfigService({
      JWT_PUBLIC_KEY_PATH: path,
      JWT_ISSUER: 'i',
      JWT_AUDIENCE: 'a',
      JWT_CLOCK_TOLERANCE_SECONDS: 5,
    });
    const service = new JwtService(config);
    expect(() => service.onModuleInit()).toThrow(/RSA/);
    rmSync(dir, { recursive: true, force: true });
  });
});
