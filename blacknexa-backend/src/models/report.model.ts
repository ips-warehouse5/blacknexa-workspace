/**
 * The report module's core tables.
 *
 * Supersedes `incident.model.ts` for everything the design needs, and keeps that
 * model's two genuine safety properties rather than reinventing them:
 * dispatch is never automatic, and erasure is real.
 *
 * ── Why location is split across three columns ──────────────────────────────
 * `location_precision` decides what a viewer may see; `lat` / `lng` hold the
 * value **already rounded to that precision**; `location_exact_sealed` holds the
 * true coordinates, encrypted. Rounding on write rather than on read is the whole
 * point: a bug in a read path leaks a home address, and a rounded value that was
 * never stored cannot leak at all.
 *
 * ── Why the counters are denormalised ──────────────────────────────────────
 * `support_count`, `comment_count` and `corroboration_count` sit on the row
 * because B1 renders them on every card and two of the three sort orders order by
 * them. They are maintained inside the same transaction as the row they count.
 *
 * ── Not paranoid ───────────────────────────────────────────────────────────
 * Report deletion follows D2's promise — "removes it from the feed and from your
 * Vault. Sealed files are destroyed after 30 days" — so it is a status change plus
 * a scheduled purge, not a soft delete. `deleted_at` marks the start of that
 * window; the purge job does the rest.
 */

import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";
import type { LocationPrecision, Visibility } from "@/types/user.interface";
import type {
  DayPart,
  EvidenceKind,
  EvidenceStrength,
  ReportCategory,
  ReportStatus,
  TimePrecision,
  UploadState,
} from "@/types/report.interface";

// ─────────────────────────────────────────────────────────────────────────────
// reports
// ─────────────────────────────────────────────────────────────────────────────

export class Report extends Model<
  InferAttributes<Report>,
  InferCreationAttributes<Report>
> {
  declare id: CreationOptional<string>;
  /** `BNX-####`, from a sequence. Never derived from the row id. */
  declare case_ref: string;
  /**
   * Null once the author deletes their account and chooses to keep the reports as
   * anonymous record. The link is gone, not hidden: there is no id left to restore.
   */
  declare user_id: CreationOptional<string | null>;

  declare title: string;
  /** Free text. Sealed at rest by the encryption service before it lands here. */
  declare body: string;
  declare category: ReportCategory;

  declare occurred_at: string;
  declare occurred_precision: CreationOptional<TimePrecision>;
  declare occurred_day_part: CreationOptional<DayPart | null>;
  declare filed_at: string;

  declare location_precision: CreationOptional<LocationPrecision>;
  declare location_label: CreationOptional<string | null>;
  /** Already rounded to `location_precision`. Safe to serve. */
  declare lat: CreationOptional<number | null>;
  declare lng: CreationOptional<number | null>;
  /** Truncated geohash, so "near me" works without PostGIS. */
  declare geohash: CreationOptional<string | null>;
  /** True coordinates, encrypted. Owner and moderators only. */
  declare location_exact_sealed: CreationOptional<string | null>;

  declare visibility: CreationOptional<Visibility>;
  declare anonymous: CreationOptional<boolean>;
  declare urgent: CreationOptional<boolean>;
  declare status: CreationOptional<ReportStatus>;
  declare evidence_strength: CreationOptional<EvidenceStrength>;

  declare support_count: CreationOptional<number>;
  declare comment_count: CreationOptional<number>;
  declare corroboration_count: CreationOptional<number>;
  declare view_count: CreationOptional<number>;

  declare pii_scrubbed: CreationOptional<boolean>;
  declare body_encrypted: CreationOptional<boolean>;

  /** Set when the owner deletes. Starts the 30-day evidence purge window. */
  declare deleted_at: CreationOptional<string | null>;
  declare verified_at: CreationOptional<string | null>;
}

Report.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    case_ref: {
      type: DataTypes.STRING(24),
      allowNull: false,
      unique: "reports_case_ref_unique",
    },
    // Nullable: see the declaration above — a severed report has no owner.
    user_id: { type: DataTypes.UUID, allowNull: true },

    title: { type: DataTypes.STRING(70), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    category: { type: DataTypes.STRING(24), allowNull: false },

    occurred_at: { type: DataTypes.STRING(32), allowNull: false },
    occurred_precision: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "exact" },
    occurred_day_part: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    filed_at: { type: DataTypes.STRING(32), allowNull: false },

    location_precision: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "approximate",
    },
    location_label: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
    lat: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: null },
    lng: { type: DataTypes.DOUBLE, allowNull: true, defaultValue: null },
    geohash: { type: DataTypes.STRING(12), allowNull: true, defaultValue: null },
    location_exact_sealed: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },

    visibility: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "public" },
    anonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    urgent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "submitted" },
    evidence_strength: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "thin" },

    support_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    comment_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    corroboration_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    view_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    pii_scrubbed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    body_encrypted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    deleted_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    verified_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "Report",
    tableName: "reports",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_reports_owner", fields: ["user_id"] },
      // The feed's default order, and the shape every keyset page seeks on.
      { name: "idx_reports_feed", fields: ["visibility", "status", "filed_at"] },
      { name: "idx_reports_category", fields: ["category"] },
      { name: "idx_reports_geohash", fields: ["geohash"] },
      { name: "idx_reports_support", fields: ["support_count"] },
      { name: "idx_reports_corroboration", fields: ["corroboration_count"] },
    ],
  },
);

Report.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_drafts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The server's mirror of the wizard's local draft.
 *
 * Local-first by design: the header's "Draft saved · 9:41 PM" reflects the *local*
 * write so it stays honest offline, and this table is the sync target. A step
 * transition never waits on it.
 */
export class ReportDraft extends Model<
  InferAttributes<ReportDraft>,
  InferCreationAttributes<ReportDraft>
> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  /** 1–7, so the wizard resumes where it stopped. */
  declare step: CreationOptional<number>;
  declare payload_json: CreationOptional<Record<string, unknown>>;
  declare updated_at: string;
}

ReportDraft.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    user_id: { type: DataTypes.UUID, allowNull: false },
    step: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    payload_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    updated_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportDraft",
    tableName: "report_drafts",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_report_drafts_user", fields: ["user_id"] }],
  },
);

ReportDraft.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_evidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One attached file.
 *
 * `sealed_at` is stamped by the server on commit, after it has verified the
 * object's SHA-256 against the value the client declared. That single timestamp is
 * what C5, C9, D3, D11 and D12 all display, so there is deliberately no
 * client-supplied seal time anywhere in this table.
 *
 * A report can be filed only when every row here is `sealed` — C8's promise that
 * "nothing is half-filed" is enforced there, not here.
 */
export class ReportEvidence extends Model<
  InferAttributes<ReportEvidence>,
  InferCreationAttributes<ReportEvidence>
> {
  declare id: CreationOptional<string>;
  declare report_id: CreationOptional<string | null>;
  /** Set while the file belongs to a draft rather than a filed report. */
  declare draft_id: CreationOptional<string | null>;
  /** Null once the report is severed — see `Report.user_id`. */
  declare user_id: CreationOptional<string | null>;

  declare kind: EvidenceKind;
  declare mime: string;
  declare bytes: CreationOptional<number>;
  declare duration_ms: CreationOptional<number | null>;

  /** Server-generated object key. Never built from a client filename. */
  declare storage_key: string;
  declare thumb_key: CreationOptional<string | null>;
  /** Hex SHA-256, verified server-side at commit. */
  declare sha256: CreationOptional<string | null>;

  declare captured_at: CreationOptional<string | null>;
  declare sealed_at: CreationOptional<string | null>;
  declare upload_state: CreationOptional<UploadState>;
  declare metadata_scrubbed: CreationOptional<boolean>;
  declare sort_order: CreationOptional<number>;
  /** Set when the parent report is deleted; the purge job reads it. */
  declare purge_after: CreationOptional<string | null>;
}

ReportEvidence.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    draft_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    user_id: { type: DataTypes.UUID, allowNull: true },

    kind: { type: DataTypes.STRING(16), allowNull: false },
    mime: { type: DataTypes.STRING(128), allowNull: false },
    bytes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },

    storage_key: { type: DataTypes.STRING(512), allowNull: false },
    thumb_key: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
    sha256: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },

    captured_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    sealed_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    upload_state: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "pending" },
    metadata_scrubbed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    purge_after: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "ReportEvidence",
    tableName: "report_evidence",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_report_evidence_report", fields: ["report_id"] },
      { name: "idx_report_evidence_draft", fields: ["draft_id"] },
      { name: "idx_report_evidence_purge", fields: ["purge_after"] },
    ],
  },
);

ReportEvidence.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_status_events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only status history.
 *
 * This table *is* the D2 timeline and the source of every `status_change`
 * notification, which is why nothing may change a report's status without writing
 * a row here. `actor_kind` distinguishes a moderator decision from a system
 * transition, so D2 can print "by a moderator" only when that is true.
 */
export class ReportStatusEvent extends Model<
  InferAttributes<ReportStatusEvent>,
  InferCreationAttributes<ReportStatusEvent>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare status: ReportStatus;
  declare actor_kind: CreationOptional<"system" | "moderator" | "owner">;
  declare actor_id: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare at: string;
}

ReportStatusEvent.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    actor_kind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "system" },
    actor_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    note: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
    at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportStatusEvent",
    tableName: "report_status_events",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_report_status_events_report", fields: ["report_id", "at"] }],
  },
);

ReportStatusEvent.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// Reference sequences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `BNX-####` and `FLG-####` come from Postgres sequences.
 *
 * Deliberately not derived from the row id or a row count: a case reference is
 * printed on C9, copied, and quoted back in support conversations, so it has to be
 * short, stable and never reused — and a count-based scheme collides the moment
 * two reports are filed at once.
 */
export async function ensureReferenceSequences(): Promise<void> {
  await sequelize.query("CREATE SEQUENCE IF NOT EXISTS report_case_ref_seq START 4471");
  await sequelize.query("CREATE SEQUENCE IF NOT EXISTS report_flag_ref_seq START 2209");
}

/** Next `BNX-####`. Padded to four digits, and allowed to grow past them. */
export async function nextCaseRef(): Promise<string> {
  const [rows] = await sequelize.query<{ nextval: string }>(
    "SELECT nextval('report_case_ref_seq') AS nextval",
    { type: undefined as never },
  );
  const value = Array.isArray(rows) ? (rows[0] as { nextval: string }) : (rows as { nextval: string });
  return `BNX-${String(value.nextval).padStart(4, "0")}`;
}

/** Next `FLG-####`, for D9's reference line. */
export async function nextFlagRef(): Promise<string> {
  const [rows] = await sequelize.query<{ nextval: string }>(
    "SELECT nextval('report_flag_ref_seq') AS nextval",
    { type: undefined as never },
  );
  const value = Array.isArray(rows) ? (rows[0] as { nextval: string }) : (rows as { nextval: string });
  return `FLG-${String(value.nextval).padStart(4, "0")}`;
}

export default Report;
