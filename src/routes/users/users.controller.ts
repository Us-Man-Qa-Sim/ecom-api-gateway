import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  CreateAddressRequest,
  CreateAddressResponse,
  DeleteAddressRequest,
  GetAddressResponse,
  GetMeResponse,
  ListAddressesResponse,
  UpdateAddressRequest,
  UpdateAddressResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { UserGrpcClient } from '../../grpc/user.client';
import { callGrpc } from '../../common/grpc-call.util';
import { toAddressView, toUserView } from '../../common/mappers/user.view';

// /users/me and /users/me/addresses — all authenticated (the global
// JwtAuthGuard enforces this because no @Public() marker is applied here).
// Ownership checks live in the user-service; the gateway only forwards the
// identity it already verified onto the gRPC metadata.
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UserGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Get()
  async getMe() {
    const response = await callGrpc<GetMeResponse>(
      this.users.service.getMe({}, this.metadata.build()),
    );
    if (!response.user) {
      throw new NotFoundException('User not found');
    }
    return toUserView(response.user);
  }

  @Get('addresses')
  async listAddresses() {
    const response = await callGrpc<ListAddressesResponse>(
      this.users.service.listAddresses({}, this.metadata.build()),
    );
    return { addresses: (response.addresses ?? []).map(toAddressView) };
  }

  @Post('addresses')
  async createAddress(@Body() body: unknown) {
    const request = this.coerceCreateAddress(body);
    const response = await callGrpc<CreateAddressResponse>(
      this.users.service.createAddress(request, this.metadata.build()),
    );
    if (!response.address) {
      throw new BadRequestException('Invalid response from user service');
    }
    return toAddressView(response.address);
  }

  @Get('addresses/:id')
  async getAddress(@Param('id') id: string) {
    const response = await callGrpc<GetAddressResponse>(
      this.users.service.getAddress({ addressId: id }, this.metadata.build()),
    );
    if (!response.address) {
      throw new NotFoundException('Address not found');
    }
    return toAddressView(response.address);
  }

  @Patch('addresses/:id')
  async updateAddress(@Param('id') id: string, @Body() body: unknown) {
    const request = this.coerceUpdateAddress(id, body);
    const response = await callGrpc<UpdateAddressResponse>(
      this.users.service.updateAddress(request, this.metadata.build()),
    );
    if (!response.address) {
      throw new BadRequestException('Invalid response from user service');
    }
    return toAddressView(response.address);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAddress(@Param('id') id: string): Promise<void> {
    const request: DeleteAddressRequest = { addressId: id };
    await callGrpc(this.users.service.deleteAddress(request, this.metadata.build()));
  }

  private coerceCreateAddress(body: unknown): CreateAddressRequest {
    const b = asObject(body);
    return {
      label: optionalString(b, 'label'),
      street: requireString(b, 'street'),
      city: requireString(b, 'city'),
      state: optionalString(b, 'state'),
      postalCode: requireString(b, 'postalCode'),
      country: requireString(b, 'country'),
      isDefault: optionalBoolean(b, 'isDefault') ?? false,
    };
  }

  private coerceUpdateAddress(addressId: string, body: unknown): UpdateAddressRequest {
    const b = asObject(body);
    // All fields optional on update; the request still needs the id so the
    // downstream service can locate the row.
    return {
      addressId,
      label: optionalString(b, 'label'),
      street: optionalString(b, 'street'),
      city: optionalString(b, 'city'),
      state: optionalString(b, 'state'),
      postalCode: optionalString(b, 'postalCode'),
      country: optionalString(b, 'country'),
      isDefault: optionalBoolean(b, 'isDefault'),
    };
  }
}

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return value;
}

function optionalBoolean(obj: Record<string, unknown>, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}
