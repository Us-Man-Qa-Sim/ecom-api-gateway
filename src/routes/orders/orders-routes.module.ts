import { Module } from '@nestjs/common';
import { GrpcModule } from '../../grpc/grpc.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [GrpcModule],
  controllers: [OrdersController],
})
export class OrdersRoutesModule {}
