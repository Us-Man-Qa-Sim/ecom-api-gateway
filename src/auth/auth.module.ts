import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from './jwt.service';

// AuthModule is imported once by AppModule. The guard is registered globally
// via APP_GUARD so every route is authenticated by default; opt out with
// @Public(). Role checks piggy-back on the same guard via @Roles().
@Module({
  providers: [JwtService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [JwtService],
})
export class AuthModule {}
