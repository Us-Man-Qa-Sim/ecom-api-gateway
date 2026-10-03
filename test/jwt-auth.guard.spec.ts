import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JwtService } from '../src/auth/jwt.service';
import { IS_PUBLIC_KEY, Public } from '../src/auth/decorators/public.decorator';
import { ROLES_KEY, Roles } from '../src/auth/decorators/roles.decorator';
import { AuthenticatedIdentity } from '../src/auth/types';

interface RequestState {
  headers: Record<string, string | undefined>;
  user?: AuthenticatedIdentity;
}

interface ContextOptions {
  isPublic?: boolean;
  requiredRoles?: string[];
  authorization?: string;
  type?: 'http' | 'rpc';
}

function makeContext(opts: ContextOptions): { ctx: ExecutionContext; request: RequestState } {
  const request: RequestState = {
    headers: { authorization: opts.authorization },
  };
  const ctx = {
    getType: () => opts.type ?? 'http',
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function makeReflector(
  isPublic: boolean | undefined,
  requiredRoles: string[] | undefined,
): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === ROLES_KEY) return requiredRoles;
      return undefined;
    }),
  } as unknown as Reflector;
}

function makeJwt(identity: AuthenticatedIdentity | Error): JwtService {
  return {
    verify: jest.fn(async () => {
      if (identity instanceof Error) throw identity;
      return identity;
    }),
  } as unknown as JwtService;
}

describe('JwtAuthGuard', () => {
  it('lets non-http contexts through untouched', async () => {
    const { ctx } = makeContext({ type: 'rpc' });
    const guard = new JwtAuthGuard(
      makeReflector(false, undefined),
      makeJwt(new Error('should not be called')),
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows a @Public route with no token', async () => {
    const { ctx } = makeContext({ authorization: undefined });
    const guard = new JwtAuthGuard(
      makeReflector(true, undefined),
      makeJwt(new Error('should not be called')),
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a non-public route missing the Authorization header', async () => {
    const { ctx } = makeContext({});
    const guard = new JwtAuthGuard(makeReflector(false, undefined), makeJwt(new Error('never')));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when Authorization is not a Bearer token', async () => {
    const { ctx } = makeContext({ authorization: 'Basic abc' });
    const guard = new JwtAuthGuard(makeReflector(false, undefined), makeJwt(new Error('never')));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the token is empty', async () => {
    const { ctx } = makeContext({ authorization: 'Bearer   ' });
    const guard = new JwtAuthGuard(makeReflector(false, undefined), makeJwt(new Error('never')));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when JwtService.verify throws', async () => {
    const { ctx } = makeContext({ authorization: 'Bearer bad-token' });
    const guard = new JwtAuthGuard(makeReflector(false, undefined), makeJwt(new Error('expired')));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the verified identity to req.user on success', async () => {
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'CUSTOMER', email: 'a@b.co' };
    const { ctx, request } = makeContext({ authorization: 'Bearer token' });
    const guard = new JwtAuthGuard(makeReflector(false, undefined), makeJwt(identity));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(identity);
  });

  it('allows a role check when the identity has the required role', async () => {
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'ADMIN' };
    const { ctx } = makeContext({ authorization: 'Bearer token' });
    const guard = new JwtAuthGuard(makeReflector(false, ['ADMIN']), makeJwt(identity));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects with 403 when the identity lacks the required role', async () => {
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'CUSTOMER' };
    const { ctx } = makeContext({ authorization: 'Bearer token' });
    const guard = new JwtAuthGuard(makeReflector(false, ['ADMIN']), makeJwt(identity));
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('treats an empty roles array as "no role requirement" (same as no decorator)', async () => {
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'CUSTOMER' };
    const { ctx } = makeContext({ authorization: 'Bearer token' });
    const guard = new JwtAuthGuard(makeReflector(false, []), makeJwt(identity));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('accepts any role listed in a multi-role requirement', async () => {
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'CUSTOMER' };
    const { ctx } = makeContext({ authorization: 'Bearer token' });
    const guard = new JwtAuthGuard(makeReflector(false, ['ADMIN', 'CUSTOMER']), makeJwt(identity));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('accepts a case-insensitive Bearer scheme', async () => {
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'CUSTOMER' };
    const { ctx, request } = makeContext({ authorization: 'bearer tok' });
    const guard = new JwtAuthGuard(makeReflector(false, undefined), makeJwt(identity));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(identity);
  });

  it('short-circuits on @Public before touching JwtService, even when a role is required', async () => {
    // @Public() wins over @Roles(): the route is explicitly unauthenticated,
    // so no verification happens and the role requirement is irrelevant.
    const jwt = makeJwt(new Error('should not be called'));
    const { ctx } = makeContext({ authorization: 'Bearer anything' });
    const guard = new JwtAuthGuard(makeReflector(true, ['ADMIN']), jwt);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('does not leak the underlying jose error text in the 401 message', async () => {
    const { ctx } = makeContext({ authorization: 'Bearer t' });
    const guard = new JwtAuthGuard(
      makeReflector(false, undefined),
      makeJwt(new Error('JWSSignatureVerificationFailed: signature verification failed')),
    );
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'Invalid or expired token',
    });
  });
});

describe('decorators', () => {
  it('@Public sets the expected metadata key', () => {
    class Sample {
      @Public()
      handler() {}
    }
    const metadata = Reflect.getMetadata(IS_PUBLIC_KEY, Sample.prototype.handler);
    expect(metadata).toBe(true);
  });

  it('@Roles sets the roles array', () => {
    class Sample {
      @Roles('ADMIN', 'CUSTOMER')
      handler() {}
    }
    const metadata = Reflect.getMetadata(ROLES_KEY, Sample.prototype.handler);
    expect(metadata).toEqual(['ADMIN', 'CUSTOMER']);
  });
});
