/**
 * FAQ answer sync — `npm run db:sync:faq-answers -- "<question>" ["<question>" …]`.
 *
 * Copies the answer for each named question from `data/faq_seed.data.ts` onto
 * the existing row with that question.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `db:seed:faqs` matches rows on question text and never overwrites an existing
 * answer, so a copy change made in the seed file does not reach a database that
 * was seeded before it. `--reset` would, but it deletes every row and every
 * editor's change with it. This script updates only the questions it is given,
 * and only their answer — status, surfaces, category and order are left as the
 * editors set them.
 *
 * It goes through `faqService.update()` rather than writing the row directly,
 * so the public cache is invalidated and the Help screen serves the new answer
 * immediately instead of after the cache TTL.
 */

import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import { Faq } from "@/models/faq.model";
import { FAQ_SEED } from "@/data/faq_seed.data";
import faqService from "@/services/faq.service";

async function main(): Promise<void> {
  const questions = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (questions.length === 0) {
    throw new Error('Name at least one question, e.g. -- "What exactly is BlackNexa?"');
  }

  await assertDatabaseConnection();

  let updated = 0;
  for (const question of questions) {
    const key = question.trim().toLowerCase();
    const seed = FAQ_SEED.find((entry) => entry.question.trim().toLowerCase() === key);
    if (!seed) {
      logger.warn(`[db:sync:faq-answers] not in the seed file, skipped: ${question}`);
      continue;
    }

    const row = await Faq.findOne({ where: { question: seed.question } });
    if (!row) {
      logger.warn(`[db:sync:faq-answers] no row in the database, skipped: ${question}`);
      continue;
    }

    if (row.answer === seed.answer.trim()) {
      logger.info(`[db:sync:faq-answers] already current: ${question}`);
      continue;
    }

    await faqService.update(row.id, { answer: seed.answer });
    updated += 1;
    logger.info(`[db:sync:faq-answers] updated: ${question}`, { faqId: row.id });
  }

  logger.info(`[db:sync:faq-answers] complete — ${updated}/${questions.length} updated`);
  await sequelize.close();
}

void main().catch((err: unknown) => {
  logger.error("[db:sync:faq-answers] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
