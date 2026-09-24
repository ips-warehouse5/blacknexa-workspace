/**
 * Additive migration — `npm run db:migrate:moderation`.
 *
 * Applies everything the incident moderation module needs
 * (docs/INCIDENT_MODULE_PLAN.md §4) to a database that already has data:
 *
 *   • new columns on `reports`, `report_evidence`, `report_status_events`,
 *     `report_comments` and `report_flags` (§4.1, §4.2);
 *   • the `moderation_runs`, `moderation_cases`, `keyword_rules`,
 *     `audit_events` and `report_notes` tables (§4.3–§4.7);
 *   • the data backfills: `published_at` for legacy reports, share links on
 *     private reports revoked (D3), share links minted by anyone but the
 *     report's author revoked (review R7), `approved_scope = 'full'` for files
 *     published before approvals recorded a scope (review R5), duplicate open
 *     flags dismissed;
 *   • every index, including the partial unique ones the upserts rely on;
 *   • a moderation case for every target whose open flags predate cases, with
 *     the flags linked to it (review R16);
 *   • the six seeded keyword rules, unless `--no-seed` is passed.
 *
 * ── Safe on every run ─────────────────────────────────────────────────────
 * Every statement is `IF NOT EXISTS` or data-based, so running this twice — or
 * after `db:sync`, or on a database a previous version of this script already
 * touched — changes nothing that is already right:
 *
 *   • columns: `ADD COLUMN IF NOT EXISTS`, one statement each. The
 *     `moderation_state` columns are `NOT NULL DEFAULT 'approved'` in that
 *     single statement: Postgres 11+ stores a constant default as metadata, so
 *     this does not rewrite the table, and every legacy row is `approved` —
 *     legacy content stays exactly as visible as it was.
 *   • `report_comments.reply_notified` is added `DEFAULT true` and then given
 *     `DEFAULT false`. Legacy comments already notified the report owner when
 *     they were created (the old behaviour), so they are marked as notified; a
 *     legacy comment that is later held and re-approved must not send a second
 *     "Someone replied to your report". New rows get `false` (D18: the notice
 *     moves to approval). Once the column exists the ADD is a no-op, so a
 *     re-run cannot mark new comments as notified.
 *   • the `published_at` backfill (§4.1) only touches approved reports with no
 *     `published_at` **and no moderation run at all** — i.e. rows that predate
 *     the module — so it can never back-date a report the pipeline handles.
 *   • flag dedupe keeps the oldest open flag per reporter and target and
 *     dismisses the rest (`duplicate (migration)`), then creates the partial
 *     unique indexes — under one table lock, so no flag can slip in between.
 *   • the legacy-flag cases only pick up open flags with no `case_id`, and link
 *     them as they go, so a re-run finds nothing to do.
 *   • the `approved_scope` backfill only fills NULLs, and only on files the
 *     pipeline never decided (see the step for why).
 *   • new tables: `Model.sync()` with no options, which creates a missing
 *     table (and adds its missing indexes by name) and never alters one.
 *   • seeds: matched by name, soft-deleted rows included, so a seed an admin
 *     deleted or already has is never recreated or overwritten.
 *
 * ── Order relative to `db:sync` ───────────────────────────────────────────
 * Always run this after `db:sync` on a fresh database — sync creates the
 * tables, this seeds and backfills. On an existing database run this *first*:
 * once the models declare the new columns, a sync without `alter` tries to add
 * indexes on columns that do not exist yet. Production never syncs (env
 * validation refuses `DB_SYNC`), so there this script is the whole story.
 *
 * Nothing is ever dropped or altered beyond the column defaults named above.
 * Indexes are built without CONCURRENTLY: these tables are small, and a failed
 * concurrent build leaves an INVALID index that `IF NOT EXISTS` would then
 * silently skip on every later run.
 */

import { QueryTypes } from "sequelize";
import logger from "@/utils/logger.util";
import { assertDatabaseConnection, sequelize } from "@/config/database.config";
import { nowIso } from "@/models/model_options";
import {
  AuditEvent,
  KeywordRule,
  ModerationCase,
  ModerationRun,
  ReportNote,
} from "@/models/moderation.model";
import { KEYWORD_RULE_SEEDS } from "@/data/keyword_rules_seed.data";
import moderationCaseService from "@/services/moderation_case.service";
import { summariseOpenFlags, type OpenFlagRow } from "@/types/moderation.interface";

/**
 * Tables this migration extends. A database without them has never been synced,
 * and `db:sync` is the right tool there.
 */
const REQUIRED_TABLES = [
  "reports",
  "report_evidence",
  "report_status_events",
  "report_comments",
  "report_flags",
  "report_share_links",
];

/**
 * The added columns, spelled out as SQL rather than derived from the models: a
 * migration should say exactly what it does to the database, and a
 * model-derived version would silently change meaning the next time someone
 * edits a model. Types mirror the models (`STRING(n)` → `VARCHAR(n)`).
 */
const COLUMNS: { table: string; name: string; ddl: string }[] = [
  // reports — §4.1
  { table: "reports", name: "moderation_state", ddl: "VARCHAR(16) NOT NULL DEFAULT 'approved'" },
  { table: "reports", name: "moderation_reason", ddl: "VARCHAR(32)" },
  { table: "reports", name: "moderation_note", ddl: "VARCHAR(512)" },
  { table: "reports", name: "moderated_at", ddl: "VARCHAR(32)" },
  { table: "reports", name: "published_at", ddl: "VARCHAR(32)" },
  { table: "reports", name: "content_version", ddl: "INTEGER NOT NULL DEFAULT 1" },
  { table: "reports", name: "approved_content_version", ddl: "INTEGER" },
  { table: "reports", name: "human_reviewed_version", ddl: "INTEGER" },
  { table: "reports", name: "resubmission_count", ddl: "INTEGER NOT NULL DEFAULT 0" },
  { table: "reports", name: "last_edited_at", ddl: "VARCHAR(32)" },
  { table: "reports", name: "source_draft_id", ddl: "UUID" },
  { table: "reports", name: "assigned_admin_id", ddl: "UUID" },
  { table: "reports", name: "assigned_at", ddl: "VARCHAR(32)" },
  { table: "reports", name: "assigned_by", ddl: "UUID" },
  { table: "reports", name: "pre_deactivation_state", ddl: "VARCHAR(16)" },
  { table: "reports", name: "pre_deactivation_version", ddl: "INTEGER" },
  // report_evidence — §4.2, D22
  { table: "report_evidence", name: "moderation_state", ddl: "VARCHAR(16) NOT NULL DEFAULT 'approved'" },
  // Review R5: what an approval covered (`full` | `thumbnail`), NULL while
  // pending or rejected — no default, an approval must say. Backfilled below.
  { table: "report_evidence", name: "approved_scope", ddl: "VARCHAR(16)" },
  // Review R5: the sealed preview's hash, re-checked before it reaches the AI.
  { table: "report_evidence", name: "thumb_sha256", ddl: "VARCHAR(64)" },
  // report_status_events — §4.2
  { table: "report_status_events", name: "reason_code", ddl: "VARCHAR(32)" },
  // report_comments — §4.2, §7.5
  { table: "report_comments", name: "moderation_state", ddl: "VARCHAR(16) NOT NULL DEFAULT 'approved'" },
  { table: "report_comments", name: "moderation_reason", ddl: "VARCHAR(32)" },
  { table: "report_comments", name: "moderated_at", ddl: "VARCHAR(32)" },
  // See the header: legacy rows true, then the default becomes false.
  { table: "report_comments", name: "reply_notified", ddl: "BOOLEAN NOT NULL DEFAULT true" },
  // report_flags — §4.2
  { table: "report_flags", name: "case_id", ddl: "UUID" },
  { table: "report_flags", name: "resolved_by", ddl: "UUID" },
  { table: "report_flags", name: "content_version", ddl: "INTEGER" },
];

/**
 * Every index the module needs, with the same names and predicates the models
 * declare, so a synced database and a migrated one are identical. The new
 * tables' indexes are normally created by `Model.sync()`; restating them here
 * repairs a table an interrupted earlier run created without them.
 */
const INDEXES: { name: string; sql: string }[] = [
  // reports
  {
    name: "idx_reports_public_feed",
    sql: "CREATE INDEX IF NOT EXISTS idx_reports_public_feed ON reports (moderation_state, visibility, published_at)",
  },
  { name: "idx_reports_assignee", sql: "CREATE INDEX IF NOT EXISTS idx_reports_assignee ON reports (assigned_admin_id)" },
  {
    name: "idx_reports_moderation",
    sql: "CREATE INDEX IF NOT EXISTS idx_reports_moderation ON reports (moderation_state, filed_at)",
  },
  {
    name: "uq_reports_source_draft",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_source_draft ON reports (source_draft_id)",
  },
  // report_comments
  {
    name: "idx_report_comments_user",
    sql: "CREATE INDEX IF NOT EXISTS idx_report_comments_user ON report_comments (user_id)",
  },
  // report_flags (the two partial uniques are created with the dedupe, below)
  { name: "idx_report_flags_case", sql: "CREATE INDEX IF NOT EXISTS idx_report_flags_case ON report_flags (case_id)" },
  {
    name: "idx_report_flags_reporter",
    sql: "CREATE INDEX IF NOT EXISTS idx_report_flags_reporter ON report_flags (reporter_id)",
  },
  // moderation_runs
  {
    name: "idx_moderation_runs_claim",
    sql: "CREATE INDEX IF NOT EXISTS idx_moderation_runs_claim ON moderation_runs (status, available_at, priority)",
  },
  {
    name: "idx_moderation_runs_report",
    sql: "CREATE INDEX IF NOT EXISTS idx_moderation_runs_report ON moderation_runs (report_id)",
  },
  {
    name: "idx_moderation_runs_comment",
    sql: "CREATE INDEX IF NOT EXISTS idx_moderation_runs_comment ON moderation_runs (comment_id)",
  },
  {
    name: "uq_moderation_runs_queued",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_runs_queued ON moderation_runs (target_type, target_id) WHERE status = 'queued'",
  },
  // moderation_cases
  {
    name: "uq_moderation_cases_open",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_cases_open ON moderation_cases (target_type, target_id) WHERE state = 'open'",
  },
  {
    name: "idx_moderation_cases_queue",
    sql: "CREATE INDEX IF NOT EXISTS idx_moderation_cases_queue ON moderation_cases (state, priority, opened_at)",
  },
  {
    name: "idx_moderation_cases_report",
    sql: "CREATE INDEX IF NOT EXISTS idx_moderation_cases_report ON moderation_cases (report_id)",
  },
  // keyword_rules
  {
    name: "uq_keyword_rules_name_live",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_rules_name_live ON keyword_rules (lower(name)) WHERE deleted_on IS NULL",
  },
  {
    name: "idx_keyword_rules_enabled",
    sql: "CREATE INDEX IF NOT EXISTS idx_keyword_rules_enabled ON keyword_rules (enabled)",
  },
  // audit_events
  {
    name: "idx_audit_events_report",
    sql: "CREATE INDEX IF NOT EXISTS idx_audit_events_report ON audit_events (report_id, at)",
  },
  {
    name: "idx_audit_events_actor",
    sql: "CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_id, at)",
  },
  {
    name: "idx_audit_events_action",
    sql: "CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action, at)",
  },
  // report_notes
  {
    name: "idx_report_notes_report",
    sql: "CREATE INDEX IF NOT EXISTS idx_report_notes_report ON report_notes (report_id, created_at)",
  },
];

/** The partial unique flag indexes (§4.2), created after the dedupe. */
const FLAG_UNIQUE_INDEXES: { name: string; sql: string }[] = [
  {
    name: "uq_report_flags_open_report",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_report_flags_open_report ON report_flags (reporter_id, report_id) WHERE comment_id IS NULL AND status = 'open'",
  },
  {
    name: "uq_report_flags_open_comment",
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_report_flags_open_comment ON report_flags (reporter_id, comment_id) WHERE comment_id IS NOT NULL AND status = 'open'",
  },
];

/** The new tables, in creation order. */
const NEW_TABLES = [
  { table: "moderation_runs", model: ModerationRun },
  { table: "moderation_cases", model: ModerationCase },
  { table: "keyword_rules", model: KeywordRule },
  { table: "audit_events", model: AuditEvent },
  { table: "report_notes", model: ReportNote },
] as const;

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

async function existingIndexNames(): Promise<Set<string>> {
  const [rows] = await sequelize.query(
    `select indexname from pg_indexes where schemaname = current_schema()`,
  );
  return new Set((rows as { indexname: string }[]).map((row) => row.indexname));
}

/** Rows affected by a raw UPDATE (the pg result object on the RAW query path). */
function affected(result: unknown): number {
  if (typeof result === "number") return result;
  if (result && typeof result === "object" && "rowCount" in result) {
    const count = (result as { rowCount: unknown }).rowCount;
    return typeof count === "number" ? count : 0;
  }
  return 0;
}

interface Summary {
  columnsAdded: number;
  columnsPresent: number;
  tablesCreated: string[];
  reportsBackfilled: number;
  shareLinksRevoked: number;
  nonOwnerShareLinksRevoked: number;
  evidenceScopeBackfilled: number;
  duplicateFlagsDismissed: number;
  indexesCreated: string[];
  flagCasesUpserted: number;
  flagsLinkedToCases: number;
  flagsLeftWithoutCase: number;
  rulesSeeded: number | "skipped";
}

/**
 * Review R16: open flags raised before revision 2 have no `case_id`, and the
 * case-based queue (§8.1) lists cases only — so without this they would never
 * reach a moderator again (§3.1 expects legacy rows normalised and surfaced).
 *
 * For every target with open flags that carry no case, open one — or merge into
 * the target's open case, which cannot have counted them — through the same
 * `upsertOpenCase` every flag uses: `user_flag_count` += those flags,
 * `categories` ∪ their normalised reasons (an unknown legacy reason is
 * `other`), `hold_reasons` ∪ `['user_flags']`, priority recomputed. A comment
 * flag's report is resolved through `report_comments` (legacy comment flags
 * stored `report_id` NULL, and are given it now, as new comment flags carry
 * it). Then those flags get the case's id.
 *
 * Idempotent: a flag linked to a case is never picked again, so a second run
 * finds nothing. One transaction holding the same lock as the dedupe, so no new
 * flag can land half-counted. Skipped (and left open for the purge to take with
 * their report): flags on a deleted or missing report, and on a comment that is
 * gone or removed — there is nothing left for a moderator to decide.
 */
async function openCasesForLegacyFlags(): Promise<{
  cases: number;
  flagsLinked: number;
  leftWithoutCase: number;
}> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(`LOCK TABLE report_flags IN SHARE ROW EXCLUSIVE MODE`, { transaction });

    const rows = await sequelize.query<OpenFlagRow>(
      `SELECT f.report_id, f.comment_id, c.report_id AS comment_report_id, f.reason
         FROM report_flags AS f
         LEFT JOIN report_comments AS c ON c.id = f.comment_id
         JOIN reports AS r
           ON r.id = CASE WHEN f.comment_id IS NULL THEN f.report_id ELSE c.report_id END
        WHERE f.status = 'open'
          AND f.case_id IS NULL
          AND r.deleted_at IS NULL
          AND (f.comment_id IS NULL OR c.status <> 'removed')
        ORDER BY f.created_at ASC, f.id ASC`,
      { type: QueryTypes.SELECT, transaction },
    );

    let cases = 0;
    let flagsLinked = 0;
    for (const signal of summariseOpenFlags(rows)) {
      const openCase = await moderationCaseService.upsertOpenCase(transaction, {
        targetType: signal.targetType,
        targetId: signal.targetId,
        reportId: signal.reportId,
        commentId: signal.commentId,
        userFlagIncrement: signal.flagCount,
        categories: signal.categories,
        holdReasons: ["user_flags"],
      });
      cases += 1;
      const targetSql =
        signal.targetType === "comment"
          ? "comment_id = :targetId"
          : "report_id = :targetId AND comment_id IS NULL";
      const [, linked] = await sequelize.query(
        `UPDATE report_flags
            SET case_id = :caseId,
                report_id = COALESCE(report_id, :reportId),
                updated_on = now()
          WHERE status = 'open' AND case_id IS NULL AND ${targetSql}`,
        {
          replacements: { caseId: openCase.id, reportId: signal.reportId, targetId: signal.targetId },
          transaction,
        },
      );
      flagsLinked += affected(linked);
    }

    const [left] = await sequelize.query<{ n: string | number }>(
      `SELECT COUNT(*) AS n FROM report_flags WHERE status = 'open' AND case_id IS NULL`,
      { type: QueryTypes.SELECT, transaction },
    );
    return { cases, flagsLinked, leftWithoutCase: Number(left?.n ?? 0) };
  });
}

async function main(): Promise<void> {
  const skipSeed = process.argv.includes("--no-seed");
  const summary: Summary = {
    columnsAdded: 0,
    columnsPresent: 0,
    tablesCreated: [],
    reportsBackfilled: 0,
    shareLinksRevoked: 0,
    nonOwnerShareLinksRevoked: 0,
    evidenceScopeBackfilled: 0,
    duplicateFlagsDismissed: 0,
    indexesCreated: [],
    flagCasesUpserted: 0,
    flagsLinkedToCases: 0,
    flagsLeftWithoutCase: 0,
    rulesSeeded: "skipped",
  };

  await assertDatabaseConnection();

  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await tableExists(table))) missing.push(table);
  }
  if (missing.length > 0) {
    logger.error(
      `[db:migrate] missing base table(s): ${missing.join(", ")} — run \`npm run db:sync\` on an empty database first, then this script`,
    );
    await sequelize.close();
    process.exit(1);
  }

  const indexesBefore = await existingIndexNames();

  // ── 1. Columns ────────────────────────────────────────────────────────────
  for (const column of COLUMNS) {
    if (await columnExists(column.table, column.name)) {
      summary.columnsPresent += 1;
      continue;
    }
    await sequelize.query(
      `ALTER TABLE "${column.table}" ADD COLUMN IF NOT EXISTS "${column.name}" ${column.ddl}`,
    );
    logger.info(`[db:migrate] ${column.table} += ${column.name} ${column.ddl}`);
    summary.columnsAdded += 1;
  }
  // New comments are not notified until approved (D18). Idempotent.
  await sequelize.query(`ALTER TABLE "report_comments" ALTER COLUMN "reply_notified" SET DEFAULT false`);

  // ── 2. New tables ─────────────────────────────────────────────────────────
  // `sync()` with no options creates a missing table and leaves an existing one
  // alone — it is `alter` that is unsafe, not `sync`. The models declare no
  // foreign keys, so no REFERENCES clause is emitted.
  for (const { table, model } of NEW_TABLES) {
    const had = await tableExists(table);
    await model.sync();
    if (!had) {
      summary.tablesCreated.push(table);
      logger.info(`[db:migrate] created ${table}`);
    }
  }

  // ── 3. Backfills ──────────────────────────────────────────────────────────
  // §4.1, verbatim: legacy approved reports get `published_at = filed_at`.
  // The NOT EXISTS keeps it from ever touching a report the pipeline handled.
  const [, backfill] = await sequelize.query(
    `UPDATE reports
        SET published_at = filed_at,
            approved_content_version = content_version,
            updated_on = now()
      WHERE moderation_state = 'approved'
        AND published_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM moderation_runs r WHERE r.report_id = reports.id)`,
  );
  summary.reportsBackfilled = affected(backfill);

  // D3: share links were the only way a private report could reach anyone else.
  const [, revoked] = await sequelize.query(
    `UPDATE report_share_links AS l
        SET revoked_at = :now, updated_on = now()
       FROM reports AS r
      WHERE l.report_id = r.id
        AND r.visibility = 'private'
        AND l.revoked_at IS NULL`,
    { replacements: { now: nowIso() } },
  );
  summary.shareLinksRevoked = affected(revoked);

  // Review R7: before revision 2 any reader could mint a share token, so an
  // advocate's link to a Trusted-Circle report showed it to anyone holding it.
  // Only the report's author may have a live link; `resolveShareToken` enforces
  // the same rule, so this is belt and braces for the rows already out there.
  const [, nonOwner] = await sequelize.query(
    `UPDATE report_share_links AS l
        SET revoked_at = :now, updated_on = now()
       FROM reports AS r
      WHERE l.report_id = r.id
        AND l.created_by IS DISTINCT FROM r.user_id
        AND l.revoked_at IS NULL`,
    { replacements: { now: nowIso() } },
  );
  summary.nonOwnerShareLinksRevoked = affected(nonOwner);

  // Review R5: `approved_scope` for files approved before the column existed.
  // Legacy files were published whole, so they stay whole (`full`) — as do a
  // private report's files (only its owner and staff see them) and draft files
  // (filing re-states them). A file on a report the pipeline has already run on
  // is left NULL, which the read path serves as preview-only: on a database
  // where an earlier build of this module ran, an approval recorded without a
  // scope may have covered only the preview, and failing towards the preview is
  // the safe direction (a moderator's approval restores the original). Safe to
  // re-run: it only fills NULLs, and only on rows the pipeline never decided.
  const [, scoped] = await sequelize.query(
    `UPDATE report_evidence AS e
        SET approved_scope = 'full', updated_on = now()
      WHERE e.moderation_state = 'approved'
        AND e.approved_scope IS NULL
        AND (
              e.report_id IS NULL
           OR EXISTS (SELECT 1 FROM reports r WHERE r.id = e.report_id AND r.visibility = 'private')
           OR NOT EXISTS (SELECT 1 FROM moderation_runs m
                           WHERE m.report_id = e.report_id AND m.target_type = 'report')
        )`,
  );
  summary.evidenceScopeBackfilled = affected(scoped);

  // ── 4. Flag dedupe + partial unique indexes (§4.2) ────────────────────────
  // One transaction holding a lock that blocks concurrent flag writes (but not
  // reads), so no duplicate can be inserted between the dedupe and the index.
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`LOCK TABLE report_flags IN SHARE ROW EXCLUSIVE MODE`, { transaction });
    const now = nowIso();

    const [, reportDupes] = await sequelize.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY reporter_id, report_id
                                   ORDER BY created_at ASC, id ASC) AS rn
           FROM report_flags
          WHERE status = 'open' AND comment_id IS NULL
            AND reporter_id IS NOT NULL AND report_id IS NOT NULL
       )
       UPDATE report_flags AS f
          SET status = 'dismissed', resolution = 'duplicate (migration)',
              resolved_at = :now, updated_on = now()
         FROM ranked
        WHERE f.id = ranked.id AND ranked.rn > 1`,
      { replacements: { now }, transaction },
    );

    const [, commentDupes] = await sequelize.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY reporter_id, comment_id
                                   ORDER BY created_at ASC, id ASC) AS rn
           FROM report_flags
          WHERE status = 'open' AND comment_id IS NOT NULL AND reporter_id IS NOT NULL
       )
       UPDATE report_flags AS f
          SET status = 'dismissed', resolution = 'duplicate (migration)',
              resolved_at = :now, updated_on = now()
         FROM ranked
        WHERE f.id = ranked.id AND ranked.rn > 1`,
      { replacements: { now }, transaction },
    );
    summary.duplicateFlagsDismissed = affected(reportDupes) + affected(commentDupes);

    for (const index of FLAG_UNIQUE_INDEXES) {
      await sequelize.query(index.sql, { transaction });
    }
  });

  // ── 5. Indexes ────────────────────────────────────────────────────────────
  for (const index of INDEXES) {
    await sequelize.query(index.sql);
  }
  const indexesAfter = await existingIndexNames();
  summary.indexesCreated = [...INDEXES, ...FLAG_UNIQUE_INDEXES]
    .map((index) => index.name)
    .filter((name) => indexesAfter.has(name) && !indexesBefore.has(name));

  // ── 5b. Legacy open flags → moderation cases (§3.1, §4.4, review R16) ─────
  // After the indexes: the case upsert's ON CONFLICT needs
  // `uq_moderation_cases_open` to exist.
  const flagCases = await openCasesForLegacyFlags();
  summary.flagCasesUpserted = flagCases.cases;
  summary.flagsLinkedToCases = flagCases.flagsLinked;
  summary.flagsLeftWithoutCase = flagCases.leftWithoutCase;

  // ── 6. Keyword rule seeds (§4.5) ──────────────────────────────────────────
  if (skipSeed) {
    logger.info("[db:migrate] --no-seed: skipping keyword rules");
  } else {
    // `paranoid: false`: a seed an admin deleted stays deleted.
    const existing = new Set(
      (await KeywordRule.findAll({ attributes: ["name"], paranoid: false })).map((row) =>
        row.name.trim().toLowerCase(),
      ),
    );
    let created = 0;
    for (const seed of KEYWORD_RULE_SEEDS) {
      const key = seed.name.trim().toLowerCase();
      if (existing.has(key)) continue;
      await KeywordRule.create({
        name: seed.name,
        category: seed.category,
        terms: [...seed.terms],
        action: "signal",
        kind: "system",
        applies_to: "all",
        enabled: seed.enabled,
      });
      existing.add(key);
      created += 1;
    }
    summary.rulesSeeded = created;
    logger.info(
      `[db:migrate] keyword rules: ${created} seeded, ${KEYWORD_RULE_SEEDS.length - created} already present`,
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  logger.info(
    `[db:migrate] columns: ${summary.columnsAdded} added, ${summary.columnsPresent} already present`,
  );
  logger.info(
    `[db:migrate] tables created: ${summary.tablesCreated.length > 0 ? summary.tablesCreated.join(", ") : "none (all present)"}`,
  );
  logger.info(`[db:migrate] reports backfilled with published_at: ${summary.reportsBackfilled}`);
  logger.info(`[db:migrate] share links on private reports revoked: ${summary.shareLinksRevoked}`);
  logger.info(`[db:migrate] share links minted by non-owners revoked: ${summary.nonOwnerShareLinksRevoked}`);
  logger.info(`[db:migrate] approved files given approved_scope = full: ${summary.evidenceScopeBackfilled}`);
  logger.info(`[db:migrate] duplicate open flags dismissed: ${summary.duplicateFlagsDismissed}`);
  logger.info(
    `[db:migrate] legacy open flags: ${summary.flagCasesUpserted} case(s) opened or merged, ${summary.flagsLinkedToCases} flag(s) linked, ${summary.flagsLeftWithoutCase} left without a case (deleted report or removed comment)`,
  );
  logger.info(
    `[db:migrate] indexes created: ${summary.indexesCreated.length > 0 ? summary.indexesCreated.join(", ") : "none (all present)"}`,
  );
  logger.info("[db:migrate] moderation migration complete", summary);
  await sequelize.close();
}

void main().catch(async (err: unknown) => {
  logger.error("[db:migrate] failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
