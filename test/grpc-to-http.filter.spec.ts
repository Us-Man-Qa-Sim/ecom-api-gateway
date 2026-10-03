import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { TimeoutError } from 'rxjs';
import { GrpcToHttpExceptionFilter } from '../src/common/errors/grpc-to-http.filter';

interface MockResponse {
  statusCode: number | null;
  body: unknown;
  status(code: number): MockResponse;
  json(body: unknown): MockResponse;
}

function makeHost(res: MockResponse, type: 'http' | 'rpc' = 'http'): ArgumentsHost {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    getClass: () => ({}) as never,
    getHandler: () => ({}) as never,
  };
}

function makeRes(): MockResponse {
  const r: MockResponse = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return r;
}

describe('GrpcToHttpExceptionFilter', () => {
  const filter = new GrpcToHttpExceptionFilter();

  it('rethrows non-http exceptions so Nest default handling takes over', () => {
    const err = new Error('x');
    expect(() => filter.catch(err, makeHost(makeRes(), 'rpc'))).toThrow(err);
  });

  it('passes HttpException through with its status and body', () => {
    const res = makeRes();
    filter.catch(new NotFoundException('nope'), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(res.body).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      error: 'Not Found',
      message: 'nope',
    });
  });

  it('wraps a string HttpException body in a structured payload', () => {
    const res = makeRes();
    const customException: HttpException = {
      getStatus: () => HttpStatus.CONFLICT,
      getResponse: () => 'duplicate',
    } as unknown as HttpException;
    Object.setPrototypeOf(customException, HttpException.prototype);
    filter.catch(customException, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.CONFLICT);
    expect(res.body).toEqual({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'duplicate',
    });
  });

  it('preserves the errors[] field on a ValidationPipe BadRequest', () => {
    const res = makeRes();
    const body = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'email: email must be a valid email address',
      errors: [{ field: 'email', errors: ['email must be a valid email address'] }],
    };
    filter.catch(new BadRequestException(body), makeHost(res));
    expect(res.body).toEqual(body);
  });

  it('collapses a message-array BadRequest into a joined string', () => {
    const res = makeRes();
    filter.catch(
      new BadRequestException({ message: ['a is required', 'b is required'] }),
      makeHost(res),
    );
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'a is required; b is required',
    });
  });

  it('maps rxjs TimeoutError to 504 Gateway Timeout', () => {
    const res = makeRes();
    filter.catch(new TimeoutError(), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(res.body).toMatchObject({
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
      error: 'Gateway Timeout',
      message: 'Upstream service timed out',
    });
  });

  it.each([
    [GrpcStatus.INVALID_ARGUMENT, HttpStatus.BAD_REQUEST, 'Bad Request'],
    [GrpcStatus.NOT_FOUND, HttpStatus.NOT_FOUND, 'Not Found'],
    [GrpcStatus.ALREADY_EXISTS, HttpStatus.CONFLICT, 'Conflict'],
    [GrpcStatus.PERMISSION_DENIED, HttpStatus.FORBIDDEN, 'Forbidden'],
    [GrpcStatus.FAILED_PRECONDITION, HttpStatus.CONFLICT, 'Conflict'],
    [GrpcStatus.ABORTED, HttpStatus.CONFLICT, 'Conflict'],
    [GrpcStatus.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED, 'Unauthorized'],
    [GrpcStatus.UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, 'Service Unavailable'],
    [GrpcStatus.DEADLINE_EXCEEDED, HttpStatus.GATEWAY_TIMEOUT, 'Gateway Timeout'],
    [GrpcStatus.RESOURCE_EXHAUSTED, HttpStatus.TOO_MANY_REQUESTS, 'Too Many Requests'],
    [GrpcStatus.INTERNAL, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error'],
    // The less-common codes also need to map explicitly — anything that falls
    // through to the generic 500 branch below is a hole in the mapping.
    [GrpcStatus.CANCELLED, HttpStatus.REQUEST_TIMEOUT, 'Request Timeout'],
    [GrpcStatus.UNKNOWN, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error'],
    [GrpcStatus.OUT_OF_RANGE, HttpStatus.BAD_REQUEST, 'Bad Request'],
    [GrpcStatus.UNIMPLEMENTED, HttpStatus.NOT_IMPLEMENTED, 'Not Implemented'],
    [GrpcStatus.DATA_LOSS, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error'],
  ])('maps gRPC status %p to HTTP %p', (grpcCode, httpStatus, label) => {
    const res = makeRes();
    filter.catch({ code: grpcCode, details: 'boom' }, makeHost(res));
    expect(res.statusCode).toBe(httpStatus);
    // 4xx forward the service's deliberate message; 5xx never forward
    // upstream details (they can carry internal hosts / stack fragments).
    const message = httpStatus >= 500 ? label : 'boom';
    expect(res.body).toEqual({ statusCode: httpStatus, error: label, message });
  });

  it('does not leak grpc-js transport details on UNAVAILABLE', () => {
    const res = makeRes();
    filter.catch(
      {
        code: GrpcStatus.UNAVAILABLE,
        details: 'No connection established. Last error: connect ECONNREFUSED 10.0.3.7:5001',
      },
      makeHost(res),
    );
    expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(JSON.stringify(res.body)).not.toContain('10.0.3.7');
  });

  it('falls back to message when details is empty', () => {
    const res = makeRes();
    filter.catch({ code: GrpcStatus.NOT_FOUND, message: 'missing' }, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(res.body).toMatchObject({ message: 'missing' });
  });

  it('uses the HTTP label as the message when neither details nor message is present', () => {
    const res = makeRes();
    filter.catch({ code: GrpcStatus.ALREADY_EXISTS }, makeHost(res));
    expect(res.body).toMatchObject({ message: 'Conflict' });
  });

  it('ignores a non-string details value', () => {
    const res = makeRes();
    filter.catch(
      { code: GrpcStatus.NOT_FOUND, details: 123, message: 'the real one' },
      makeHost(res),
    );
    expect(res.body).toMatchObject({ message: 'the real one' });
  });

  it('ignores an empty-string details value', () => {
    const res = makeRes();
    filter.catch(
      { code: GrpcStatus.NOT_FOUND, details: '', message: 'from message' },
      makeHost(res),
    );
    expect(res.body).toMatchObject({ message: 'from message' });
  });

  it('returns a generic 500 for shapes it does not recognise', () => {
    const res = makeRes();
    filter.catch({ unknown: true }, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  });

  it('returns a generic 500 when the gRPC code is numeric but outside the known range', () => {
    const res = makeRes();
    filter.catch({ code: 999, details: 'exotic' }, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      // 'exotic' is dropped: we don't trust the attacker-reachable details
      // when the code itself is not a code we handle.
      message: 'Internal server error',
    });
  });

  it('does not leak internals when the exception is a native Error', () => {
    const res = makeRes();
    filter.catch(new Error('ECONNREFUSED some-internal-host:5432'), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toMatchObject({ message: 'Internal server error' });
  });

  it('preserves the body.error and body.statusCode that the ValidationPipe factory supplies', () => {
    // The ValidationPipe is wired with an exceptionFactory that returns a
    // structured body including both statusCode and error. The filter must
    // not clobber those with the generic label derived from the HTTP status.
    const res = makeRes();
    const err = new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'email: invalid',
      errors: [{ field: 'email', errors: ['invalid'] }],
    });
    filter.catch(err, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'email: invalid',
      errors: [{ field: 'email', errors: ['invalid'] }],
    });
  });
});
