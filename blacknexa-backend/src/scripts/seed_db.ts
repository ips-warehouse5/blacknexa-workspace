/**
 * Seed script — `npm run db:seed`.
 *
 * Inserts the 18 bundled seed articles and re-caches the 19 curated jurisdiction
 * profiles, so a fresh database serves a populated feed and a working geo-legal
 * lookup before the first AI run.
 *
 * Idempotent: article seeding is skipped when the table is non-empty, and
 * jurisdiction caching is an upsert.
 */

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import newsService from "@/services/news.service";
import geoLegalService from "@/services/geo_legal.service";
import authService from "@/services/auth.service";

async function main(): Promise<void> {
  await assertDatabaseConnection();

  logger.info("[db:seed] seeding articles");
  await newsService.ensureSeed();
  logger.info(`[db:seed] article count: ${await newsService.count()}`);

  logger.info("[db:seed] caching curated jurisdictions");
  const result = await geoLegalService.refreshCuratedJurisdictions();
  logger.info(`[db:seed] ${result.refreshed}/${result.total} jurisdictions cached`);

  // Only creates an account if ADMIN_BOOTSTRAP_* is set and no admin exists.
  await authService.bootstrapAdmin();

  logger.info("[db:seed] complete");
  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:seed] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
