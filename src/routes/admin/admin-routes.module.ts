import { Module } from '@nestjs/common';
import { GrpcModule } from '../../grpc/grpc.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [GrpcModule],
  controllers: [AdminController],
})
export class AdminRoutesModule {}
