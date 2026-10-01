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
  CreateAddressResponse,
  DeleteAddressRequest,
  GetAddressResponse,
  GetMeResponse,
  ListAddressesResponse,
  UpdateAddressResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { UserGrpcClient } from '../../grpc/user.client';
import { callGrpc } from '../../common/grpc-call.util';
import { toAddressView, toUserView } from '../../common/mappers/user.view';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

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
  async createAddress(@Body() body: CreateAddressDto) {
    const response = await callGrpc<CreateAddressResponse>(
      this.users.service.createAddress(
        {
          label: body.label,
          street: body.street,
          city: body.city,
          state: body.state,
          postalCode: body.postalCode,
          country: body.country,
          isDefault: body.isDefault ?? false,
        },
        this.metadata.build(),
      ),
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
  async updateAddress(@Param('id') id: string, @Body() body: UpdateAddressDto) {
    const response = await callGrpc<UpdateAddressResponse>(
      this.users.service.updateAddress(
        {
          addressId: id,
          label: body.label,
          street: body.street,
          city: body.city,
          state: body.state,
          postalCode: body.postalCode,
          country: body.country,
          isDefault: body.isDefault,
        },
        this.metadata.build(),
      ),
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
}
