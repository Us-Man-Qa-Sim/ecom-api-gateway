import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { TimeoutError } from 'rxjs';
import type { Response } from 'express';

// Minimal gRPC → HTTP error mapping for GW-5. GW-6 will refine this (richer
// payloads, field-level validation details) and class-validator will attach
// its own exceptions; everything here stays applicable afterwards.
const GRPC_TO_HTTP: Record<number, HttpStatus> = {
  [GrpcStatus.OK]: HttpStatus.OK,
  [GrpcStatus.CANCELLED]: HttpStatus.REQUEST_TIMEOUT,
  [GrpcStatus.UNKNOWN]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.DEADLINE_EXCEEDED]: HttpStatus.GATEWAY_TIMEOUT,
  [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [GrpcStatus.RESOURCE_EXHAUSTED]: HttpStatus.TOO_MANY_REQUESTS,
  [GrpcStatus.FAILED_PRECONDITION]: HttpStatus.CONFLICT,
  [GrpcStatus.ABORTED]: HttpStatus.CONFLICT,
  [GrpcStatus.OUT_OF_RANGE]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.UNIMPLEMENTED]: HttpStatus.NOT_IMPLEMENTED,
  [GrpcStatus.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [GrpcStatus.DATA_LOSS]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
};

// A gRPC-shaped error from either @grpc/grpc-js or Nest's RpcException. Both
// surface at the client as a plain object/Error with numeric `code` and
// human-readable `details` (RpcException uses `message`/`details` depending on
// how it was constructed).
interface GrpcErrorLike {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

@Catch()
export class GrpcToHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GrpcToHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      // Nothing to do for non-http contexts; rethrow so Nest's default handling
      // takes over.
      throw exception;
    }

    const res = host.switchToHttp().getResponse<Response>();

    // HttpException is thrown by the auth guard, class-validator (GW-6), and
    // other Nest internals — honour it as-is.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    if (exception instanceof TimeoutError) {
      res
        .status(HttpStatus.GATEWAY_TIMEOUT)
        .json({ statusCode: HttpStatus.GATEWAY_TIMEOUT, message: 'Upstream service timed out' });
      return;
    }

    const grpcError = exception as GrpcErrorLike;
    const code = typeof grpcError.code === 'number' ? grpcError.code : undefined;
    if (code !== undefined && code in GRPC_TO_HTTP) {
      const status = GRPC_TO_HTTP[code];
      const message = extractMessage(grpcError, status);
      res.status(status).json({ statusCode: status, message });
      return;
    }

    // Unknown shape — do not leak internal details; log and return 500.
    this.logger.error({ err: exception }, 'Unhandled exception');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}

function extractMessage(err: GrpcErrorLike, status: HttpStatus): string {
  if (typeof err.details === 'string' && err.details.length > 0) {
    return err.details;
  }
  if (typeof err.message === 'string' && err.message.length > 0) {
    return err.message;
  }
  return HttpStatus[status] ?? 'Error';
}
