import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GRPC_LOADER_OPTIONS, PROTO_FILES } from '@us-man-qa-sim/ecom-contracts';
import { ECOM_USER_V1_PACKAGE_NAME } from '@us-man-qa-sim/ecom-contracts/generated/user';
import { ECOM_PRODUCT_V1_PACKAGE_NAME } from '@us-man-qa-sim/ecom-contracts/generated/product';
import { ECOM_ORDER_V1_PACKAGE_NAME } from '@us-man-qa-sim/ecom-contracts/generated/order';
import { RequestContextModule } from '../context/request-context.module';
import { GrpcCallTimeouts } from '../common/grpc-call.util';
import { ORDER_GRPC_PACKAGE, PRODUCT_GRPC_PACKAGE, USER_GRPC_PACKAGE } from './grpc-tokens';
import { UserGrpcClient } from './user.client';
import { ProductGrpcClient } from './product.client';
import { OrderGrpcClient } from './order.client';
import { GrpcHealthIndicator } from './grpc-health.indicator';
import { GrpcMetadataFactory } from './grpc-metadata.factory';

// One ClientsModule.registerAsync entry per downstream service. All three
// share the `common.proto` include so message types cross-referenced from the
// service protos resolve. The @grpc/proto-loader options come from contracts
// so ts-proto's field naming and Nest's runtime decoder stay in sync.
@Module({
  imports: [
    RequestContextModule,
    ClientsModule.registerAsync({
      isGlobal: false,
      clients: [
        {
          name: USER_GRPC_PACKAGE,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            transport: Transport.GRPC,
            options: {
              url: config.getOrThrow<string>('USER_SERVICE_URL'),
              package: [ECOM_USER_V1_PACKAGE_NAME],
              protoPath: [PROTO_FILES.user, PROTO_FILES.common],
              loader: GRPC_LOADER_OPTIONS,
            },
          }),
        },
        {
          name: PRODUCT_GRPC_PACKAGE,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            transport: Transport.GRPC,
            options: {
              url: config.getOrThrow<string>('PRODUCT_SERVICE_URL'),
              package: [ECOM_PRODUCT_V1_PACKAGE_NAME],
              protoPath: [PROTO_FILES.product, PROTO_FILES.common],
              loader: GRPC_LOADER_OPTIONS,
            },
          }),
        },
        {
          name: ORDER_GRPC_PACKAGE,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            transport: Transport.GRPC,
            options: {
              url: config.getOrThrow<string>('ORDER_SERVICE_URL'),
              package: [ECOM_ORDER_V1_PACKAGE_NAME],
              protoPath: [PROTO_FILES.order, PROTO_FILES.common],
              loader: GRPC_LOADER_OPTIONS,
            },
          }),
        },
      ],
    }),
  ],
  providers: [
    UserGrpcClient,
    ProductGrpcClient,
    OrderGrpcClient,
    GrpcHealthIndicator,
    GrpcMetadataFactory,
    GrpcCallTimeouts,
  ],
  exports: [
    UserGrpcClient,
    ProductGrpcClient,
    OrderGrpcClient,
    GrpcHealthIndicator,
    GrpcMetadataFactory,
    GrpcCallTimeouts,
  ],
})
export class GrpcModule {}
