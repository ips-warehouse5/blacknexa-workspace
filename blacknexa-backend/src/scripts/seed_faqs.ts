/**
 * FAQ seed — `npm run db:seed:faqs`.
 *
 * Creates `faq_categories` and `faqs` if they are absent, then loads the
 * reconciled content from `data/faq_seed.data.ts`.
 *
 * ── Why this syncs two tables rather than calling `db:sync` ─────────────────
 * `db:sync` runs `sequelize.sync({ alter: true })` across every model, which on
 * a shared database is a far bigger action than "add the FAQ tables" — `alter`
 * will happily reshape a column it disagrees with. This script syncs exactly the
 * two models it owns, with no `alter`, so an existing table is left untouched
 * and a missing one is created. Running it against a database that already has
 * them is a no-op.
 *
 * ── Idempotence ────────────────────────────────────────────────────────────
 * Categories upsert on their slug. FAQ rows are matched on question text, which
 * is the only natural key they have: re-running the script adds whatever is new
 * in the seed file and leaves every existing row — including an editor's changes
 * — alone. That is the behaviour you want from something that may be run twice
 * by accident.
 *
 * `--reset` deletes every FAQ row first. It is destructive and says so, so it is
 * gated behind the flag rather than being the default.
 */

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import { Faq, FaqCategory } from "@/models/faq.model";
import { FAQ_CATEGORY_SEED, FAQ_SEED } from "@/data/faq_seed.data";
import { nowIso } from "@/models/model_options";

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");

  await assertDatabaseConnection();

  // No `alter`: create what is missing, touch nothing that exists.
  logger.info("[db:seed:faqs] ensuring faq tables exist");
  await FaqCategory.sync();
  await Faq.sync();

  if (reset) {
    // `force` makes this a real delete rather than a soft one — a reset that
    // left the old rows soft-deleted would leave the table growing on every run.
    const removed = await Faq.destroy({ where: {}, force: true });
    logger.warn(`[db:seed:faqs] --reset removed ${removed} existing FAQ rows`);
  }

  // ── Categories ────────────────────────────────────────────────────────────
  for (const category of FAQ_CATEGORY_SEED) {
    await FaqCategory.upsert({
      id: category.id,
      label: category.label,
      sort_order: category.sortOrder,
    });
  }
  logger.info(`[db:seed:faqs] ${FAQ_CATEGORY_SEED.length} categories upserted`);

  // ── Entries ───────────────────────────────────────────────────────────────
  const existing = new Set(
    (await Faq.findAll({ attributes: ["question"] })).map((row) =>
      row.question.trim().toLowerCase(),
    ),
  );

  let created = 0;
  let skipped = 0;
  // Spaced by ten so an editor can drop an entry between two without renumbering.
  let order = 10;

  for (const seed of FAQ_SEED) {
    const key = seed.question.trim().toLowerCase();
    if (existing.has(key)) {
      skipped += 1;
      order += 10;
      continue;
    }
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
    order += 10;
  }

  const published = await Faq.count({ where: { status: "published" } });
  const total = await Faq.count();
  logger.info(
    `[db:seed:faqs] created ${created}, skipped ${skipped} already present — ` +
      `${published}/${total} published`,
  );

  logger.info("[db:seed:faqs] complete");
  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:seed:faqs] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
