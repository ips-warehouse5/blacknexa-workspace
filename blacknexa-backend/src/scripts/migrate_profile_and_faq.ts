/**
 * Additive migration — `npm run db:migrate:profile-faq`.
 *
 * Applies everything the Profile & Settings work and the FAQ module need, on a
 * database that already has data:
 *
 *   • seven nullable columns on `app_users` (names, password timestamp, the
 *     provider avatar URL, and the saved area);
 *   • the `faq_categories` and `faqs` tables;
 *   • the seeded FAQ content, unless `--no-seed` is passed.
 *
 * ── Why this exists rather than `db:sync` ──────────────────────────────────
 * `db:sync` runs `sequelize.sync({ alter: true })` across every model. On
 * Postgres that is unsafe on an existing database for two separate reasons.
 *
 * The first is documented in `sync_db.ts` itself: `alter` will drop a column it
 * does not recognise.
 *
 * The second is a Sequelize defect. Its Postgres `changeColumn` builds SQL by
 * concatenation, and for a column carrying a foreign key it emits the
 * `REFERENCES …` clause as a *separate statement*:
 *
 *     ALTER TABLE "x" ALTER COLUMN "y" SET NOT NULL;
 *     REFERENCES "z" ("id") ON DELETE CASCADE;   ← syntax error at or near "REFERENCES"
 *
 * Nineteen columns in this schema carry a reference, so any one of them whose
 * live definition has drifted from its model will fail the whole sync. Creating
 * a table from scratch is fine — the clause is inline in `CREATE TABLE` — which
 * is why a fresh database syncs cleanly and a long-lived one does not.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 * Every statement is `IF NOT EXISTS`, every added column is nullable, and no
 * column is ever altered or dropped. Running it twice changes nothing the second
 * time. It touches only the objects named above; nothing else in the schema is
 * inspected, let alone rewritten.
 */

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import { Faq, FaqCategory } from "@/models/faq.model";

/**
 * The columns added to `app_users`.
 *
 * Spelled out as SQL rather than derived from the model on purpose: a migration
 * should say exactly what it does to the database, and a model-derived version
 * would silently change meaning the next time someone edits the model.
 */
const APP_USER_COLUMNS: { name: string; type: string }[] = [
  { name: "first_name", type: "VARCHAR(80)" },
  { name: "last_name", type: "VARCHAR(80)" },
  { name: "password_changed_at", type: "VARCHAR(32)" },
  { name: "avatar_external_url", type: "VARCHAR(1024)" },
  { name: "area_label", type: "VARCHAR(160)" },
  { name: "area_lat", type: "DOUBLE PRECISION" },
  { name: "area_lng", type: "DOUBLE PRECISION" },
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await sequelize.query(
    `select 1 from information_schema.columns
      where table_schema = current_schema() and table_name = :table and column_name = :column
      limit 1`,
    { replacements: { table, column } },
  );
  return (rows as unknown[]).length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await sequelize.query(
    `select 1 from information_schema.tables
      where table_schema = current_schema() and table_name = :table limit 1`,
    { replacements: { table } },
  );
  return (rows as unknown[]).length > 0;
}

async function main(): Promise<void> {
  const skipSeed = process.argv.includes("--no-seed");

  await assertDatabaseConnection();

  // ── app_users ─────────────────────────────────────────────────────────────
  if (!(await tableExists("app_users"))) {
    // Nothing to add to. A database without this table has never been synced at
    // all, and `db:sync` is the right tool there — it can create cleanly.
    logger.warn("[db:migrate] app_users does not exist; run `npm run db:sync` on an empty database first");
  } else {
    let added = 0;
    for (const column of APP_USER_COLUMNS) {
      if (await columnExists("app_users", column.name)) continue;
      // Nullable and default-less: existing rows get NULL, which every reader
      // of these columns already treats as "not set".
      await sequelize.query(
        `alter table "app_users" add column if not exists "${column.name}" ${column.type}`,
      );
      logger.info(`[db:migrate] app_users += ${column.name} ${column.type}`);
      added += 1;
    }
    logger.info(
      `[db:migrate] app_users: ${added} column(s) added, ${APP_USER_COLUMNS.length - added} already present`,
    );
  }

  // ── FAQ tables ────────────────────────────────────────────────────────────
  // `sync()` with no options creates a missing table and leaves an existing one
  // entirely alone — it is `alter` that is unsafe, not `sync`.
  const hadFaqs = await tableExists("faqs");
  await FaqCategory.sync();
  await Faq.sync();
  logger.info(hadFaqs ? "[db:migrate] faq tables already present" : "[db:migrate] faq tables created");

  // ── Content ───────────────────────────────────────────────────────────────
  if (skipSeed) {
    logger.info("[db:migrate] --no-seed: skipping FAQ content");
  } else {
    // Imported here rather than at the top so `--no-seed` does not pay for
    // loading the seed module at all.
    const { FAQ_CATEGORY_SEED, FAQ_SEED } = await import("@/data/faq_seed.data");
    const { nowIso } = await import("@/models/model_options");

    for (const category of FAQ_CATEGORY_SEED) {
      await FaqCategory.upsert({
        id: category.id,
        label: category.label,
        sort_order: category.sortOrder,
      });
    }

    // Matched on question text — the only natural key these rows have — so a
    // re-run adds what is new and never overwrites an editor's changes.
    const existing = new Set(
      (await Faq.findAll({ attributes: ["question"] })).map((row) =>
        row.question.trim().toLowerCase(),
      ),
    );
    let created = 0;
    let order = 10;
    for (const seed of FAQ_SEED) {
      const key = seed.question.trim().toLowerCase();
      order += 10;
      if (existing.has(key)) continue;
      await Faq.create({
        category_id: seed.categoryId,
        question: seed.question,
        answer: seed.answer,
        status: seed.status ?? "published",
        surfaces: seed.surfaces,
        start_here: seed.startHere ?? false,
        sort_order: order,
        updated_at: nowIso(),
      });
      existing.add(key);
      created += 1;
    }
    logger.info(
      `[db:migrate] faqs: ${created} created, ${FAQ_SEED.length - created} already present`,
    );
  }

  logger.info("[db:migrate] complete");
  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:migrate] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
