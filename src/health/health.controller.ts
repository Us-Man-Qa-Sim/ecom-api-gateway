import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { GrpcHealthIndicator } from '../grpc/grpc-health.indicator';

// /health is the readiness probe: it fails when the process is up but the
// gateway cannot serve traffic (memory pressure, or any downstream gRPC
// service unreachable). /health/live is pure liveness — the process is
// running — and is used by container orchestrators that need to distinguish
// "restart me" (liveness) from "stop routing to me" (readiness).
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly grpc: GrpcHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),
      this.grpc.check('user_service_grpc', 'user'),
      this.grpc.check('product_service_grpc', 'product'),
      this.grpc.check('order_service_grpc', 'order'),
    ]);
  }

  @Get('live')
  live() {
    return { status: 'ok' as const };
  }
}
