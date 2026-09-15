/**
 * Seed one operator account per role — `npm run db:seed:admin`.
 *
 * Gives the admin console a way in for each of the four roles, so the RBAC
 * behaviour can actually be exercised rather than taken on trust.
 *
 * ── Why this refuses to run in production ───────────────────────────────────
 * These accounts have a known, shared password. Creating them on a production
 * database would be handing out four working administrator logins, so the script
 * stops before touching anything when `NODE_ENV=production`. Production gets its
 * first account from `ADMIN_BOOTSTRAP_*`, which sets one password you choose.
 *
 * Idempotent: an account that already exists is left alone, password included.
 */

import logger from "@/utils/logger.util";
import env from "@/config/env.config";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import AdminUser from "@/models/admin_user.model";
import type { AdminRole } from "@/types/admin.interface";

/**
 * The development password for every seeded account.
 *
 * Long enough to satisfy the console's own policy, so these accounts behave the
 * same as a real one rather than being a special case that skips validation.
 */
const DEV_PASSWORD = "BlackNexa2026!";

const SEED_ACCOUNTS: { name: string; email: string; role: AdminRole }[] = [
  { name: "Devon Vance", email: "superadmin@blacknexa.com", role: "superadmin" },
  { name: "M. Kaur", email: "moderator@blacknexa.com", role: "moderator" },
  { name: "R. Idris", email: "advocate@blacknexa.com", role: "advocate" },
  { name: "Elena Ramos", email: "staff@blacknexa.com", role: "staff" },
];

async function main(): Promise<void> {
  if (env.isProduction) {
    logger.error(
      "[db:seed:admin] refused — these accounts share a known password and must never exist in production. Use ADMIN_BOOTSTRAP_* instead.",
    );
    process.exitCode = 1;
    return;
  }

  await assertDatabaseConnection();

  let created = 0;
  for (const account of SEED_ACCOUNTS) {
    const email = account.email.toLowerCase();
    const existing = await AdminUser.findOne({ where: { email } });

    if (existing) {
      logger.info(`[db:seed:admin] ${email} already exists — left unchanged`);
      continue;
    }

    await AdminUser.create({
      email,
      name: account.name,
      // Hashed by the model's beforeSave hook.
      password_hash: DEV_PASSWORD,
      role: account.role,
      // Deliberately false: being asked to change the password on every seeded
      // account would make the seed useless for walking the console.
      must_change_password: false,
    });
    created += 1;
    logger.info(`[db:seed:admin] created ${email} (${account.role})`);
  }

  logger.info(`[db:seed:admin] complete — ${created} account(s) created`);
  logger.warn(`[db:seed:admin] every seeded account uses the password: ${DEV_PASSWORD}`);
  logger.warn(
    "[db:seed:admin] sign-in also needs the emailed code. Without SMTP configured the code is logged, and the API returns it as `devCode` outside production.",
  );

  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:seed:admin] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exitCode = 1;
});
