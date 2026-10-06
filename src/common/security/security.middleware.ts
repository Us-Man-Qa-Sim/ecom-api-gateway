import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import {
  HEADER_GATEWAY_INSTANCE,
  instanceIdMiddleware,
} from '../../context/instance-id.middleware';

// GW-7: public-edge hardening — Helmet, CORS, and request-size caps.
//
// The gateway sits behind NGINX in production (Phase 9), but it is still the
// first process to touch user input and the one that applies these controls
// in dev. Keeping the wiring in one function lets `main.ts` call it and e2e
// tests reuse it on a Nest test app.
export function applySecurityMiddleware(app: NestExpressApplication, config: ConfigService): void {
  const corsOrigins = config.getOrThrow<string[]>('CORS_ORIGINS');
  const corsCredentials = config.getOrThrow<boolean>('CORS_CREDENTIALS');
  const jsonLimit = config.getOrThrow<string>('BODY_LIMIT_JSON');
  const urlencodedLimit = config.getOrThrow<string>('BODY_LIMIT_URLENCODED');
  const trustProxy = config.getOrThrow<boolean | number | string>('TRUST_PROXY');

  // Must be set before any request is handled: ThrottlerGuard keys on req.ip,
  // and req.ip only honours X-Forwarded-For when the proxy is trusted.
  app.set('trust proxy', trustProxy);

  // First in the chain so every response, including errors raised by the
  // middleware below, says which gateway replica produced it.
  app.use(instanceIdMiddleware());

  // Helmet with its defaults: HSTS, X-Content-Type-Options, Referrer-Policy,
  // X-Frame-Options=SAMEORIGIN, and a conservative CSP. The gateway serves
  // only JSON APIs — no HTML, no inline scripts — so the default CSP applies
  // cleanly and we don't need to tune `script-src`/`style-src` for a UI.
  // crossOriginResourcePolicy stays at its default `same-origin`; the Next.js
  // client makes CORS XHR calls which are governed by `enableCors` below, not
  // by CORP, so this doesn't conflict with the allow-list.
  app.use(helmet());

  // CORS allow-list: exact-match origins only. Reflecting any origin would
  // defeat the point; `origin: true` echoes whatever the browser sent.
  // Non-browser traffic (NGINX → gateway, server-to-server curl) has no
  // Origin header and is unaffected.
  app.enableCors({
    origin: (origin, callback) => {
      if (origin === undefined || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Deny: pass `false` instead of throwing so the browser just sees a
      // missing Access-Control-Allow-Origin header (standard CORS failure
      // mode) instead of a 500 from an unhandled error.
      callback(null, false);
    },
    credentials: corsCredentials,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-request-id'],
    exposedHeaders: ['x-request-id', HEADER_GATEWAY_INSTANCE],
    maxAge: 600,
  });

  // Request-size caps. Nest's default parsers accept 100kb (Express default
  // too), but we set them explicitly from env so prod can tighten/widen the
  // cap without a code change. `useBodyParser` overrides the default parser
  // Nest registered during `create()`.
  app.useBodyParser('json', { limit: jsonLimit });
  app.useBodyParser('urlencoded', { limit: urlencodedLimit, extended: true });
}
