# api-gateway

Public HTTP gateway for the ecom platform. Sits behind NGINX (Phase 9), verifies JWTs, and forwards to `user-service`, `product-service` and `order-service` over gRPC. This is the only service the frontend ever talks to.

## Status

`GW-1` scaffold complete: NestJS 12 HTTP app with pino logging, config validation (zod), `/health` liveness + memory checks via `@nestjs/terminus`, multi-stage Dockerfile, Jest.

Follow-ups (`GW-2` → `GW-11`) add gRPC clients, JWT guard, DTO validation, REST routes, CORS/Helmet, throttler, Swagger and error mapping.

## Responsibilities (target — see BACKEND_PLAN.md §Phase 4)

- JWT verification (RS256 public key)
- REST routing for all public endpoints (`/auth/*`, `/users/*`, `/products`, `/orders`, `/admin/*`)
- gRPC clients to user-service, product-service, order-service
- Request validation (class-validator DTOs) + gRPC → HTTP error mapping
- Rate limiting (`@nestjs/throttler`), CORS, Helmet
- OpenAPI/Swagger docs

## Ports

| Port | Purpose |
|---|---|
| `3000` | Public HTTP (NGINX proxies here) |

## Development

```bash
cp .env.example .env         # adjust ports if 3000/5001/5002/5003 are taken
npm ci
npm run start:dev            # pino-pretty output
curl http://localhost:3000/health
```

Container:

```bash
docker compose --profile app up -d api-gateway
```

The gateway `depends_on` all three backend services in `infra/docker-compose.yml`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run build` | `tsc -p tsconfig.build.json` |
| `npm run start` | Run compiled `dist/main.js` |
| `npm run start:dev` | ts-node, transpile-only |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` / `test:watch` / `test:cov` | Jest via @swc/jest |

## Environment

See `.env.example`. All variables are validated at boot with zod; unknown or malformed values crash the process before Nest starts.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | `info` | pino level |
| `HTTP_HOST` | `0.0.0.0` | |
| `HTTP_PORT` | `3000` | Public port |
| `USER_SERVICE_URL` | `localhost:5001` | Wired in GW-2 |
| `PRODUCT_SERVICE_URL` | `localhost:5002` | Wired in GW-2 |
| `ORDER_SERVICE_URL` | `localhost:5003` | Wired in GW-2 |

## Health

- `GET /health` — Terminus check (currently: heap ≤ 512 MiB, RSS ≤ 1 GiB). Extended in GW-2 with gRPC readiness pings for each downstream service.
- `GET /health/live` — pure liveness (`{status:"ok"}`), no dependencies.

The Docker `HEALTHCHECK` polls `/health` every 15 s.
