import type { NextFunction, Request, Response } from 'express';
import { hostname } from 'node:os';

export const HEADER_GATEWAY_INSTANCE = 'x-gateway-instance';

// LB-2: names the gateway replica that served the request so load balancing
// is visible from the client. docker-compose sets each replica's hostname
// (api-gateway-1, api-gateway-2). Registered as plain Express middleware
// ahead of Helmet and the body parsers, so 401/404/413/429 responses carry
// the header too — a Nest interceptor only runs once a route handler matched
// and every guard passed.
export function instanceIdMiddleware(instanceId: string = hostname()) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader(HEADER_GATEWAY_INSTANCE, instanceId);
    next();
  };
}
