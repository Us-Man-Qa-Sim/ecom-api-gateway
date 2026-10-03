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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
import { callGrpc, GrpcCallTimeouts } from '../../common/grpc-call.util';
import { toAddressView, toUserView } from '../../common/mappers/user.view';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import {
  AddressListResponse,
  AddressResponse,
  HttpErrorResponse,
  UserResponse,
} from '../../swagger/response-models';

// /users/me and /users/me/addresses — all authenticated (the global
// JwtAuthGuard enforces this because no @Public() marker is applied here).
// Ownership checks live in the user-service; the gateway only forwards the
// identity it already verified onto the gRPC metadata.
@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  type: HttpErrorResponse,
})
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UserGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
    private readonly timeouts: GrpcCallTimeouts,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Return the authenticated user profile.' })
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse({ description: 'User not found', type: HttpErrorResponse })
  async getMe() {
    // fast: single indexed read by userId.
    const response = await callGrpc<GetMeResponse>(
      this.users.service.getMe({}, this.metadata.build()),
      this.timeouts.fast,
    );
    if (!response.user) {
      throw new NotFoundException('User not found');
    }
    return toUserView(response.user);
  }

  @Get('addresses')
  @ApiOperation({ summary: 'List all shipping addresses on the current account.' })
  @ApiOkResponse({ type: AddressListResponse })
  async listAddresses() {
    // fast: bounded by addresses-per-user (small single-digit N in practice).
    const response = await callGrpc<ListAddressesResponse>(
      this.users.service.listAddresses({}, this.metadata.build()),
      this.timeouts.fast,
    );
    return { addresses: (response.addresses ?? []).map(toAddressView) };
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Add a new shipping address.' })
  @ApiCreatedResponse({ type: AddressResponse })
  async createAddress(@Body() body: CreateAddressDto) {
    // standard: write path (default-address rebalance happens in one tx).
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
      this.timeouts.standard,
    );
    if (!response.address) {
      throw new BadRequestException('Invalid response from user service');
    }
    return toAddressView(response.address);
  }

  @Get('addresses/:id')
  @ApiOperation({ summary: 'Get one address by id.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AddressResponse })
  @ApiNotFoundResponse({ description: 'Address not found', type: HttpErrorResponse })
  async getAddress(@Param('id') id: string) {
    // fast: indexed single-row lookup with ownership check.
    const response = await callGrpc<GetAddressResponse>(
      this.users.service.getAddress({ addressId: id }, this.metadata.build()),
      this.timeouts.fast,
    );
    if (!response.address) {
      throw new NotFoundException('Address not found');
    }
    return toAddressView(response.address);
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Partially update an address.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AddressResponse })
  @ApiNotFoundResponse({ description: 'Address not found', type: HttpErrorResponse })
  async updateAddress(@Param('id') id: string, @Body() body: UpdateAddressDto) {
    // standard: patch-with-ownership + default-address rebalance.
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
      this.timeouts.standard,
    );
    if (!response.address) {
      throw new BadRequestException('Invalid response from user service');
    }
    return toAddressView(response.address);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Address deleted.' })
  async deleteAddress(@Param('id') id: string): Promise<void> {
    // fast: single-row delete with ownership check.
    const request: DeleteAddressRequest = { addressId: id };
    await callGrpc(
      this.users.service.deleteAddress(request, this.metadata.build()),
      this.timeouts.fast,
    );
  }
}
