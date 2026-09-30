import { InternalServerErrorException } from '@nestjs/common';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../src/context/request-context.service';
import { RequestContextMiddleware } from '../src/context/request-context.middleware';
import { RequestContextInterceptor } from '../src/context/request-context.interceptor';
import { GrpcMetadataFactory } from '../src/grpc/grpc-metadata.factory';
import {
  HEADER_REQUEST_ID,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
} from '../src/context/request-context';
import type { AuthenticatedIdentity } from '../src/auth/types';

function fakeReq(headers: Record<string, string | string[] | undefined> = {}): Request {
  return { headers } as unknown as Request;
}

function fakeRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    }),
  } as unknown as Response & { headers: Record<string, string> };
}

function httpCtx(user?: AuthenticatedIdentity): ExecutionContext {
  const req: Request & { user?: AuthenticatedIdentity } = { headers: {}, user } as unknown as Request & { user?: AuthenticatedIdentity };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function rpcCtx(): ExecutionContext {
  return {
    getType: () => 'rpc',
    switchToHttp: () => {
      throw new Error('should not be called');
    },
  } as unknown as ExecutionContext;
}

describe('RequestContextMiddleware', () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('forwards a well-formed inbound x-request-id unchanged', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const req = fakeReq({ [HEADER_REQUEST_ID]: 'trace-abc-123' });
    const res = fakeRes();
    let seenInside: string | undefined;
    const next: NextFunction = () => {
      seenInside = service.get()?.requestId;
    };
    middleware.use(req, res, next);
    expect(req.headers[HEADER_REQUEST_ID]).toBe('trace-abc-123');
    expect(res.headers[HEADER_REQUEST_ID]).toBe('trace-abc-123');
    expect(seenInside).toBe('trace-abc-123');
  });

  it('generates a UUID when the header is missing', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const req = fakeReq();
    const res = fakeRes();
    middleware.use(req, res, () => undefined);
    const generated = req.headers[HEADER_REQUEST_ID];
    expect(typeof generated).toBe('string');
    expect(generated as string).toMatch(UUID_V4);
    expect(res.headers[HEADER_REQUEST_ID]).toBe(generated);
  });

  it('replaces a header that is too long', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const req = fakeReq({ [HEADER_REQUEST_ID]: 'x'.repeat(200) });
    const res = fakeRes();
    middleware.use(req, res, () => undefined);
    expect((req.headers[HEADER_REQUEST_ID] as string).length).toBeLessThanOrEqual(64);
    expect(req.headers[HEADER_REQUEST_ID]).toMatch(UUID_V4);
  });

  it('replaces a header that contains non-printable bytes', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const req = fakeReq({ [HEADER_REQUEST_ID]: 'has space' });
    const res = fakeRes();
    middleware.use(req, res, () => undefined);
    expect(req.headers[HEADER_REQUEST_ID]).toMatch(UUID_V4);
  });

  it('uses the first value when the header arrives as an array', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service);
    const req = fakeReq({ [HEADER_REQUEST_ID]: ['first-id', 'second-id'] });
    const res = fakeRes();
    middleware.use(req, res, () => undefined);
    expect(req.headers[HEADER_REQUEST_ID]).toBe('first-id');
  });
});

describe('RequestContextService', () => {
  it('returns undefined outside of any run() scope', () => {
    const service = new RequestContextService();
    expect(service.get()).toBeUndefined();
  });

  it('exposes the store inside run() and drops it after', () => {
    const service = new RequestContextService();
    let inside: string | undefined;
    service.run({ requestId: 'r1' }, () => {
      inside = service.get()?.requestId;
    });
    expect(inside).toBe('r1');
    expect(service.get()).toBeUndefined();
  });

  it('setIdentity mutates the current store', () => {
    const service = new RequestContextService();
    service.run({ requestId: 'r1' }, () => {
      service.setIdentity('u1', 'ADMIN');
      const store = service.get();
      expect(store?.userId).toBe('u1');
      expect(store?.role).toBe('ADMIN');
      expect(store?.requestId).toBe('r1');
    });
  });

  it('setIdentity is a no-op outside of any scope', () => {
    const service = new RequestContextService();
    expect(() => service.setIdentity('u1', 'ADMIN')).not.toThrow();
    expect(service.get()).toBeUndefined();
  });
});

describe('RequestContextInterceptor', () => {
  it('copies req.user into the ALS store', async () => {
    const service = new RequestContextService();
    const interceptor = new RequestContextInterceptor(service);
    const identity: AuthenticatedIdentity = { userId: 'u1', role: 'CUSTOMER' };
    const handler: CallHandler = { handle: () => of('ok') };
    await service.run({ requestId: 'r1' }, async () => {
      await firstValueFrom(interceptor.intercept(httpCtx(identity), handler));
      expect(service.get()?.userId).toBe('u1');
      expect(service.get()?.role).toBe('CUSTOMER');
    });
  });

  it('leaves the store alone for @Public routes (no req.user)', async () => {
    const service = new RequestContextService();
    const interceptor = new RequestContextInterceptor(service);
    const handler: CallHandler = { handle: () => of('ok') };
    await service.run({ requestId: 'r1' }, async () => {
      await firstValueFrom(interceptor.intercept(httpCtx(undefined), handler));
      expect(service.get()?.userId).toBeUndefined();
      expect(service.get()?.role).toBeUndefined();
    });
  });

  it('is a no-op for non-http execution contexts', async () => {
    const service = new RequestContextService();
    const interceptor = new RequestContextInterceptor(service);
    const handler: CallHandler = { handle: () => of('ok') };
    await service.run({ requestId: 'r1' }, async () => {
      await firstValueFrom(interceptor.intercept(rpcCtx(), handler));
      expect(service.get()?.userId).toBeUndefined();
    });
  });
});

describe('GrpcMetadataFactory', () => {
  it('build() emits all three headers when identity is present', () => {
    const service = new RequestContextService();
    const factory = new GrpcMetadataFactory(service);
    service.run({ requestId: 'r1' }, () => {
      service.setIdentity('u1', 'ADMIN');
      const md = factory.build();
      expect(md.get(HEADER_USER_ID)).toEqual(['u1']);
      expect(md.get(HEADER_USER_ROLE)).toEqual(['ADMIN']);
      expect(md.get(HEADER_REQUEST_ID)).toEqual(['r1']);
    });
  });

  it('build() throws when called outside of any request scope', () => {
    const service = new RequestContextService();
    const factory = new GrpcMetadataFactory(service);
    expect(() => factory.build()).toThrow(InternalServerErrorException);
  });

  it('build() throws when identity is missing (would-be @Public misuse)', () => {
    const service = new RequestContextService();
    const factory = new GrpcMetadataFactory(service);
    service.run({ requestId: 'r1' }, () => {
      expect(() => factory.build()).toThrow(InternalServerErrorException);
    });
  });

  it('buildAnonymous() emits only the request id', () => {
    const service = new RequestContextService();
    const factory = new GrpcMetadataFactory(service);
    service.run({ requestId: 'r1' }, () => {
      const md = factory.buildAnonymous();
      expect(md.get(HEADER_REQUEST_ID)).toEqual(['r1']);
      expect(md.get(HEADER_USER_ID)).toEqual([]);
      expect(md.get(HEADER_USER_ROLE)).toEqual([]);
    });
  });

  it('buildAnonymous() throws when called outside of any request scope', () => {
    const service = new RequestContextService();
    const factory = new GrpcMetadataFactory(service);
    expect(() => factory.buildAnonymous()).toThrow(InternalServerErrorException);
  });
});
