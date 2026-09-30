import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { JwtService } from './jwt.service';
import type { AuthenticatedIdentity, Role } from './types';

const BEARER_PREFIX = /^Bearer\s+/i;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') {
      // The gateway is HTTP-only; if it ever gets a gRPC/microservice server,
      // that server has its own trust rules (identity metadata from the peer).
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedIdentity }>();
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let identity: AuthenticatedIdentity;
    try {
      identity = await this.jwt.verify(token);
    } catch (err) {
      // Never leak the underlying jose error text to the client (it can hint
      // at what specifically failed — expiry vs signature vs audience). Log
      // internally and return the generic 401.
      this.logger.debug({ err }, 'JWT verification failed');
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.user = identity;

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(identity.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  if (!BEARER_PREFIX.test(authHeader)) return null;
  const token = authHeader.replace(BEARER_PREFIX, '').trim();
  return token.length > 0 ? token : null;
}
