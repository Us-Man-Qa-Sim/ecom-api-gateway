import type {
  Address as ProtoAddress,
  AuthTokens as ProtoAuthTokens,
  User as ProtoUser,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import type { Role } from '../../auth/types';
import { protoRoleToString, timestampToIso } from './proto.mapper';

export interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role | undefined;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AuthTokensView {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string | null;
}

export interface AddressView {
  id: string;
  userId: string;
  label: string | null;
  street: string;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toUserView(user: ProtoUser): UserView {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: protoRoleToString(user.role),
    createdAt: timestampToIso(user.createdAt),
    updatedAt: timestampToIso(user.updatedAt),
  };
}

export function toAuthTokensView(tokens: ProtoAuthTokens): AuthTokensView {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: timestampToIso(tokens.accessTokenExpiresAt),
  };
}

export function toAddressView(address: ProtoAddress): AddressView {
  return {
    id: address.id,
    userId: address.userId,
    label: address.label ?? null,
    street: address.street,
    city: address.city,
    state: address.state ?? null,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
    createdAt: timestampToIso(address.createdAt),
    updatedAt: timestampToIso(address.updatedAt),
  };
}
