/**
 * The moderation module's tables — `docs/INCIDENT_MODULE_PLAN.md` §4.3–§4.7.
 *
 *   • `moderation_runs`  — the durable queue *and* the record of every AI verdict
 *   • `moderation_cases` — one human-queue item per target
 *   • `keyword_rules`    — admin-managed rules for the keyword stage
 *   • `audit_events`     — the append-only record of every decision
 *   • `report_notes`     — staff-only internal notes on an incident
 *
 * ── Why `moderation_runs` is the queue (D13) ───────────────────────────────
 * The generic `job_queue` has no lease, no transactional enqueue, drains five
 * jobs a minute and only when `ENABLE_CRON` is on, and is copied into the
 * every-minute persistence snapshot. A moderation run instead is inserted in the
 * *same transaction* as the report, comment or edit it checks, so content can
 * never exist without the run that will decide it. Workers on every replica
 * claim with `FOR UPDATE SKIP LOCKED`, hold a lease (`locked_until`), fence
 * their writes on `attempts`, and retry with backoff (§5.2). Rows carry ids and
 * AI verdict metadata only — never the content itself — and are deliberately
 * absent from `PERSISTED_TABLES`.
 *
 * ── Why the upserts are raw SQL and the indexes are mirrored here ──────────
 * "At most one queued run per target" and "at most one open case per target"
 * are partial unique indexes (`uq_moderation_runs_queued`,
 * `uq_moderation_cases_open`), and the services upsert against them with
 * `INSERT … ON CONFLICT (…) WHERE … DO UPDATE` — which Sequelize cannot
 * express. Those raw statements bypass the model, so they supply `id`,
 * `created_on` and `updated_on` themselves (`services/moderation_enqueue.ts`,
 * `services/moderation_case.service.ts`). The indexes are declared below with
 * the same `name` and `where` the migration uses, so a fresh `db:sync` and an
 * existing database migrated by `db:migrate:moderation` end up identical.
 *
 * ── House style ────────────────────────────────────────────────────────────
 * Domain timestamps are ISO `STRING(32)` (they are wire fields); worker
 * scheduling is `BIGINT` epoch milliseconds (compared numerically against
 * `Date.now()`, and returned as strings by the pg driver); small sets are
 * JSONB, never ARRAY/GIN (§4). No table here declares a foreign key: purge and
 * erasure delete or redact these rows explicitly (§7.8), exactly like the
 * polymorphic `report_flags`.
 */

import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS, SOFT_DELETE_OPTIONS } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";
import type {
  AiRecommendation,
  AiStatus,
  AuditActorKind,
  AuditAction,
  AuditTargetType,
  CaseResolution,
  CaseState,
  HoldReason,
  KeywordAction,
  KeywordAppliesTo,
  KeywordHit,
  KeywordRuleKind,
  ModerationTargetType,
  PolicyCategory,
  RunOutcome,
  RunStatus,
  RunTrigger,
  SafetyRisk,
  AiCategoryVerdict,
} from "@/types/moderation.interface";

// ─────────────────────────────────────────────────────────────────────────────
// moderation_runs — §4.3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One moderation pass over one version of one target.
 *
 * Lifecycle: `queued` → (claim) `running` → `done`, or `cancelled` when the
 * content went stale, was deleted, or the target was superseded before a worker
 * reached it. `attempts` is incremented and `started_at` stamped at claim, and
 * the pair is the fencing token: every later write is `WHERE id = :id AND
 * status = 'running' AND attempts = :token AND started_at = :claimedAt`, so a
 * worker whose lease expired cannot overwrite the result of the worker that
 * re-claimed the row — even after an enqueue merge reset `attempts` to 0.
 */
export class ModerationRun extends Model<
  InferAttributes<ModerationRun>,
  InferCreationAttributes<ModerationRun>
> {
  declare id: CreationOptional<string>;
  declare target_type: ModerationTargetType;
  /** The comment id for comment runs, the report id otherwise (evidence runs too). */
  declare target_id: string;
  declare report_id: string;
  declare comment_id: CreationOptional<string | null>;
  /** Set for `flagged` runs: the open case whose flags triggered the re-check. */
  declare case_id: CreationOptional<string | null>;
  /** The target's `content_version` this run assesses. Stale → cancelled. */
  declare content_version: number;
  declare trigger: RunTrigger;
  declare status: CreationOptional<RunStatus>;
  declare priority: CreationOptional<number>;
  declare attempts: CreationOptional<number>;
  declare max_attempts: CreationOptional<number>;
  /** Epoch ms, BIGINT. Returned as a string by the pg driver. */
  declare available_at: string;
  /** Lease expiry, epoch ms, BIGINT. Null unless running. */
  declare locked_until: CreationOptional<string | null>;

  declare outcome: CreationOptional<RunOutcome | null>;
  /** The hold reasons behind a `hold` / `hide`. */
  declare reasons: CreationOptional<HoldReason[] | null>;

  declare ai_status: CreationOptional<AiStatus | null>;
  declare ai_recommendation: CreationOptional<AiRecommendation | null>;
  declare ai_confidence: CreationOptional<number | null>;
  /**
   * The engine's eight verdicts. Evidence quotes are content, which is why these
   * rows are deleted with their report by `purgeDeletedReports` (§7.8).
   */
  declare ai_categories: CreationOptional<AiCategoryVerdict[] | null>;
  declare ai_summary: CreationOptional<string | null>;
  declare ai_language: CreationOptional<string | null>;
  declare safety_risk: CreationOptional<SafetyRisk | null>;
  declare ai_model: CreationOptional<string | null>;
  declare policy_version: CreationOptional<string | null>;
  declare ai_duration_ms: CreationOptional<number | null>;
  declare injection_suspected: CreationOptional<boolean | null>;
  declare block_reason: CreationOptional<string | null>;
  declare keyword_hits: CreationOptional<KeywordHit[] | null>;
  declare images_assessed: CreationOptional<number | null>;
  /** HTTP status and error type only — never content (§4.3). */
  declare error: CreationOptional<string | null>;

  declare created_at: string;
  declare started_at: CreationOptional<string | null>;
  declare finished_at: CreationOptional<string | null>;
}

ModerationRun.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    target_type: { type: DataTypes.STRING(16), allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: false },
    report_id: { type: DataTypes.UUID, allowNull: false },
    comment_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    case_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    content_version: { type: DataTypes.INTEGER, allowNull: false },
    trigger: { type: DataTypes.STRING(16), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "queued" },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    available_at: { type: DataTypes.BIGINT, allowNull: false },
    locked_until: { type: DataTypes.BIGINT, allowNull: true, defaultValue: null },

    outcome: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    reasons: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },

    ai_status: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    ai_recommendation: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    ai_confidence: { type: DataTypes.REAL, allowNull: true, defaultValue: null },
    ai_categories: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
    ai_summary: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    ai_language: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    safety_risk: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    ai_model: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    policy_version: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    ai_duration_ms: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    injection_suspected: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
    block_reason: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    keyword_hits: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
    images_assessed: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    error: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },

    created_at: { type: DataTypes.STRING(32), allowNull: false },
    started_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    finished_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "ModerationRun",
    tableName: "moderation_runs",
    ...BASE_OPTIONS,
    indexes: [
      // The claim's seek: queued/running rows by due time, highest priority first.
      { name: "idx_moderation_runs_claim", fields: ["status", "available_at", "priority"] },
      { name: "idx_moderation_runs_report", fields: ["report_id"] },
      { name: "idx_moderation_runs_comment", fields: ["comment_id"] },
      // One queued run per target. The enqueue upsert's ON CONFLICT names exactly
      // this predicate, so the two must never diverge.
      {
        name: "uq_moderation_runs_queued",
        unique: true,
        fields: ["target_type", "target_id"],
        where: { status: "queued" },
      },
    ],
  },
);

ModerationRun.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// moderation_cases — §4.4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One item in the Content Moderation queue.
 *
 * A case aggregates every signal about one target — the AI, keyword hits, media
 * awaiting review and N user flags — so a moderator decides once, with all of it
 * in view. At most one case per target is `open` (`uq_moderation_cases_open`);
 * a new signal on a target with an open case merges into it. Once resolved, a
 * later signal opens a fresh case, so the resolved one stays an honest record of
 * what was decided and why.
 */
export class ModerationCase extends Model<
  InferAttributes<ModerationCase>,
  InferCreationAttributes<ModerationCase>
> {
  declare id: CreationOptional<string>;
  declare target_type: ModerationTargetType;
  declare target_id: string;
  declare report_id: string;
  declare comment_id: CreationOptional<string | null>;
  declare state: CreationOptional<CaseState>;
  declare ai_flagged: CreationOptional<boolean>;
  declare keyword_flagged: CreationOptional<boolean>;
  declare media_review: CreationOptional<boolean>;
  declare user_flag_count: CreationOptional<number>;
  /** Union of every category any signal raised. */
  declare categories: CreationOptional<PolicyCategory[]>;
  /** Union of every hold reason. Staff-only. */
  declare hold_reasons: CreationOptional<HoldReason[]>;
  /** Recomputed with `casePriority()` on every upsert (§4.4). */
  declare priority: CreationOptional<number>;
  declare urgent: CreationOptional<boolean>;
  declare safety_risk: CreationOptional<SafetyRisk | null>;
  declare latest_run_id: CreationOptional<string | null>;
  declare opened_at: string;
  declare last_signal_at: string;
  declare resolved_at: CreationOptional<string | null>;
  /** The admin who decided, or null for `auto_cleared` / `withdrawn` / system closes. */
  declare resolved_by: CreationOptional<string | null>;
  declare resolution: CreationOptional<CaseResolution | null>;
  /** The reason code (a reject code on rejection). */
  declare resolution_reason: CreationOptional<string | null>;
  /** Author-visible note. */
  declare resolution_note: CreationOptional<string | null>;
  /** Staff-only note. */
  declare internal_note: CreationOptional<string | null>;
}

/** A case as the raw-SQL services return it (plain object, not an instance). */
export type ModerationCaseRow = InferAttributes<ModerationCase>;

ModerationCase.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    target_type: { type: DataTypes.STRING(16), allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: false },
    report_id: { type: DataTypes.UUID, allowNull: false },
    comment_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    state: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "open" },
    ai_flagged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    keyword_flagged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    media_review: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    user_flag_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    categories: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    hold_reasons: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    urgent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    safety_risk: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    latest_run_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    opened_at: { type: DataTypes.STRING(32), allowNull: false },
    last_signal_at: { type: DataTypes.STRING(32), allowNull: false },
    resolved_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    resolved_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    resolution: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    resolution_reason: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    resolution_note: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
    internal_note: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "ModerationCase",
    tableName: "moderation_cases",
    ...BASE_OPTIONS,
    indexes: [
      // One open case per target — the case upsert's ON CONFLICT predicate.
      {
        name: "uq_moderation_cases_open",
        unique: true,
        fields: ["target_type", "target_id"],
        where: { state: "open" },
      },
      // The queue's default order: open cases, highest priority, oldest first.
      { name: "idx_moderation_cases_queue", fields: ["state", "priority", "opened_at"] },
      // Case detail lists every case on a report; the purge deletes by report.
      { name: "idx_moderation_cases_report", fields: ["report_id"] },
    ],
  },
);

ModerationCase.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// keyword_rules — §4.5
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An admin-managed keyword rule.
 *
 * `action` decides what a hit does (D9): `hold` always holds; `signal` is a hint
 * to the AI and holds only if the AI confirms the category or is unavailable;
 * `monitor` only records. Victims quote threats, so the seeded rules all use
 * `signal` — a blunt `hold` on "I will kill you" would hold genuine harassment
 * reports — and admins keep `hold` as the strict option.
 *
 * Terms are 1–50 strings of 2–80 characters; a trailing `*` makes a prefix.
 * Paranoid: deleting a rule is an editorial act, and the runs that cite its id
 * in `keyword_hits` should still resolve to a name. The name is unique among
 * *live* rules, case-insensitively, so a deleted rule's name can be reused.
 */
export class KeywordRule extends Model<
  InferAttributes<KeywordRule>,
  InferCreationAttributes<KeywordRule>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare category: PolicyCategory;
  declare terms: CreationOptional<string[]>;
  declare action: CreationOptional<KeywordAction>;
  declare kind: CreationOptional<KeywordRuleKind>;
  declare applies_to: CreationOptional<KeywordAppliesTo>;
  declare enabled: CreationOptional<boolean>;
  declare detected_count: CreationOptional<number>;
  declare last_detected_at: CreationOptional<string | null>;
  declare created_by: CreationOptional<string | null>;
  declare updated_by: CreationOptional<string | null>;
}

KeywordRule.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(80), allowNull: false },
    category: { type: DataTypes.STRING(16), allowNull: false },
    terms: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    action: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "signal" },
    kind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "custom" },
    applies_to: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "all" },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    detected_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_detected_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    created_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    updated_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "KeywordRule",
    tableName: "keyword_rules",
    ...SOFT_DELETE_OPTIONS,
    indexes: [
      {
        name: "uq_keyword_rules_name_live",
        unique: true,
        fields: [sequelize.fn("lower", sequelize.col("name"))],
        where: { deleted_on: null },
      },
      { name: "idx_keyword_rules_enabled", fields: ["enabled"] },
    ],
  },
);

KeywordRule.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
  if (typeof row.name === "string") row.name = row.name.trim();
});

// ─────────────────────────────────────────────────────────────────────────────
// audit_events — §4.6
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only record of every AI, system, member and staff decision.
 *
 * Written only through `services/audit.service.ts`. The only permitted
 * mutations are the two erasure redactions documented there (§7.8): the purge
 * of a deleted report nulls `note` and replaces `metadata` on its rows, and
 * account deletion nulls `actor_id` (and `ip`) on that member's own rows.
 * `metadata` holds before/after states and ids — never content.
 */
export class AuditEvent extends Model<
  InferAttributes<AuditEvent>,
  InferCreationAttributes<AuditEvent>
> {
  declare id: CreationOptional<string>;
  declare actor_kind: AuditActorKind;
  /** An admin id for `admin`, an app-user id for `member`, null otherwise. */
  declare actor_id: CreationOptional<string | null>;
  declare action: AuditAction;
  declare target_type: AuditTargetType;
  declare target_id: CreationOptional<string | null>;
  declare report_id: CreationOptional<string | null>;
  declare case_id: CreationOptional<string | null>;
  declare reason_code: CreationOptional<string | null>;
  /** Internal note. Staff-only. */
  declare note: CreationOptional<string | null>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare ip: CreationOptional<string | null>;
  declare at: string;
}

AuditEvent.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    actor_kind: { type: DataTypes.STRING(16), allowNull: false },
    actor_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    action: { type: DataTypes.STRING(48), allowNull: false },
    target_type: { type: DataTypes.STRING(16), allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    report_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    case_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    reason_code: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    note: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
    metadata: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
    ip: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "AuditEvent",
    tableName: "audit_events",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_audit_events_report", fields: ["report_id", "at"] },
      { name: "idx_audit_events_actor", fields: ["actor_id", "at"] },
      { name: "idx_audit_events_action", fields: ["action", "at"] },
    ],
  },
);

AuditEvent.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_notes — §4.7
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An internal admin note on an incident ("Internal Admin Notes", §9.2).
 *
 * Staff-only by construction: no member-facing projection reads this table, and
 * the trust view explicitly carries no notes (§7.3). Deleted with the report by
 * the purge (§7.8).
 */
export class ReportNote extends Model<
  InferAttributes<ReportNote>,
  InferCreationAttributes<ReportNote>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare admin_id: string;
  /** 1–2000 characters, enforced by validation. */
  declare body: string;
  declare created_at: string;
}

ReportNote.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    admin_id: { type: DataTypes.UUID, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportNote",
    tableName: "report_notes",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_report_notes_report", fields: ["report_id", "created_at"] }],
  },
);

ReportNote.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

export default ModerationRun;
