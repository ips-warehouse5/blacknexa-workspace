/**
 * Model registry, associations, and schema bootstrap.
 *
 * Importing this module registers all 41 models on the shared Sequelize
 * instance. `initializeModels()` optionally syncs the schema (development only —
 * `DB_SYNC` is forced to false in production by env validation) and seeds the
 * article table on first boot, which is the behaviour the Durable Object's
 * `ensureSeed()` provided.
 */

import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";

import Article from "@/models/article.model";
import { ArticleImage, ArticleAudio } from "@/models/article_media.model";
import ArticleTranslation from "@/models/article_translation.model";
import { JurisdictionCache, LegalTranslation } from "@/models/jurisdiction_cache.model";
import { Incident, EvidencePackage, DispatchAudit } from "@/models/incident.model";
import { PlatformCache, IdempotencyReplay } from "@/models/platform_cache.model";
import Creator from "@/models/creator.model";
import Tip from "@/models/tip.model";
import LedgerEntry from "@/models/ledger_entry.model";
import Payout from "@/models/payout.model";
import JobQueue from "@/models/job_queue.model";
import { ModerationLog, TosAgreement } from "@/models/compliance.model";
import {
  EnterpriseArticle,
  ArtistTip,
  HardwareTrigger,
} from "@/models/enterprise_article.model";
import PersistenceSnapshotModel from "@/models/persistence_snapshot.model";
import AdminUser from "@/models/admin_user.model";
import {
  AppUser,
  EmailOtp,
  PasswordHistory,
  UserConsent,
  AccountDeletion,
  UserIdentity,
  UserSession,
} from "@/models/app_user.model";
import {
  Report,
  ReportDraft,
  ReportEvidence,
  ReportStatusEvent,
  ensureReferenceSequences,
} from "@/models/report.model";
import {
  CommentLike,
  Notification,
  ReportComment,
  ReportCorroboration,
  ReportFlag,
  ReportHide,
  ReportShareLink,
  ReportSupport,
} from "@/models/report_social.model";

// ── Associations ─────────────────────────────────────────────────────────────
//
// The Durable Object declared these as SQLite FOREIGN KEY … ON DELETE CASCADE.
// They are restated here so Sequelize creates the same constraints and so the
// service layer can eager-load where it helps.

Article.hasOne(ArticleImage, {
  foreignKey: "article_id",
  sourceKey: "id",
  as: "image",
  onDelete: "CASCADE",
});
ArticleImage.belongsTo(Article, { foreignKey: "article_id", targetKey: "id", as: "article" });

Article.hasOne(ArticleAudio, {
  foreignKey: "article_id",
  sourceKey: "id",
  as: "audio",
  onDelete: "CASCADE",
});
ArticleAudio.belongsTo(Article, { foreignKey: "article_id", targetKey: "id", as: "article" });

Article.hasMany(ArticleTranslation, {
  foreignKey: "article_id",
  sourceKey: "id",
  as: "translations",
  onDelete: "CASCADE",
});
ArticleTranslation.belongsTo(Article, {
  foreignKey: "article_id",
  targetKey: "id",
  as: "article",
});

Incident.hasMany(EvidencePackage, {
  foreignKey: "incident_id",
  sourceKey: "id",
  as: "evidence",
  onDelete: "CASCADE",
});
EvidencePackage.belongsTo(Incident, {
  foreignKey: "incident_id",
  targetKey: "id",
  as: "incident",
});

/**
 * `dispatch_audit.incident_id` is a **soft** reference — deliberately no foreign key.
 *
 * `POST /api/v1/geo-legal/dispatch` can be called before an incident exists (the
 * app dispatches straight from a validated draft), and in that case the column
 * holds the sentinel `"draft"`. DO-SQLite never enforced its declared foreign key,
 * so this worked; PostgreSQL would reject every draft dispatch with a constraint
 * violation. `constraints: false` keeps the association usable for eager loading
 * while letting the sentinel remain valid.
 *
 * Erasure still removes these rows: `geoLegalService.deleteIncident` deletes them
 * explicitly by `incident_id` inside the transaction rather than relying on a
 * database cascade.
 */
Incident.hasMany(DispatchAudit, {
  foreignKey: "incident_id",
  sourceKey: "id",
  as: "dispatchAudit",
  constraints: false,
});

// ── End-user account graph ───────────────────────────────────────────────────
//
// All four children cascade: when an account is genuinely erased, its sessions,
// federated links, password history and consent records go with it. Reports and
// comments deliberately do *not* cascade — they are handled by the erasure job,
// which offers the owner a choice between deletion and severing the identity
// link (see docs/FEATURE_BUILD_PLAN.md §7.7).

AppUser.hasMany(UserSession, {
  foreignKey: "user_id",
  sourceKey: "id",
  as: "sessions",
  onDelete: "CASCADE",
});
UserSession.belongsTo(AppUser, { foreignKey: "user_id", targetKey: "id", as: "user" });

AppUser.hasMany(UserIdentity, {
  foreignKey: "user_id",
  sourceKey: "id",
  as: "identities",
  onDelete: "CASCADE",
});
UserIdentity.belongsTo(AppUser, { foreignKey: "user_id", targetKey: "id", as: "user" });

AppUser.hasMany(PasswordHistory, {
  foreignKey: "user_id",
  sourceKey: "id",
  as: "passwordHistory",
  onDelete: "CASCADE",
});
PasswordHistory.belongsTo(AppUser, { foreignKey: "user_id", targetKey: "id", as: "user" });

AppUser.hasMany(UserConsent, {
  foreignKey: "user_id",
  sourceKey: "id",
  as: "consents",
  onDelete: "CASCADE",
});
UserConsent.belongsTo(AppUser, { foreignKey: "user_id", targetKey: "id", as: "user" });

// `email_otps` has no association: it is keyed by email address, not user id, so
// that screen A13 can behave identically for an address with no account. Joining
// it to a user would reintroduce exactly the lookup that makes the two paths
// distinguishable.

Creator.hasMany(Tip, {
  foreignKey: "creator_id",
  sourceKey: "id",
  as: "tips",
  onDelete: "CASCADE",
});
Tip.belongsTo(Creator, { foreignKey: "creator_id", targetKey: "id", as: "creator" });

Creator.hasMany(LedgerEntry, {
  foreignKey: "creator_id",
  sourceKey: "id",
  as: "ledger",
  onDelete: "CASCADE",
});
LedgerEntry.belongsTo(Creator, { foreignKey: "creator_id", targetKey: "id", as: "creator" });

Creator.hasMany(Payout, {
  foreignKey: "creator_id",
  sourceKey: "id",
  as: "payouts",
  onDelete: "CASCADE",
});
Payout.belongsTo(Creator, { foreignKey: "creator_id", targetKey: "id", as: "creator" });

// ── Report graph ─────────────────────────────────────────────────────────────
//
// Evidence, status events and the social tables all cascade from the report,
// because none of them means anything without it. `report_drafts` does not:
// filing re-parents a draft's evidence to the new report and deletes the draft, so
// a cascade there would take the files with it.

Report.hasMany(ReportEvidence, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "evidence",
  onDelete: "CASCADE",
  // Evidence starts life attached to a draft, so the column is legitimately null
  // for a while and a hard constraint would reject the presign.
  constraints: false,
});

Report.hasMany(ReportStatusEvent, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "statusEvents",
  onDelete: "CASCADE",
});

Report.hasMany(ReportSupport, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "supports",
  onDelete: "CASCADE",
});

Report.hasMany(ReportCorroboration, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "corroborations",
  onDelete: "CASCADE",
});

Report.hasMany(ReportComment, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "comments",
  onDelete: "CASCADE",
});

ReportComment.hasMany(CommentLike, {
  foreignKey: "comment_id",
  sourceKey: "id",
  as: "likes",
  onDelete: "CASCADE",
});

// A flag points at a report *or* a comment, so neither column can carry a
// constraint — the other one is null on every row.
Report.hasMany(ReportFlag, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "flags",
  constraints: false,
});

Report.hasMany(ReportShareLink, {
  foreignKey: "report_id",
  sourceKey: "id",
  as: "shareLinks",
  onDelete: "CASCADE",
});

// ── Registry ─────────────────────────────────────────────────────────────────

export const models = {
  Article,
  ArticleImage,
  ArticleAudio,
  ArticleTranslation,
  JurisdictionCache,
  LegalTranslation,
  Incident,
  EvidencePackage,
  DispatchAudit,
  PlatformCache,
  IdempotencyReplay,
  Creator,
  Tip,
  LedgerEntry,
  Payout,
  JobQueue,
  ModerationLog,
  TosAgreement,
  EnterpriseArticle,
  ArtistTip,
  HardwareTrigger,
  PersistenceSnapshot: PersistenceSnapshotModel,
  AdminUser,
  AppUser,
  UserSession,
  UserIdentity,
  EmailOtp,
  PasswordHistory,
  UserConsent,
  AccountDeletion,
  Report,
  ReportDraft,
  ReportEvidence,
  ReportStatusEvent,
  ReportSupport,
  ReportCorroboration,
  ReportComment,
  CommentLike,
  ReportFlag,
  ReportHide,
  ReportShareLink,
  Notification,
};

export type Models = typeof models;

/**
 * Create/align the schema when `DB_SYNC` is on.
 *
 * `alter` is genuinely useful in development and genuinely dangerous in
 * production, which is why env validation refuses to start a production process
 * with `DB_SYNC=true`. Production schema changes belong in a migration.
 */
export async function syncModels(): Promise<void> {
  if (!env.database.sync) {
    logger.info("[db] DB_SYNC is off — skipping schema sync");
    // The reference sequences are not tables, so `sync` never creates them and a
    // migration-managed deployment still needs them present.
    await ensureReferenceSequences();
    return;
  }
  await sequelize.sync({ alter: env.database.syncAlter });
  await ensureReferenceSequences();
  logger.info(`[db] schema synced (alter=${env.database.syncAlter})`);
}

export {
  sequelize,
  Article,
  ArticleImage,
  ArticleAudio,
  ArticleTranslation,
  JurisdictionCache,
  LegalTranslation,
  Incident,
  EvidencePackage,
  DispatchAudit,
  PlatformCache,
  IdempotencyReplay,
  Creator,
  Tip,
  LedgerEntry,
  Payout,
  JobQueue,
  ModerationLog,
  TosAgreement,
  EnterpriseArticle,
  ArtistTip,
  HardwareTrigger,
  PersistenceSnapshotModel,
  AdminUser,
  AppUser,
  UserSession,
  UserIdentity,
  EmailOtp,
  PasswordHistory,
  UserConsent,
  AccountDeletion,
  Report,
  ReportDraft,
  ReportEvidence,
  ReportStatusEvent,
  ReportSupport,
  ReportCorroboration,
  ReportComment,
  CommentLike,
  ReportFlag,
  ReportHide,
  ReportShareLink,
  Notification,
};

export default models;
