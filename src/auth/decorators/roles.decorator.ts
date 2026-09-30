import { SetMetadata } from '@nestjs/common';
import type { Role } from '../types';

export const ROLES_KEY = 'auth:roles';

// Restricts a route (or controller) to one of the listed roles. Authentication
// still happens first — @Roles() implies auth. Method-level metadata wins over
// class-level metadata (Reflector.getAllAndOverride).
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
