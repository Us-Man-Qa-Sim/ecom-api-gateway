import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { GrpcModule } from '../grpc/grpc.module';

@Module({
  imports: [TerminusModule, GrpcModule],
  controllers: [HealthController],
})
export class HealthModule {}
