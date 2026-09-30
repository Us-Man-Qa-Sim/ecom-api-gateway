// Role literal — matches the `Role` enum in the Prisma schema (user-service)
// and the `Role` enum in ecom.user.v1.proto (transported as its string name in
// the JWT so consumers do not need the proto file to interpret the claim).
export type Role = 'CUSTOMER' | 'ADMIN';

export const ROLES: readonly Role[] = ['CUSTOMER', 'ADMIN'] as const;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

// Identity attached to the Express request by JwtAuthGuard after a successful
// verification. Downstream code should read this instead of re-parsing the
// Authorization header.
export interface AuthenticatedIdentity {
  userId: string;
  role: Role;
  email?: string;
  // The verified `jti`, when present, is kept for logging/audit. Access-token
  // expiry is enforced by the guard; callers do not need to re-check it.
  jti?: string;
}
