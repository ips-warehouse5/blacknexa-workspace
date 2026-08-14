/**
 * Snapshot / integrity CLI — `npm run db:snapshot [-- --integrity]`.
 *
 * Takes an append-only snapshot of every persisted table, or runs the integrity
 * check. Useful before a schema change, and as the manual counterpart to the
 * automatic snapshot the maintenance cron takes each cycle.
 */

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import persistenceService from "@/services/persistence.service";

async function main(): Promise<void> {
  await assertDatabaseConnection();

  if (process.argv.includes("--integrity")) {
    const result = await persistenceService.integrityCheck();
    logger.info("[snapshot] integrity check", {
      ok: result.success,
      tableCounts: result.tableCounts,
      orphaned: result.orphanedRecords,
      checksum: result.checksum,
    });
    for (const issue of result.issues) logger.warn(`[snapshot] issue: ${issue}`);
    await sequelize.close();
    // A failed integrity check exits non-zero so it can gate a deploy step.
    process.exit(result.success ? 0 : 1);
  }

  const snapshot = await persistenceService.snapshotAllTables();
  const id = await persistenceService.storeSnapshot(snapshot, false);
  const totalRows = Object.values(snapshot.counts).reduce((a, b) => a + b, 0);

  logger.info("[snapshot] stored", {
    id,
    totalRows,
    checksum: snapshot.checksum,
    counts: snapshot.counts,
  });

  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[snapshot] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
