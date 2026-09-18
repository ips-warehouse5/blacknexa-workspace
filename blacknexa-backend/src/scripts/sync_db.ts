/**
 * Schema sync script — `npm run db:sync`.
 *
 * Creates or aligns every table. Intended for local development and for the first
 * deploy to an empty database; for an existing production database use a migration
 * instead, because `alter` can drop a column it does not recognise.
 *
 * Refuses to run against production unless `--force` is passed, so a stray
 * invocation with a production `DATABASE_URL` cannot reshape live tables.
 *
 * ── `alter` and foreign keys ───────────────────────────────────────────────
 * On Postgres, `alter` cannot change a column that carries a foreign key.
 * Sequelize builds `changeColumn` by concatenation and emits the `REFERENCES …`
 * clause as its own statement, which is not valid SQL:
 *
 *     ALTER TABLE "x" ALTER COLUMN "y" SET NOT NULL;
 *     REFERENCES "z" ("id") ON DELETE CASCADE;   ← syntax error at or near "REFERENCES"
 *
 * Nineteen columns in this schema carry a reference, so on a database whose
 * shape has drifted this fails partway — after the creates and column additions
 * have already been applied. The failure is caught below and explained, because
 * "syntax error at or near REFERENCES" gives no hint that the fix is to stop
 * using `alter` on a populated database and run a migration instead.
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
  const message = err instanceof Error ? err.message : String(err);

  /*
   * Translate the one failure that is guaranteed to confuse.
   *
   * It reads like a bug in a model definition, but nothing is malformed: it is
   * `alter` meeting a foreign-key column, and the work already applied before
   * the failure is sound. Saying so here saves the next person the hour it
   * takes to discover that on their own.
   */
  if (/syntax error at or near "REFERENCES"/i.test(message)) {
    logger.error(
      "[db:sync] `alter` cannot modify a column that carries a foreign key — this is a " +
        "Sequelize limitation on Postgres, not a fault in the schema.",
    );
    logger.error(
      "[db:sync] Anything this run created or added was applied before the failure; " +
        "only the column alterations were skipped.",
    );
    logger.error(
      "[db:sync] On a database that already has data, use a migration instead: " +
        "`npm run db:migrate:profile-faq` applies the current additive changes, " +
        "and `npm run db:migrate:roles` the admin-role one.",
    );
  }

  logger.error("[db:sync] failed", {
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
