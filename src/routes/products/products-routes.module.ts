import { Module } from '@nestjs/common';
import { GrpcModule } from '../../grpc/grpc.module';
import { ProductsController } from './products.controller';

@Module({
  imports: [GrpcModule],
  controllers: [ProductsController],
})
export class ProductsRoutesModule {}
