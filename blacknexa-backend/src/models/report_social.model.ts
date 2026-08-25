/**
 * The social layer around a report — screens D1, D4, D8, D9, D10.
 *
 * Every table here is either a unique pair or an append-only log, because every
 * interaction the design offers is idempotent from the user's side: standing with
 * a report twice is the same as once, and so is corroborating it. Enforcing that
 * with a unique index rather than an application check means a double-tap or a
 * retried request cannot inflate a count.
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
import type { FlagReason, NotificationType } from "@/types/report.interface";

// ─────────────────────────────────────────────────────────────────────────────
// report_supports — D1's "Stand with"
// ─────────────────────────────────────────────────────────────────────────────

export class ReportSupport extends Model<
  InferAttributes<ReportSupport>,
  InferCreationAttributes<ReportSupport>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare user_id: string;
  declare at: string;
}

ReportSupport.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportSupport",
    tableName: "report_supports",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_report_supports_pair", unique: true, fields: ["report_id", "user_id"] },
      { name: "idx_report_supports_user", fields: ["user_id"] },
    ],
  },
);

ReportSupport.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_corroborations — "it happened to me too"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distinct from a support: standing with says "I believe you", corroborating says
 * "this happened to me too". The design gives corroboration its own colour
 * (`corro`) precisely so it is not read as a louder version of support.
 *
 * `has_evidence` is what unlocks the top band of the D3 strength scale — a
 * corroborator who attached their own material is an independent second source,
 * which twelve bare corroborations are not.
 */
export class ReportCorroboration extends Model<
  InferAttributes<ReportCorroboration>,
  InferCreationAttributes<ReportCorroboration>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare user_id: string;
  declare note: CreationOptional<string | null>;
  declare has_evidence: CreationOptional<boolean>;
  declare at: string;
}

ReportCorroboration.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    note: { type: DataTypes.STRING(1024), allowNull: true, defaultValue: null },
    has_evidence: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportCorroboration",
    tableName: "report_corroborations",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_report_corroborations_pair", unique: true, fields: ["report_id", "user_id"] },
    ],
  },
);

ReportCorroboration.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_comments — D4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two levels only.
 *
 * D4 says a reply to a reply joins the same thread, so `parent_id` is either null
 * (a root comment) or points at a root comment. The service refuses a third level
 * rather than silently flattening it, because flattening would reorder someone's
 * reply under the wrong parent.
 *
 * `anonymous` is per comment and independent of the report's setting — D4's
 * composer has its own switch, inheriting the profile default.
 */
export class ReportComment extends Model<
  InferAttributes<ReportComment>,
  InferCreationAttributes<ReportComment>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare parent_id: CreationOptional<string | null>;
  declare user_id: string;
  declare anonymous: CreationOptional<boolean>;
  declare body: string;
  declare like_count: CreationOptional<number>;
  declare status: CreationOptional<"visible" | "hidden" | "removed">;
  declare created_at: string;
}

ReportComment.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    parent_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    user_id: { type: DataTypes.UUID, allowNull: false },
    anonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    like_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "visible" },
    created_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportComment",
    tableName: "report_comments",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_report_comments_report", fields: ["report_id", "created_at"] },
      { name: "idx_report_comments_parent", fields: ["parent_id"] },
      { name: "idx_report_comments_top", fields: ["report_id", "like_count"] },
    ],
  },
);

ReportComment.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// comment_likes
// ─────────────────────────────────────────────────────────────────────────────

export class CommentLike extends Model<
  InferAttributes<CommentLike>,
  InferCreationAttributes<CommentLike>
> {
  declare id: CreationOptional<string>;
  declare comment_id: string;
  declare user_id: string;
  declare at: string;
}

CommentLike.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    comment_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "CommentLike",
    tableName: "comment_likes",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_comment_likes_pair", unique: true, fields: ["comment_id", "user_id"] }],
  },
);

CommentLike.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_flags — D8, D9
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A flag on a report **or** a comment.
 *
 * D9's promise — "The author is told: Nothing about you" — is a projection rule
 * rather than a storage one, but it is worth stating here too: `reporter_id` is
 * read only by moderators, and no owner-facing query ever selects it.
 */
export class ReportFlag extends Model<
  InferAttributes<ReportFlag>,
  InferCreationAttributes<ReportFlag>
> {
  declare id: CreationOptional<string>;
  /** `FLG-####`, shown on D9 so a person can refer to it later. */
  declare flag_ref: string;
  declare report_id: CreationOptional<string | null>;
  declare comment_id: CreationOptional<string | null>;
  /** Null once the reporter deletes their account. The flag itself survives. */
  declare reporter_id: CreationOptional<string | null>;
  declare reason: FlagReason;
  declare note: CreationOptional<string | null>;
  declare status: CreationOptional<"open" | "resolved" | "dismissed">;
  declare resolution: CreationOptional<string | null>;
  declare created_at: string;
  declare resolved_at: CreationOptional<string | null>;
}

ReportFlag.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    flag_ref: { type: DataTypes.STRING(24), allowNull: false, unique: "report_flags_ref_unique" },
    report_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    comment_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    reporter_id: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(32), allowNull: false },
    note: { type: DataTypes.STRING(1024), allowNull: true, defaultValue: null },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "open" },
    resolution: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
    created_at: { type: DataTypes.STRING(32), allowNull: false },
    resolved_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "ReportFlag",
    tableName: "report_flags",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_report_flags_report", fields: ["report_id"] },
      { name: "idx_report_flags_comment", fields: ["comment_id"] },
      { name: "idx_report_flags_status", fields: ["status", "created_at"] },
    ],
  },
);

ReportFlag.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_hides — D9's "Hide this report from my feed"
// ─────────────────────────────────────────────────────────────────────────────

/** Offered on D9 rather than assumed, so it is a deliberate row, not a side effect. */
export class ReportHide extends Model<
  InferAttributes<ReportHide>,
  InferCreationAttributes<ReportHide>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare user_id: string;
  declare at: string;
}

ReportHide.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "ReportHide",
    tableName: "report_hides",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_report_hides_pair", unique: true, fields: ["report_id", "user_id"] }],
  },
);

ReportHide.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// report_share_links — D10
// ─────────────────────────────────────────────────────────────────────────────

export class ReportShareLink extends Model<
  InferAttributes<ReportShareLink>,
  InferCreationAttributes<ReportShareLink>
> {
  declare id: CreationOptional<string>;
  declare report_id: string;
  declare token: string;
  declare created_by: string;
  declare created_at: string;
  declare revoked_at: CreationOptional<string | null>;
}

ReportShareLink.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    report_id: { type: DataTypes.UUID, allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: "report_share_links_token_unique" },
    created_by: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.STRING(32), allowNull: false },
    revoked_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    modelName: "ReportShareLink",
    tableName: "report_share_links",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_report_share_links_report", fields: ["report_id"] }],
  },
);

ReportShareLink.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

// ─────────────────────────────────────────────────────────────────────────────
// notifications — B3, and the four types A11 names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * B3 reads this table, not the push history.
 *
 * Push is lossy — a device can be offline, a token can be stale — but the
 * notification centre has to be complete, so the row is the record and the push is
 * a best-effort copy of it.
 */
export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  declare type: NotificationType;
  declare title: string;
  declare body: CreationOptional<string | null>;
  /** Deep-link target, so a tap lands on the thing rather than on the feed. */
  declare link: CreationOptional<string | null>;
  declare report_id: CreationOptional<string | null>;
  declare read_at: CreationOptional<string | null>;
  declare pushed_at: CreationOptional<string | null>;
  declare created_at: string;
}

Notification.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    user_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(32), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    body: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
    link: { type: DataTypes.STRING(256), allowNull: true, defaultValue: null },
    report_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
    read_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    pushed_at: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
    created_at: { type: DataTypes.STRING(32), allowNull: false },
  },
  {
    sequelize,
    modelName: "Notification",
    tableName: "notifications",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_notifications_user", fields: ["user_id", "created_at"] },
      { name: "idx_notifications_unread", fields: ["user_id", "read_at"] },
    ],
  },
);

Notification.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
});

export default ReportSupport;
