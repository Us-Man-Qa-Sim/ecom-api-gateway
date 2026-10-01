import { Metadata } from '@grpc/grpc-js';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HEADER_REQUEST_ID, HEADER_USER_ID, HEADER_USER_ROLE } from '../context/request-context';
import { RequestContextService } from '../context/request-context.service';

// Builds the gRPC Metadata forwarded on every downstream call. Reading from
// AsyncLocalStorage means controllers just call `client.foo(req, metadata())`
// without threading the Express request through.
@Injectable()
export class GrpcMetadataFactory {
  constructor(private readonly context: RequestContextService) {}

  // For authenticated calls (the default — everything except /auth/register,
  // /auth/login, /auth/refresh). Missing identity is a bug in the gateway
  // rather than a client error, so we surface it as 500 rather than let the
  // downstream service reject it with UNAUTHENTICATED.
  build(): Metadata {
    const ctx = this.context.get();
    if (!ctx) {
      throw new InternalServerErrorException('Request context is not available');
    }
    if (!ctx.userId || !ctx.role) {
      throw new InternalServerErrorException('Identity is not available on the request context');
    }
    const metadata = new Metadata();
    metadata.set(HEADER_USER_ID, ctx.userId);
    metadata.set(HEADER_USER_ROLE, ctx.role);
    metadata.set(HEADER_REQUEST_ID, ctx.requestId);
    return metadata;
  }

  // For calls made on behalf of an unauthenticated caller (register, login,
  // refresh). Only the request id is forwarded so downstream logs can still
  // be correlated across the request.
  buildAnonymous(): Metadata {
    const ctx = this.context.get();
    if (!ctx) {
      throw new InternalServerErrorException('Request context is not available');
    }
    const metadata = new Metadata();
    metadata.set(HEADER_REQUEST_ID, ctx.requestId);
    return metadata;
  }
}
