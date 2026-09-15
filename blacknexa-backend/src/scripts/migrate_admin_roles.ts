/**
 * Migrate operator roles onto the four-role model — `npm run db:migrate:roles`.
 *
 * The role set changed from five (`super-admin | admin | editor | auditor |
 * moderator`) to four (`superadmin | moderator | advocate | staff`). Rows
 * written before that change still carry the old spelling, and because the
 * permission matrix is keyed by the new values, such an account resolves to no
 * permissions at all — it can sign in and then do nothing, with no error that
 * explains why.
 *
 * The mapping widens nobody's access beyond what they already had:
 *   super-admin → superadmin  (same thing, renamed)
 *   admin       → superadmin  (had every operational route the old model offered)
 *   editor      → superadmin  (news publishing is Super Admin in the new matrix)
 *   auditor     → superadmin  (audit.view is Super Admin in the new matrix)
 *   moderator   → moderator   (unchanged)
 *
 * `admin`, `editor` and `auditor` folding into `superadmin` is a genuine
 * widening for those three, so the script reports each one it touches by email.
 * Review that list: an account that should now be a Moderator is better changed
 * by hand than left as a Super Admin.
 *
 * Idempotent — a second run finds nothing to do.
 */

import { QueryTypes } from "sequelize";

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import type { AdminRole } from "@/types/admin.interface";

/** Old role value → new role value. */
const ROLE_MAP: Record<string, AdminRole> = {
  "super-admin": "superadmin",
  admin: "superadmin",
  editor: "superadmin",
  auditor: "superadmin",
  moderator: "moderator",
};

/** Roles that gain access under the mapping, so the operator is told about them. */
const WIDENED = new Set(["admin", "editor", "auditor"]);

async function main(): Promise<void> {
  await assertDatabaseConnection();

  const rows = await sequelize.query<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM admin_users WHERE role = ANY($legacy)`,
    {
      type: QueryTypes.SELECT,
      bind: { legacy: Object.keys(ROLE_MAP).filter((r) => ROLE_MAP[r] !== r) },
    },
  );

  if (rows.length === 0) {
    logger.info("[db:migrate:roles] nothing to migrate — every account is already on the new role model");
    await sequelize.close();
    return;
  }

  const widened: string[] = [];

  for (const row of rows) {
    const next = ROLE_MAP[row.role];
    if (!next) continue;

    await sequelize.query(`UPDATE admin_users SET role = $next WHERE id = $id`, {
      type: QueryTypes.UPDATE,
      bind: { next, id: row.id },
    });

    logger.info(`[db:migrate:roles] ${row.email}: ${row.role} → ${next}`);
    if (WIDENED.has(row.role)) widened.push(`${row.email} (was ${row.role})`);
  }

  logger.info(`[db:migrate:roles] complete — ${rows.length} account(s) migrated`);

  if (widened.length > 0) {
    logger.warn(
      "[db:migrate:roles] these accounts are now Super Admin and hold more access than before — review each one:",
    );
    for (const entry of widened) logger.warn(`[db:migrate:roles]   • ${entry}`);
  }

  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:migrate:roles] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exitCode = 1;
});
