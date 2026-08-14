/**
 * Express application and middleware pipeline.
 *
 * Order is deliberate — each stage assumes the previous one has run:
 *
 *   1. `trust proxy`        so `req.ip` is the client, not the load balancer
 *   2. `helmet`             security headers before anything can respond
 *   3. `disable x-powered-by`  no stack advertisement
 *   4. `cors`               allowlist check, and preflights answered early
 *   5. body parsers         with a size cap
 *   6. `compression`        after parsing, before any response is written
 *   7. `logUrl`             assigns the request id used by every later log line
 *   8. `sanitizeRequest`    prototype-pollution and control-char stripping, so
 *                           routes and validators only ever see cleaned input
 *   9. routes               each with its own rate limiter, validator and guard
 *  10. 404 then error handler, which must be last to catch everything above
 */

import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import env from "@/config/env.config";
import corsOptions from "@/config/cors.config";
import { mountRoutes } from "@/routes";
import { logUrl } from "@/middlewares/log_url.middleware";
import { sanitizeRequest } from "@/middlewares/sanitize.middleware";
import { errorHandler, notFoundHandler } from "@/middlewares/error.middleware";

/** Maximum JSON body size. Evidence payloads arrive as base64, hence the headroom. */
const JSON_BODY_LIMIT = "25mb";

export function createApp(): Express {
  const app = express();

  // 1. Proxy awareness. Without this, every request appears to come from the load
  //    balancer: rate limits become global instead of per-client, and the IP
  //    recorded on a ToS agreement is meaningless.
  if (env.trustProxy !== false) {
    app.set("trust proxy", env.trustProxy);
  }

  // 2. Security headers.
  app.use(
    helmet({
      // HSTS: one year, subdomains included. Only meaningful over TLS, which the
      // production deployment terminates at the proxy.
      hsts: env.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The server-rendered article page inlines its JSON-LD block.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          // Article art is served from this origin and from Pexels (the curated
          // fallback pool), so both must be allowed for the HTML page to render.
          imgSrc: ["'self'", "data:", "https://images.pexels.com"],
          mediaSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      // Article images and audio are embedded cross-origin by the apps and by
      // social crawlers, so the default same-origin resource policy is loosened.
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // The API serves no cross-origin-isolated content and this header breaks
      // embedding of the article page's imagery.
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      frameguard: { action: "deny" },
      noSniff: true,
    }),
  );

  // 3. Do not advertise the stack.
  app.disable("x-powered-by");

  // 4. CORS. Preflights are answered here and never reach a route.
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  // 5. Body parsing, size-capped so a large body cannot exhaust memory.
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // 6. Compression. Skipped for the binary media endpoints, where the payload is
  //    already-compressed JPEG/PNG/MP3 and gzip only burns CPU.
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path.startsWith("/api/v1/news/image/")) return false;
        if (req.path.startsWith("/api/v1/news/audio/")) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // 7. Request id + access log.
  app.use(logUrl);

  // 8. Input sanitisation, before validators and controllers.
  app.use(sanitizeRequest);

  // 9. Routes.
  mountRoutes(app);

  // 10. Fallbacks. `errorHandler` must be registered last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
