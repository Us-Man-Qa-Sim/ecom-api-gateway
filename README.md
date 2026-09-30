# api-gateway

Public HTTP gateway for the ecom platform. Sits behind NGINX (Phase 9), verifies JWTs, and forwards to `user-service`, `product-service` and `order-service` over gRPC. This is the only service the frontend ever talks to.

## Status

`GW-1` – `GW-3` complete:

- NestJS 12 HTTP app on `:3000` with pino logging, config validation (zod), multi-stage Dockerfile, Jest.
- gRPC clients for `user`, `product` and `order` wired via `ClientsModule.registerAsync`, typed by `@us-man-qa-sim/ecom-contracts` (`UserServiceClient`, `ProductServiceClient`, `OrderServiceClient`), exposed as injectable wrappers (`UserGrpcClient`, `ProductGrpcClient`, `OrderGrpcClient`).
- `/health` extended with a gRPC readiness ping per downstream service via `GrpcHealthIndicator` (calls `waitForReady` on each channel with a 2s deadline).
- RS256 JWT verification via `jose`. Global `JwtAuthGuard` (registered via `APP_GUARD`) authenticates every route by default; opt out with `@Public()` and restrict by role with `@Roles('ADMIN', …)`. Verified identity attaches to `req.user` and is available in controllers via `@CurrentUser()`.

Follow-ups (`GW-4` → `GW-11`) add metadata forwarding, REST routes, DTO validation, CORS/Helmet, throttler, Swagger and error mapping.

## Responsibilities (target — see BACKEND_PLAN.md §Phase 4)

- JWT verification (RS256 public key)
- REST routing for all public endpoints (`/auth/*`, `/users/*`, `/products`, `/orders`, `/admin/*`)
- gRPC clients to user-service, product-service, order-service
- Request validation (class-validator DTOs) + gRPC → HTTP error mapping
- Rate limiting (`@nestjs/throttler`), CORS, Helmet
- OpenAPI/Swagger docs

## Ports

| Port   | Purpose                          |
| ------ | -------------------------------- |
| `3000` | Public HTTP (NGINX proxies here) |

## Development

```bash
cp .env.example .env         # adjust ports if 3000/5001/5002/5003 are taken
npm ci
# Copy the RS256 public key that user-service signs with
mkdir -p keys
cp ../user-service/keys/jwt-public.pem keys/jwt-public.pem
npm run start:dev            # pino-pretty output
curl http://localhost:3000/health
```

Container:

```bash
docker compose --profile app up -d api-gateway
```

The gateway `depends_on` all three backend services in `infra/docker-compose.yml`.

## Scripts

| Script                                 | Purpose                      |
| -------------------------------------- | ---------------------------- |
| `npm run build`                        | `tsc -p tsconfig.build.json` |
| `npm run start`                        | Run compiled `dist/main.js`  |
| `npm run start:dev`                    | ts-node, transpile-only      |
| `npm run lint` / `lint:fix`            | ESLint                       |
| `npm run format` / `format:check`      | Prettier                     |
| `npm test` / `test:watch` / `test:cov` | Jest via @swc/jest           |

## Environment

See `.env.example`. All variables are validated at boot with zod; unknown or malformed values crash the process before Nest starts.

| Variable                      | Default          | Notes                                                         |
| ----------------------------- | ---------------- | ------------------------------------------------------------- |
| `NODE_ENV`                    | `development`    | `development` \| `test` \| `production`                       |
| `LOG_LEVEL`                   | `info`           | pino level                                                    |
| `HTTP_HOST`                   | `0.0.0.0`        |                                                               |
| `HTTP_PORT`                   | `3000`           | Public port                                                   |
| `USER_SERVICE_URL`            | `localhost:5001` | gRPC target for `ecom.user.v1.UserService`                    |
| `PRODUCT_SERVICE_URL`         | `localhost:5002` | gRPC target for `ecom.product.v1.ProductService`              |
| `ORDER_SERVICE_URL`           | `localhost:5003` | gRPC target for `ecom.order.v1.OrderService`                  |
| `JWT_PUBLIC_KEY_PATH`         | _(none)_         | RSA public PEM matching user-service. Required except in test |
| `JWT_ISSUER`                  | `user-service`   | Must match user-service `JWT_ISSUER`                          |
| `JWT_AUDIENCE`                | `ecom-api`       | Must match user-service `JWT_AUDIENCE`                        |
| `JWT_CLOCK_TOLERANCE_SECONDS` | `5`              | Skew allowance between the two hosts                          |

## Auth model (GW-3)

Every route is authenticated by default — `JwtAuthGuard` is registered via `APP_GUARD` in `AuthModule`. The guard:

1. Reads `Authorization: Bearer <token>` from the request.
2. Verifies signature (RS256), issuer, audience and expiry via `jose.jwtVerify` using the public key at `JWT_PUBLIC_KEY_PATH`.
3. Attaches the verified identity (`{ userId, role, email? }`) to `req.user`.
4. If `@Roles(...)` is present on the handler or class, enforces membership; otherwise any authenticated caller is allowed.

Route decorators (from `src/auth/decorators/`):

- `@Public()` — bypass auth (used by `/auth/login`, `/auth/register`, `/health`, browse endpoints).
- `@Roles('ADMIN', 'CUSTOMER')` — allow only listed roles. Method-level metadata wins over class-level.
- `@CurrentUser()` — parameter decorator that returns the verified identity.

Failures map cleanly to HTTP:

| Situation                    | Response                                        |
| ---------------------------- | ----------------------------------------------- |
| Missing or malformed header  | `401 Unauthorized` (`Missing bearer token`)     |
| Expired/invalid/wrong-signer | `401 Unauthorized` (`Invalid or expired token`) |
| Valid token, wrong role      | `403 Forbidden` (`Insufficient role`)           |

The underlying verification error is logged at `debug` and never returned to the client — it can hint at whether it was expiry, signature or audience that failed.

## gRPC clients (GW-2)

`GrpcModule` registers one `ClientsModule` entry per service:

| Wrapper             | Package name      | Env var               | Proto files                      |
| ------------------- | ----------------- | --------------------- | -------------------------------- |
| `UserGrpcClient`    | `ecom.user.v1`    | `USER_SERVICE_URL`    | `user.proto` + `common.proto`    |
| `ProductGrpcClient` | `ecom.product.v1` | `PRODUCT_SERVICE_URL` | `product.proto` + `common.proto` |
| `OrderGrpcClient`   | `ecom.order.v1`   | `ORDER_SERVICE_URL`   | `order.proto` + `common.proto`   |

Each wrapper resolves its typed service handle in `onModuleInit()` and exposes it via `.service` (`UserServiceClient` from ts-proto). Controllers depend on the wrapper, not on `ClientGrpc` directly, so mocking one service in a test is a single `useValue` override.

## Health

- `GET /health` — Terminus check: heap ≤ 512 MiB, RSS ≤ 1 GiB, and one gRPC readiness ping per downstream service (`user_service_grpc`, `product_service_grpc`, `order_service_grpc`) with a 2s deadline. Marked `@Public()` so it works before login.
- `GET /health/live` — pure liveness (`{status:"ok"}`), no dependencies.

The Docker `HEALTHCHECK` polls `/health` every 15 s.
