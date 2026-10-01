import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type {
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RegisterRequest,
  RegisterResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import { Public } from '../../auth/decorators/public.decorator';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { UserGrpcClient } from '../../grpc/user.client';
import { callGrpc } from '../../common/grpc-call.util';
import { toAuthTokensView, toUserView } from '../../common/mappers/user.view';

// Thin REST façade over the ecom.user.v1 auth RPCs. Request bodies are passed
// through to the user-service as-is; detailed field validation (class-validator)
// is GW-6 — for GW-5 we check the handful of fields the controller actually
// touches so that malformed input returns 400 rather than silently flowing to
// gRPC and surfacing as INVALID_ARGUMENT or worse.
@Controller('auth')
@Public()
export class AuthController {
  constructor(
    private readonly users: UserGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const request = this.coerceRegister(body);
    const response = await callGrpc<RegisterResponse>(
      this.users.service.register(request, this.metadata.buildAnonymous()),
    );
    if (!response.user) {
      // Should never happen — user-service always returns the row on success.
      throw new BadRequestException('Invalid response from user service');
    }
    return {
      user: toUserView(response.user),
      // Register deliberately mints no tokens — the client calls /auth/login
      // next. See user-service UserController.register for the rationale.
      tokens: response.tokens ? toAuthTokensView(response.tokens) : null,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const request = this.coerceLogin(body);
    const response = await callGrpc<LoginResponse>(
      this.users.service.login(request, this.metadata.buildAnonymous()),
    );
    if (!response.user || !response.tokens) {
      throw new BadRequestException('Invalid response from user service');
    }
    return {
      user: toUserView(response.user),
      tokens: toAuthTokensView(response.tokens),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown) {
    const request = this.coerceRefresh(body);
    const response = await callGrpc<RefreshTokenResponse>(
      this.users.service.refreshToken(request, this.metadata.buildAnonymous()),
    );
    if (!response.tokens) {
      throw new BadRequestException('Invalid response from user service');
    }
    return { tokens: toAuthTokensView(response.tokens) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    // Logout takes the refresh token as its credential (see D4: refresh is
    // rotating and family-revoked on reuse). Access token is not required —
    // a logged-out user may already be unable to call authenticated routes.
    const request = this.coerceLogout(body);
    await callGrpc<LogoutResponse>(
      this.users.service.logout(request, this.metadata.buildAnonymous()),
    );
  }

  private coerceRegister(body: unknown): RegisterRequest {
    const b = this.asObject(body);
    return {
      email: this.requireString(b, 'email'),
      password: this.requireString(b, 'password'),
      firstName: this.requireString(b, 'firstName'),
      lastName: this.requireString(b, 'lastName'),
    };
  }

  private coerceLogin(body: unknown): LoginRequest {
    const b = this.asObject(body);
    return {
      email: this.requireString(b, 'email'),
      password: this.requireString(b, 'password'),
    };
  }

  private coerceRefresh(body: unknown): RefreshTokenRequest {
    const b = this.asObject(body);
    return { refreshToken: this.requireString(b, 'refreshToken') };
  }

  private coerceLogout(body: unknown): LogoutRequest {
    const b = this.asObject(body);
    return { refreshToken: this.requireString(b, 'refreshToken') };
  }

  private asObject(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    return body as Record<string, unknown>;
  }

  private requireString(obj: Record<string, unknown>, field: string): string {
    const value = obj[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    return value;
  }
}
