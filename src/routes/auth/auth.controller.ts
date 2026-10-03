import { BadGatewayException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  LoginResponse as LoginRpcResponse,
  LogoutResponse as LogoutRpcResponse,
  RefreshTokenResponse as RefreshTokenRpcResponse,
  RegisterResponse as RegisterRpcResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import { Public } from '../../auth/decorators/public.decorator';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { UserGrpcClient } from '../../grpc/user.client';
import { callGrpc, GrpcCallTimeouts } from '../../common/grpc-call.util';
import { toAuthTokensView, toUserView } from '../../common/mappers/user.view';
import { AuthThrottle } from '../../common/throttler/auth-throttle';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';
import {
  HttpErrorResponse,
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
} from '../../swagger/response-models';

// Thin REST façade over the ecom.user.v1 auth RPCs. Request bodies are shaped
// by class-validator DTOs (GW-6): the global ValidationPipe strips unknown
// fields, enforces types, and surfaces field-level 400s before anything
// reaches gRPC.
@ApiTags('auth')
@Controller('auth')
@Public()
// GW-8: credential-handling routes get the tighter AUTH_THROTTLE budget
// (10/min by default) instead of the gateway's global 60/min baseline. The
// class-level decorator covers register/login/refresh/logout — all of which
// touch credentials or long-lived tokens.
@AuthThrottle()
@ApiBadRequestResponse({ description: 'Validation failed', type: HttpErrorResponse })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', type: HttpErrorResponse })
export class AuthController {
  constructor(
    private readonly users: UserGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
    private readonly timeouts: GrpcCallTimeouts,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new customer account.' })
  @ApiCreatedResponse({ type: RegisterResponse })
  async register(@Body() body: RegisterDto) {
    // standard: argon2 hashing + Postgres insert + outbox write, well under
    // the default 5s even on a cold worker.
    const response = await callGrpc<RegisterRpcResponse>(
      this.users.service.register(body, this.metadata.buildAnonymous()),
      this.timeouts.standard,
    );
    if (!response.user) {
      // Should never happen — user-service always returns the row on success.
      throw new BadGatewayException('Invalid response from user service');
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
  @ApiOperation({ summary: 'Exchange credentials for an access + refresh token pair.' })
  @ApiOkResponse({ type: LoginResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials', type: HttpErrorResponse })
  async login(@Body() body: LoginDto) {
    // standard: argon2 verify (deliberately slow) + token issuance.
    const response = await callGrpc<LoginRpcResponse>(
      this.users.service.login(body, this.metadata.buildAnonymous()),
      this.timeouts.standard,
    );
    if (!response.user || !response.tokens) {
      throw new BadGatewayException('Invalid response from user service');
    }
    return {
      user: toUserView(response.user),
      tokens: toAuthTokensView(response.tokens),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and mint a fresh access token.' })
  @ApiOkResponse({ type: RefreshResponse })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is unknown, revoked or already used (family revoked).',
    type: HttpErrorResponse,
  })
  async refresh(@Body() body: RefreshTokenDto) {
    // fast: refresh is one indexed lookup + rotation write; no hashing.
    const response = await callGrpc<RefreshTokenRpcResponse>(
      this.users.service.refreshToken(body, this.metadata.buildAnonymous()),
      this.timeouts.fast,
    );
    if (!response.tokens) {
      throw new BadGatewayException('Invalid response from user service');
    }
    return { tokens: toAuthTokensView(response.tokens) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the supplied refresh token (idempotent).' })
  @ApiNoContentResponse({ description: 'Token revoked.' })
  async logout(@Body() body: LogoutDto): Promise<void> {
    // Logout takes the refresh token as its credential (see D4: refresh is
    // rotating and family-revoked on reuse). Access token is not required —
    // a logged-out user may already be unable to call authenticated routes.
    // fast: single-row revoke, idempotent.
    await callGrpc<LogoutRpcResponse>(
      this.users.service.logout(body, this.metadata.buildAnonymous()),
      this.timeouts.fast,
    );
  }
}
