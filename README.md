# api-gateway

Public HTTP gateway for the ecom platform. Sits behind NGINX (Phase 9), verifies JWTs, and forwards to `user-service`, `product-service` and `order-service` over gRPC. This is the only service the frontend ever talks to.

## Status

Phase 4 (`GW-1` – `GW-11`) complete:

- NestJS 12 HTTP app on `:3000` with pino logging, config validation (zod), multi-stage Dockerfile, Jest.
- gRPC clients for `user`, `product` and `order` wired via `ClientsModule.registerAsync`, typed by `@us-man-qa-sim/ecom-contracts`, exposed as injectable wrappers (`UserGrpcClient`, `ProductGrpcClient`, `OrderGrpcClient`).
- RS256 JWT verification via `jose`; global `JwtAuthGuard` with `@Public()` / `@Roles()` / `@CurrentUser()`.
- Request context: `x-request-id` is canonicalised (or minted) once per request and shared by pino logs, the response header and gRPC metadata; `x-user-id` / `x-user-role` are forwarded on every authenticated call.
- REST routes for `/auth/*`, `/users/me(/addresses)`, `/products`, `/orders`, `/admin/*`, with class-validator DTOs and a global `GrpcToHttpExceptionFilter`.
- Helmet, CORS allow-list, body-size caps, `trust proxy` knob, in-memory rate limiting (stricter on `/auth/*`).
- Per-call gRPC deadlines by profile (`fast` / `standard` / `long`), OpenAPI/Swagger at `/docs`.
- Tests: unit tests per component plus `test/app.e2e.spec.ts`, which boots the real `AppModule` with stubbed gRPC clients.

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

Container (from `../infra`; generates the shared JWT key pair on first run):

```bash
make keys                                   # or: node scripts/gen-jwt-keys.mjs
docker compose --profile app up -d user-service api-gateway
```

The gateway only waits for `user-service` to be healthy. product/order are soft dependencies: their routes return `503` (and `/health` reports them down) until they are up.

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

| Variable                      | Default                 | Notes                                                                                |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                    | `development`           | `development` \| `test` \| `production`                                              |
| `LOG_LEVEL`                   | `info`                  | pino level                                                                           |
| `HTTP_HOST`                   | `0.0.0.0`               |                                                                                      |
| `HTTP_PORT`                   | `3000`                  | Public port                                                                          |
| `USER_SERVICE_URL`            | `localhost:5001`        | gRPC target for `ecom.user.v1.UserService`                                           |
| `PRODUCT_SERVICE_URL`         | `localhost:5002`        | gRPC target for `ecom.product.v1.ProductService`                                     |
| `ORDER_SERVICE_URL`           | `localhost:5003`        | gRPC target for `ecom.order.v1.OrderService`                                         |
| `JWT_PUBLIC_KEY_PATH`         | _(none)_                | RSA public PEM matching user-service. Required except in test                        |
| `JWT_ISSUER`                  | `user-service`          | Must match user-service `JWT_ISSUER`                                                 |
| `JWT_AUDIENCE`                | `ecom-api`              | Must match user-service `JWT_AUDIENCE`                                               |
| `JWT_CLOCK_TOLERANCE_SECONDS` | `5`                     | Skew allowance between the two hosts                                                 |
| `GRPC_TIMEOUT_FAST_MS`        | `2000`                  | Deadline for single-row reads                                                        |
| `GRPC_TIMEOUT_STANDARD_MS`    | `5000`                  | Deadline for mutations and list calls                                                |
| `GRPC_TIMEOUT_LONG_MS`        | `10000`                 | Deadline for fan-outs and admin scans                                                |
| `CORS_ORIGINS`                | `http://localhost:3001` | Comma-separated exact-match origins                                                  |
| `CORS_CREDENTIALS`            | `false`                 | Send `Access-Control-Allow-Credentials`                                              |
| `BODY_LIMIT_JSON`             | `100kb`                 | JSON body cap (413 above it)                                                         |
| `BODY_LIMIT_URLENCODED`       | `100kb`                 | Form body cap                                                                        |
| `TRUST_PROXY`                 | `false`                 | Express `trust proxy`; set `1` behind NGINX so rate limits key on the real client IP |
| `THROTTLE_TTL_MS`             | `60000`                 | Global rate-limit window (per instance)                                              |
| `THROTTLE_LIMIT`              | `60`                    | Requests per window per IP; `/auth/*` is fixed at 10/min                             |
| `SWAGGER_ENABLED`             | `true`                  | Mount the Swagger UI + JSON spec. `false` disables both                              |
| `SWAGGER_PATH`                | `docs`                  | UI mounts at `/${SWAGGER_PATH}`, JSON at `/${SWAGGER_PATH}-json`                     |

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

## REST routes (GW-5)

Every route except the ones explicitly marked `@Public()` requires a valid access token. Admin routes additionally require `role=ADMIN` via `@Roles('ADMIN')`. Request bodies and query strings are validated by class-validator DTOs (unknown fields → `400` with a per-field `errors[]`) before anything reaches gRPC.

| Method | Path                               | Auth   | Downstream RPC                                          |
| ------ | ---------------------------------- | ------ | ------------------------------------------------------- |
| POST   | `/auth/register`                   | public | `UserService.Register`                                  |
| POST   | `/auth/login`                      | public | `UserService.Login`                                     |
| POST   | `/auth/refresh`                    | public | `UserService.RefreshToken`                              |
| POST   | `/auth/logout`                     | public | `UserService.Logout`                                    |
| GET    | `/users/me`                        | user   | `UserService.GetMe`                                     |
| GET    | `/users/me/addresses`              | user   | `UserService.ListAddresses`                             |
| POST   | `/users/me/addresses`              | user   | `UserService.CreateAddress`                             |
| GET    | `/users/me/addresses/:id`          | user   | `UserService.GetAddress`                                |
| PATCH  | `/users/me/addresses/:id`          | user   | `UserService.UpdateAddress`                             |
| DELETE | `/users/me/addresses/:id`          | user   | `UserService.DeleteAddress`                             |
| GET    | `/products`                        | public | `ProductService.ListProducts` (always `isActive: true`) |
| GET    | `/products/:id`                    | public | `ProductService.GetProduct`                             |
| POST   | `/orders`                          | user   | `OrderService.CreateOrder`                              |
| GET    | `/orders`                          | user   | `OrderService.ListMyOrders`                             |
| GET    | `/orders/:id`                      | user   | `OrderService.GetOrder`                                 |
| POST   | `/orders/:id/cancel`               | user   | `OrderService.CancelOrder`                              |
| POST   | `/admin/products`                  | admin  | `ProductService.CreateProduct`                          |
| PATCH  | `/admin/products/:id`              | admin  | `ProductService.UpdateProduct`                          |
| DELETE | `/admin/products/:id`              | admin  | `ProductService.DeleteProduct`                          |
| POST   | `/admin/products/:id/adjust-stock` | admin  | `ProductService.AdjustStock`                            |
| GET    | `/admin/orders`                    | admin  | `OrderService.ListAllOrders`                            |
| POST   | `/admin/orders/:id/ship`           | admin  | `OrderService.ShipOrder`                                |
| POST   | `/admin/orders/:id/deliver`        | admin  | `OrderService.DeliverOrder`                             |

Shared response shapes:

- `Money` → `{ amountMinor: number, currency: "ISO4217" }` (integer minor units per the plan).
- `Timestamp` → ISO 8601 string (or `null` when unset).
- `Role` → `"CUSTOMER" | "ADMIN"` (string, not the proto numeric enum).
- `OrderStatus` → `"PENDING" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED"`.
- List endpoints return `{ items|orders|products, pagination }` with `pagination: { total, page, pageSize, totalPages }`.

A global `GrpcToHttpExceptionFilter` maps downstream gRPC errors into HTTP responses:

| gRPC status                                        | HTTP |
| -------------------------------------------------- | ---- |
| `INVALID_ARGUMENT`, `OUT_OF_RANGE`                 | 400  |
| `UNAUTHENTICATED`                                  | 401  |
| `PERMISSION_DENIED`                                | 403  |
| `NOT_FOUND`                                        | 404  |
| `ALREADY_EXISTS`, `FAILED_PRECONDITION`, `ABORTED` | 409  |
| `CANCELLED`                                        | 408  |
| `RESOURCE_EXHAUSTED`                               | 429  |
| `UNIMPLEMENTED`                                    | 501  |
| `UNAVAILABLE`                                      | 503  |
| `DEADLINE_EXCEEDED`, gateway-side deadline         | 504  |
| `INTERNAL`, `UNKNOWN`, `DATA_LOSS`, unknown shapes | 500  |

4xx responses carry the downstream service's message. 5xx responses never do — gRPC transport errors include internal hostnames/IPs — so the client gets the generic status label and the real error is logged. A well-formed RPC that returns an empty/malformed payload is a `502 Bad Gateway`.

## Health

- `GET /health` — Terminus check: heap ≤ 512 MiB, RSS ≤ 1 GiB, and one gRPC readiness ping per downstream service (`user_service_grpc`, `product_service_grpc`, `order_service_grpc`) with a 2s deadline. Marked `@Public()` so it works before login.
- `GET /health/live` — pure liveness (`{status:"ok"}`), no dependencies.

The Docker `HEALTHCHECK` polls `/health` every 15 s.

## OpenAPI / Swagger (GW-9)

- `GET /docs` — Swagger UI. The sidebar is grouped by route tag (`auth`, `users`, `products`, `orders`, `admin`, `health`) and matches the layout under `src/routes/*`.
- `GET /docs-json` — raw OpenAPI 3 document. Point the Next.js client generator at this URL.

The spec declares a `bearer` HTTP security scheme (JWT). The UI's **Authorize** button accepts the access token returned by `POST /auth/login`; thanks to `persistAuthorization`, that token survives a page reload while you explore the surface.

Both the UI and the JSON spec can be turned off with `SWAGGER_ENABLED=false` — useful if you want the gateway's public surface to stop advertising its routes. `SWAGGER_PATH` changes the mount path (set to `openapi` to serve `/openapi` + `/openapi-json`).
