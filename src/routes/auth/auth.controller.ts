import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type {
  LoginResponse,
  LogoutResponse,
  RefreshTokenResponse,
  RegisterResponse,
} from '@us-man-qa-sim/ecom-contracts/generated/user';
import { Public } from '../../auth/decorators/public.decorator';
import { GrpcMetadataFactory } from '../../grpc/grpc-metadata.factory';
import { UserGrpcClient } from '../../grpc/user.client';
import { callGrpc } from '../../common/grpc-call.util';
import { toAuthTokensView, toUserView } from '../../common/mappers/user.view';
import { AuthThrottle } from '../../common/throttler/auth-throttle';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

// Thin REST façade over the ecom.user.v1 auth RPCs. Request bodies are shaped
// by class-validator DTOs (GW-6): the global ValidationPipe strips unknown
// fields, enforces types, and surfaces field-level 400s before anything
// reaches gRPC.
@Controller('auth')
@Public()
// GW-8: credential-handling routes get the tighter AUTH_THROTTLE budget
// (10/min by default) instead of the gateway's global 60/min baseline. The
// class-level decorator covers register/login/refresh/logout — all of which
// touch credentials or long-lived tokens.
@AuthThrottle()
export class AuthController {
  constructor(
    private readonly users: UserGrpcClient,
    private readonly metadata: GrpcMetadataFactory,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    const response = await callGrpc<RegisterResponse>(
      this.users.service.register(body, this.metadata.buildAnonymous()),
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
  async login(@Body() body: LoginDto) {
    const response = await callGrpc<LoginResponse>(
      this.users.service.login(body, this.metadata.buildAnonymous()),
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
  async refresh(@Body() body: RefreshTokenDto) {
    const response = await callGrpc<RefreshTokenResponse>(
      this.users.service.refreshToken(body, this.metadata.buildAnonymous()),
    );
    if (!response.tokens) {
      throw new BadRequestException('Invalid response from user service');
    }
    return { tokens: toAuthTokensView(response.tokens) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: LogoutDto): Promise<void> {
    // Logout takes the refresh token as its credential (see D4: refresh is
    // rotating and family-revoked on reuse). Access token is not required —
    // a logged-out user may already be unable to call authenticated routes.
    await callGrpc<LogoutResponse>(
      this.users.service.logout(body, this.metadata.buildAnonymous()),
    );
  }
}
