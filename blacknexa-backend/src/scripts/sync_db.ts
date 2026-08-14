/**
 * Schema sync script — `npm run db:sync`.
 *
 * Creates or aligns every table. Intended for local development and for the first
 * deploy to an empty database; for an existing production database use a migration
 * instead, because `alter` can drop a column it does not recognise.
 *
 * Refuses to run against production unless `--force` is passed, so a stray
 * invocation with a production `DATABASE_URL` cannot reshape live tables.
 */

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import { models } from "@/models";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const alter = !process.argv.includes("--no-alter");

  if (env.isProduction && !force) {
    logger.error(
      "[db:sync] refusing to sync a production database. Use a migration, or pass --force if you are certain.",
    );
    process.exit(1);
  }

  await assertDatabaseConnection();
  logger.info(`[db:sync] syncing ${Object.keys(models).length} models (alter=${alter})`);

  await sequelize.sync({ alter });

  logger.info("[db:sync] complete");
  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:sync] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
