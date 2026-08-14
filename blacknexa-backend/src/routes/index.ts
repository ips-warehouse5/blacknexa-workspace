/**
 * Route tree.
 *
 * `mountRoutes` attaches every path the Cloudflare Worker served, at the same URL,
 * plus the new `/api/v1/admin/auth/*` surface.
 *
 * Two groups sit outside `/api/v1` because crawlers expect them at the domain
 * root: the SEO files (`/robots.txt`, `/sitemap*.xml`, `/rss.xml`) and the
 * server-rendered article page (`/news/:slug`). `/news/:slug` is mounted last so
 * it cannot shadow anything under `/api`.
 */

import { Router, type Express } from "express";
import newsRoutes from "@/routes/news.route";
import geoLegalRoutes from "@/routes/geo_legal.route";
import platformRoutes from "@/routes/platform.route";
import enterpriseRoutes from "@/routes/enterprise.route";
import adminRoutes from "@/routes/admin.route";
import seoController from "@/controllers/seo.controller";
import newsService from "@/services/news.service";
import { apiLimiter, readLimiter } from "@/middlewares/rate_limit.middleware";
import { asyncHandler } from "@/middlewares/error.middleware";
import { validate } from "@/middlewares/validate.middleware";
import { INDEXNOW_KEY_PATH } from "@/config/constants";
import env from "@/config/env.config";

/** Every route this service serves, for the discovery payload and the docs. */
export const ROUTE_MANIFEST: string[] = [
  "GET    /ping",
  "GET    /robots.txt",
  `GET    ${INDEXNOW_KEY_PATH}`,
  "GET    /rss.xml",
  "GET    /sitemap.xml",
  "GET    /sitemap-news.xml",
  "GET    /sitemap-index.xml",
  "GET    /news/:slug (server-rendered HTML for crawlers)",
  "GET    /api/v1/podcast/feed.json",
  // News
  "GET    /api/v1/news/feed?category=&scope=&search=&limit=",
  "GET    /api/v1/news/local?lat=&lng=&city=&region=&country=&countryCode=&nearby=&limit=",
  "GET    /api/v1/news/briefings",
  "GET    /api/v1/news/article/:slug",
  "GET    /api/v1/news/translate/:slug?lang=",
  "GET    /api/v1/news/image/:articleId",
  "GET    /api/v1/news/audio/:articleId",
  "GET    /api/v1/news/:slug/schema.json",
  "POST   /api/v1/news/generate",
  "POST   /api/v1/news/refresh-daily?force=1 (admin)",
  "POST   /api/v1/news/prune-duplicates (admin)",
  "POST   /api/v1/news/backfill-images?limit= (admin)",
  "POST   /api/v1/news/backfill-translations?limit= (admin)",
  // Geo-Legal
  "GET    /api/v1/geo-legal/regions",
  "GET    /api/v1/geo-legal/lookup?country=&lat=&lng=&lang=",
  "POST   /api/v1/geo-legal/validate",
  "POST   /api/v1/geo-legal/dispatch",
  "POST   /api/v1/geo-legal/incident/create",
  "GET    /api/v1/geo-legal/incident/:id",
  "DELETE /api/v1/geo-legal/incident/:id",
  "POST   /api/v1/geo-legal/refresh (admin)",
  // Platform
  "GET    /api/v1/platform/ping",
  "GET    /api/v1/platform/news/feed?category=&locale=&limit=",
  "GET    /api/v1/platform/news/categories",
  "GET    /api/v1/platform/news/locales",
  "POST   /api/v1/platform/tipping/creator/register",
  "GET    /api/v1/platform/tipping/creators",
  "GET    /api/v1/platform/tipping/creator/:id",
  "GET    /api/v1/platform/tipping/creator/:id/tips",
  "GET    /api/v1/platform/tipping/creator/:id/balance",
  "GET    /api/v1/platform/tipping/creator/:id/ledger",
  "GET    /api/v1/platform/tipping/creator/:id/payouts",
  "GET    /api/v1/platform/tipping/sender/:userId/tips",
  "POST   /api/v1/platform/tipping/send (Idempotency-Key header)",
  "GET    /api/v1/platform/tipping/tip/:id",
  "POST   /api/v1/platform/tipping/webhook/stripe",
  "GET    /api/v1/platform/tipping/fees",
  "POST   /api/v1/platform/tipping/payout/request (Idempotency-Key header)",
  "GET    /api/v1/platform/tipping/payout/:id",
  "POST   /api/v1/platform/tipping/payout/:id/status (admin)",
  "GET    /api/v1/platform/cache/stats",
  "POST   /api/v1/platform/cache/prune (admin)",
  "GET    /api/v1/platform/queue/stats",
  "POST   /api/v1/platform/queue/drain?limit= (admin)",
  "POST   /api/v1/platform/queue/prune?days= (admin)",
  "POST   /api/v1/platform/moderation/check",
  "POST   /api/v1/platform/tos/agree",
  "GET    /api/v1/platform/tos/check?userId=",
  "GET    /api/v1/platform/tos/text",
  "GET    /api/v1/platform/compliance/disclaimer",
  "GET    /api/v1/platform/compliance/status",
  "GET    /api/v1/platform/persistence/snapshot (admin)",
  "POST   /api/v1/platform/persistence/restore (admin)",
  "GET    /api/v1/platform/persistence/integrity (admin)",
  "GET    /api/v1/platform/persistence/snapshots?limit= (admin)",
  // Enterprise
  "GET    /api/v1/blacknexa/categories",
  "POST   /api/v1/blacknexa/generate-story",
  "POST   /api/v1/blacknexa/publish-verified-story",
  "GET    /api/v1/blacknexa/feed?location=&category=",
  "GET    /api/v1/blacknexa/stats",
  "POST   /api/v1/blacknexa/artists/tip",
  "POST   /api/v1/blacknexa/hardware/beacon-trigger",
  "GET    /api/v1/blacknexa/weather?lat=&lon=",
  "GET    /api/v1/blacknexa/live-chat (WebSocket)",
  // Admin
  "POST   /api/v1/admin/auth/login",
  "POST   /api/v1/admin/auth/refresh",
  "POST   /api/v1/admin/auth/logout",
  "GET    /api/v1/admin/auth/me",
  "POST   /api/v1/admin/auth/admins (super-admin)",
];

export function mountRoutes(app: Express): void {
  // ── Health ─────────────────────────────────────────────────────────────────
  // Kept in the Worker's shape so any existing uptime monitor still passes.
  app.get("/ping", (_req, res) => {
    res.status(200).json({
      ok: true,
      now: new Date().toISOString(),
      platform: "blacknexa-news",
    });
  });

  // ── Crawler discovery (domain root) ────────────────────────────────────────
  app.get("/robots.txt", asyncHandler((req, res) => seoController.robots(req, res)));
  app.get(
    INDEXNOW_KEY_PATH,
    asyncHandler((req, res) => seoController.indexNowKey(req, res)),
  );
  app.get("/rss.xml", readLimiter, asyncHandler((req, res) => seoController.rss(req, res)));
  app.get(
    "/sitemap.xml",
    readLimiter,
    asyncHandler((req, res) => seoController.sitemap(req, res)),
  );
  app.get(
    "/sitemap-news.xml",
    readLimiter,
    asyncHandler((req, res) => seoController.newsSitemap(req, res)),
  );
  app.get(
    "/sitemap-index.xml",
    asyncHandler((req, res) => seoController.sitemapIndex(req, res)),
  );

  // ── API v1 ─────────────────────────────────────────────────────────────────
  const api = Router();
  api.use(apiLimiter);

  api.get(
    "/podcast/feed.json",
    readLimiter,
    asyncHandler((req, res) => seoController.podcastFeed(req, res)),
  );

  api.use("/news", newsRoutes);
  api.use("/geo-legal", geoLegalRoutes);
  api.use("/platform", platformRoutes);
  api.use("/blacknexa", enterpriseRoutes);
  api.use("/admin/auth", adminRoutes);

  // Route discovery, mirroring the Worker's 404 payload. Outside production only:
  // publishing the full surface in production is free reconnaissance.
  if (!env.isProduction) {
    api.get("/routes", (_req, res) => {
      res.status(200).json({ success: true, routes: ROUTE_MANIFEST });
    });
  }

  app.use("/api/v1", api);

  // ── Server-rendered article page (domain root, mounted last) ────────────────
  app.get(
    "/news/:slug",
    readLimiter,
    validate("news.articleBySlug"),
    asyncHandler((req, res) => seoController.articleHtml(req, res)),
  );

  // ── Readiness probe ────────────────────────────────────────────────────────
  // Distinct from /ping: this one touches the database, so an orchestrator can
  // tell "process is up" from "process can actually serve".
  app.get(
    "/health",
    asyncHandler(async (_req, res) => {
      const articles = await newsService.count();
      res.status(200).json({
        ok: true,
        now: new Date().toISOString(),
        database: "connected",
        articles,
        aiGateway: env.ai.enabled ? "configured" : "not configured",
      });
    }),
  );
}

export default mountRoutes;
