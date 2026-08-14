/**
 * Zero-Data-Loss persistence engine types. Ported from `platform/persistence.ts`.
 */

/** Tables the persistence engine snapshots and restores. */
export const PERSISTED_TABLES = [
  "enterprise_articles",
  "artist_tips",
  "hardware_triggers",
  "creators",
  "tips",
  "ledger",
  "payouts",
  "idempotency_replay",
  "moderation_log",
  "tos_agreements",
  "job_queue",
] as const;

export type PersistedTableName = (typeof PERSISTED_TABLES)[number];

/** Primary-key column per table, used for merge dedup. */
export const PERSISTED_PRIMARY_KEYS: Record<PersistedTableName, string> = {
  enterprise_articles: "id",
  artist_tips: "id",
  hardware_triggers: "event_id",
  creators: "id",
  tips: "id",
  ledger: "id",
  payouts: "id",
  idempotency_replay: "key",
  moderation_log: "id",
  tos_agreements: "id",
  job_queue: "id",
};

/** A snapshot of all platform tables, tagged with metadata. */
export interface PersistenceSnapshot {
  version: string;
  timestamp: string;
  tables: Record<PersistedTableName, unknown[]>;
  counts: Record<string, number>;
  checksum: string;
}

/** Result of a merge-restore operation. */
export interface MergeResult {
  success: boolean;
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  totalBefore: Record<string, number>;
  totalAfter: Record<string, number>;
  errors: string[];
}

/** Integrity check result. */
export interface IntegrityResult {
  success: boolean;
  tableCounts: Record<string, number>;
  orphanedRecords: Record<string, number>;
  checksum: string;
  issues: string[];
}

/** Snapshot list-row metadata (no full JSON). */
export interface SnapshotListItem {
  id: string;
  rowCount: number;
  checksum: string;
  createdAt: string;
  auto: boolean;
}
