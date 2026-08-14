/**
 * Model registry, associations, and schema bootstrap.
 *
 * Importing this module registers all 23 models on the shared Sequelize
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
    return;
  }
  await sequelize.sync({ alter: env.database.syncAlter });
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
};

export default models;
