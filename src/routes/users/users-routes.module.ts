import { Module } from '@nestjs/common';
import { GrpcModule } from '../../grpc/grpc.module';
import { UsersController } from './users.controller';

@Module({
  imports: [GrpcModule],
  controllers: [UsersController],
})
export class UsersRoutesModule {}
