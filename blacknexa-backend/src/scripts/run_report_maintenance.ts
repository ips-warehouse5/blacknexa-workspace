/**
 * Run the nightly report maintenance once, from the command line —
 * `npm run job:reports`.
 *
 * Useful for the same reason the admin endpoint is: a retention promise that can
 * only be observed by waiting for 03:20 UTC is a promise nobody checks. Exits
 * non-zero if any file failed to purge, so it can be wired into a monitor without
 * parsing the log.
 */

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
// Imported for its side effect: this registers every model on the connection.
import "@/models";
import reportMaintenanceService from "@/services/report_maintenance.service";

async function main(): Promise<void> {
  await assertDatabaseConnection();

  const result = await reportMaintenanceService.run();
  logger.info("[job:reports] complete", result);

  await sequelize.close();
  // A failed purge leaves a file that should be gone, so it is not a clean exit.
  process.exit(result.filesFailed > 0 ? 1 : 0);
}

void main().catch((err: unknown) => {
  logger.error("[job:reports] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
