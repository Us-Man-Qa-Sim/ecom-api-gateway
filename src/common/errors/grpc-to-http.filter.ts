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

// gRPC → HTTP status mapping. These assignments follow the grpc-gateway and
// grpc-core conventions:
//   - FAILED_PRECONDITION / ABORTED → 409 (conflict with current server state)
//   - RESOURCE_EXHAUSTED → 429 (quota/rate limit)
//   - DEADLINE_EXCEEDED → 504 (gateway could not get a timely upstream reply)
//   - CANCELLED → 499 is non-standard, so 408 (request timeout) is used here.
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

// HTTP reason-phrases keyed by status code — the public `error` field in the
// response body. Only the codes we actually produce need an entry.
const HTTP_ERROR_LABEL: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.REQUEST_TIMEOUT]: 'Request Timeout',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.NOT_IMPLEMENTED]: 'Not Implemented',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
};

// A gRPC-shaped error from either @grpc/grpc-js or Nest's RpcException. Both
// surface at the client as a plain object/Error with numeric `code` and
// human-readable `details`.
interface GrpcErrorLike {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  // Present on 400 Bad Request from the ValidationPipe (GW-6); downstream
  // gRPC errors don't carry it today (would need a google.rpc.Status detail
  // channel, which the services don't use yet).
  errors?: unknown;
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

    // HttpException is thrown by the auth guard, the global ValidationPipe
    // (GW-6), and other Nest internals — honour it as-is but normalise the
    // shape so clients always see {statusCode, error, message, errors?}.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(normaliseHttpBody(exception.getResponse(), status));
      return;
    }

    if (exception instanceof TimeoutError) {
      const status = HttpStatus.GATEWAY_TIMEOUT;
      res.status(status).json({
        statusCode: status,
        error: HTTP_ERROR_LABEL[status],
        message: 'Upstream service timed out',
      });
      return;
    }

    const grpcError = exception as GrpcErrorLike;
    const code = typeof grpcError.code === 'number' ? grpcError.code : undefined;
    if (code !== undefined && code in GRPC_TO_HTTP) {
      const status = GRPC_TO_HTTP[code];
      res.status(status).json({
        statusCode: status,
        error: HTTP_ERROR_LABEL[status] ?? HttpStatus[status] ?? 'Error',
        message: extractMessage(grpcError, status),
      });
      return;
    }

    // Unknown shape — do not leak internal details; log and return 500.
    this.logger.error({ err: exception }, 'Unhandled exception');
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({
      statusCode: status,
      error: HTTP_ERROR_LABEL[status],
      message: 'Internal server error',
    });
  }
}

function normaliseHttpBody(body: string | object, status: HttpStatus): ErrorBody {
  const label = HTTP_ERROR_LABEL[status] ?? HttpStatus[status] ?? 'Error';
  if (typeof body === 'string') {
    return { statusCode: status, error: label, message: body };
  }
  const obj = body as Record<string, unknown>;
  const message =
    typeof obj.message === 'string' ? obj.message : readMessageArray(obj.message, label);
  const errors = obj.errors;
  const error = typeof obj.error === 'string' ? obj.error : label;
  return {
    statusCode: typeof obj.statusCode === 'number' ? obj.statusCode : status,
    error,
    message,
    ...(errors !== undefined ? { errors } : {}),
  };
}

function readMessageArray(message: unknown, fallback: string): string {
  // Nest's built-in ValidationPipe hands us `message: string[]` by default. We
  // override that via `exceptionFactory`, but a user-raised BadRequestException
  // with an array message should still render sensibly.
  if (Array.isArray(message) && message.length > 0 && typeof message[0] === 'string') {
    return message.join('; ');
  }
  return fallback;
}

function extractMessage(err: GrpcErrorLike, status: HttpStatus): string {
  if (typeof err.details === 'string' && err.details.length > 0) {
    return err.details;
  }
  if (typeof err.message === 'string' && err.message.length > 0) {
    return err.message;
  }
  return HTTP_ERROR_LABEL[status] ?? HttpStatus[status] ?? 'Error';
}
