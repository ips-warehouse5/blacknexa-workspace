/**
 * Move Google-only avatars back to initials — `npm run db:migrate:google-avatars`.
 *
 * Google sign-in used to switch a member to `avatar_mode = 'photo'` with the
 * picture from their id token. For a Google account without a real photo that
 * picture is a generated letter tile of the Google account name, so the app
 * showed e.g. "V" for a member whose display name is "Gigii Gi". The avatar no
 * longer uses the Google picture (see `avatarUrlFor` in user_auth.service), so
 * those members now have `photo` mode and nothing to show.
 *
 * Only rows in `photo` mode with no uploaded photo (`avatar_key IS NULL`) are
 * touched — their photo could only ever have come from Google. Members who
 * uploaded a photo, and members who chose anonymity, are left as they are.
 *
 * Idempotent — a second run finds nothing to do.
 */

import { QueryTypes } from "sequelize";

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";

async function main(): Promise<void> {
  await assertDatabaseConnection();

  const rows = await sequelize.query<{ id: string; email: string }>(
    `SELECT id, email FROM app_users WHERE avatar_mode = 'photo' AND avatar_key IS NULL`,
    { type: QueryTypes.SELECT },
  );

  if (rows.length === 0) {
    logger.info("[db:migrate:google-avatars] nothing to migrate — no photo-mode member lacks an uploaded photo");
    await sequelize.close();
    return;
  }

  await sequelize.query(
    `UPDATE app_users SET avatar_mode = 'initials' WHERE avatar_mode = 'photo' AND avatar_key IS NULL`,
    { type: QueryTypes.UPDATE },
  );

  for (const row of rows) logger.info(`[db:migrate:google-avatars] ${row.email}: photo → initials`);
  logger.info(`[db:migrate:google-avatars] complete — ${rows.length} member(s) moved to initials`);

  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:migrate:google-avatars] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exitCode = 1;
});
