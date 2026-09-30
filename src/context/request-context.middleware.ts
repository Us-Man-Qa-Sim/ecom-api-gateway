import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { HEADER_REQUEST_ID } from './request-context';
import { RequestContextService } from './request-context.service';

// Accept any non-empty printable ASCII value up to a sane cap; a longer or
// non-printable header is likely a client bug or an injection attempt, so we
// mint a fresh id instead of forwarding untrusted bytes to downstream logs.
const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[\x21-\x7e]+$/;

// Runs before guards so an unauthenticated 401 still gets logged with the
// same request id the client sees. Wrapping `next()` in ALS.run keeps the
// store alive for guards, interceptors, the controller, and every downstream
// gRPC call — that is what lets GrpcMetadataFactory read the id without any
// per-call plumbing.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[HEADER_REQUEST_ID]);
    req.headers[HEADER_REQUEST_ID] = requestId;
    res.setHeader(HEADER_REQUEST_ID, requestId);
    this.context.run({ requestId }, () => next());
  }
}

function resolveRequestId(raw: string | string[] | undefined): string {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
}
