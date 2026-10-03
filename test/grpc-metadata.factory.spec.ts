import { InternalServerErrorException } from '@nestjs/common';
import { GrpcMetadataFactory } from '../src/grpc/grpc-metadata.factory';
import {
  HEADER_REQUEST_ID,
  HEADER_USER_ID,
  HEADER_USER_ROLE,
  type RequestContext,
} from '../src/context/request-context';
import type { RequestContextService } from '../src/context/request-context.service';

function stubContext(ctx: Partial<RequestContext> | undefined): RequestContextService {
  return {
    get: () => ctx as RequestContext | undefined,
    setIdentity: jest.fn(),
    run: (_c: unknown, cb: () => unknown) => cb(),
  } as unknown as RequestContextService;
}

describe('GrpcMetadataFactory.build (authenticated)', () => {
  it('populates x-user-id, x-user-role, and x-request-id from the current context', () => {
    const factory = new GrpcMetadataFactory(
      stubContext({ requestId: 'req-1', userId: 'u-1', role: 'ADMIN' }),
    );
    const meta = factory.build();
    expect(meta.get(HEADER_USER_ID)[0]?.toString()).toBe('u-1');
    expect(meta.get(HEADER_USER_ROLE)[0]?.toString()).toBe('ADMIN');
    expect(meta.get(HEADER_REQUEST_ID)[0]?.toString()).toBe('req-1');
  });

  it('throws 500 when there is no request context (bug in the gateway, not a client error)', () => {
    const factory = new GrpcMetadataFactory(stubContext(undefined));
    expect(() => factory.build()).toThrow(InternalServerErrorException);
  });

  it('throws 500 when the context has no identity (would otherwise reach downstream as UNAUTHENTICATED)', () => {
    const factory = new GrpcMetadataFactory(stubContext({ requestId: 'req-1' }));
    expect(() => factory.build()).toThrow(InternalServerErrorException);
  });

  it('throws 500 when the context has userId but no role', () => {
    const factory = new GrpcMetadataFactory(stubContext({ requestId: 'req-1', userId: 'u-1' }));
    expect(() => factory.build()).toThrow(InternalServerErrorException);
  });
});

describe('GrpcMetadataFactory.buildAnonymous', () => {
  it('forwards only the request id — no identity headers', () => {
    const factory = new GrpcMetadataFactory(
      stubContext({ requestId: 'req-anon', userId: 'u-ignored', role: 'CUSTOMER' }),
    );
    const meta = factory.buildAnonymous();
    expect(meta.get(HEADER_REQUEST_ID)[0]?.toString()).toBe('req-anon');
    expect(meta.get(HEADER_USER_ID)).toHaveLength(0);
    expect(meta.get(HEADER_USER_ROLE)).toHaveLength(0);
  });

  it('throws 500 when there is no request context', () => {
    const factory = new GrpcMetadataFactory(stubContext(undefined));
    expect(() => factory.buildAnonymous()).toThrow(InternalServerErrorException);
  });
});
