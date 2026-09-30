import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  ORDER_SERVICE_NAME,
  type OrderServiceClient,
} from '@us-man-qa-sim/ecom-contracts/generated/order';
import { ORDER_GRPC_PACKAGE } from './grpc-tokens';

@Injectable()
export class OrderGrpcClient implements OnModuleInit {
  private client!: OrderServiceClient;

  constructor(@Inject(ORDER_GRPC_PACKAGE) private readonly grpc: ClientGrpc) {}

  onModuleInit(): void {
    this.client = this.grpc.getService<OrderServiceClient>(ORDER_SERVICE_NAME);
  }

  get service(): OrderServiceClient {
    return this.client;
  }
}
