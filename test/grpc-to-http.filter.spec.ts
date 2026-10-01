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
    expect(res.body).toMatchObject({ statusCode: HttpStatus.NOT_FOUND, message: 'nope' });
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
    expect(res.body).toEqual({ statusCode: HttpStatus.CONFLICT, message: 'duplicate' });
  });

  it('maps rxjs TimeoutError to 504 Gateway Timeout', () => {
    const res = makeRes();
    filter.catch(new TimeoutError(), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(res.body).toMatchObject({
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
      message: 'Upstream service timed out',
    });
  });

  it.each([
    [GrpcStatus.INVALID_ARGUMENT, HttpStatus.BAD_REQUEST],
    [GrpcStatus.NOT_FOUND, HttpStatus.NOT_FOUND],
    [GrpcStatus.ALREADY_EXISTS, HttpStatus.CONFLICT],
    [GrpcStatus.PERMISSION_DENIED, HttpStatus.FORBIDDEN],
    [GrpcStatus.FAILED_PRECONDITION, HttpStatus.CONFLICT],
    [GrpcStatus.ABORTED, HttpStatus.CONFLICT],
    [GrpcStatus.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED],
    [GrpcStatus.UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE],
    [GrpcStatus.DEADLINE_EXCEEDED, HttpStatus.GATEWAY_TIMEOUT],
    [GrpcStatus.RESOURCE_EXHAUSTED, HttpStatus.TOO_MANY_REQUESTS],
    [GrpcStatus.INTERNAL, HttpStatus.INTERNAL_SERVER_ERROR],
  ])('maps gRPC status %p to HTTP %p', (grpcCode, httpStatus) => {
    const res = makeRes();
    filter.catch({ code: grpcCode, details: 'boom' }, makeHost(res));
    expect(res.statusCode).toBe(httpStatus);
    expect(res.body).toEqual({ statusCode: httpStatus, message: 'boom' });
  });

  it('falls back to message when details is empty', () => {
    const res = makeRes();
    filter.catch({ code: GrpcStatus.NOT_FOUND, message: 'missing' }, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(res.body).toMatchObject({ message: 'missing' });
  });

  it('returns a generic 500 for shapes it does not recognise', () => {
    const res = makeRes();
    filter.catch({ unknown: true }, makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  });

  it('does not swallow a nested validation exception the auth guard throws', () => {
    const res = makeRes();
    filter.catch(new BadRequestException({ field: 'required' }), makeHost(res));
    expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(res.body).toMatchObject({ field: 'required' });
  });
});
