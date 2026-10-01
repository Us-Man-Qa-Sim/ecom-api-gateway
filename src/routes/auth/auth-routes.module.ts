import { Module } from '@nestjs/common';
import { GrpcModule } from '../../grpc/grpc.module';
import { AuthController } from './auth.controller';

// Imports GrpcModule for the user client + metadata factory. The global
// JwtAuthGuard still runs over every route; the controller opts out via
// @Public() so unauthenticated callers reach register/login/refresh/logout.
@Module({
  imports: [GrpcModule],
  controllers: [AuthController],
})
export class AuthRoutesModule {}
