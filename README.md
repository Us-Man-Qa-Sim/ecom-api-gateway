# api-gateway

HTTP REST gateway for the ecom platform. Receives requests from the frontend via NGINX, validates JWTs, and forwards to backend microservices over gRPC.

## Responsibilities

- JWT verification (RS256 public key)
- REST routing for all public endpoints
- gRPC client connections to user-service, product-service, order-service
- Request validation (class-validator DTOs)
- gRPC status to HTTP status error mapping
- Rate limiting, CORS, Helmet
- OpenAPI/Swagger documentation

## Development

```bash
npm install
npm run start:dev
```

## Environment

See `.env.example` for required configuration.
