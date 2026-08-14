/**
 * Shared Sequelize model options.
 *
 * ── Timestamp strategy ──────────────────────────────────────────────────────
 * The Durable Objects stored every domain timestamp as an ISO-8601 **string**
 * (`new Date().toISOString()`) and the mobile clients parse those strings
 * directly — `publishedAt`, `createdAt`, `translatedAt`, `dispatchedAt` and so on
 * are all wire-contract fields. Those columns are therefore kept as TEXT with
 * their original names, so a value written by this service is byte-identical to
 * one written by the Worker.
 *
 * The ORM's own automatic timestamps are still enabled, as the architecture spec
 * requires, but mapped to separate `created_on` / `updated_on` / `deleted_on`
 * `timestamptz` columns so they never collide with a contract column. They are
 * audit metadata; they are never serialised into a response.
 *
 * ── Soft deletes ────────────────────────────────────────────────────────────
 * `paranoid: true` is applied via `SOFT_DELETE_OPTIONS` to entities where
 * retaining history is correct. It is deliberately *not* applied to:
 *   • incidents / evidence_packages / dispatch_audit — `DELETE /geo-legal/incident/:id`
 *     is presented to the user as GDPR/CCPA right-to-erasure, so it must really
 *     delete. A soft delete there would be a compliance misstatement.
 *   • platform_cache / job_queue / idempotency_replay / persistence_snapshots —
 *     churn tables whose prune paths exist to reclaim rows.
 *   • tips / ledger — financial records; the ledger is append-only by design.
 */

import type { ModelOptions } from "sequelize";

/** Automatic ORM timestamps on dedicated columns, no soft delete. */
export const BASE_OPTIONS: Pick<
  ModelOptions,
  "timestamps" | "createdAt" | "updatedAt" | "underscored" | "freezeTableName"
> = {
  timestamps: true,
  createdAt: "created_on",
  updatedAt: "updated_on",
  underscored: true,
  freezeTableName: true,
};

/** Automatic ORM timestamps plus `paranoid` soft delete. */
export const SOFT_DELETE_OPTIONS: Pick<
  ModelOptions,
  "timestamps" | "createdAt" | "updatedAt" | "deletedAt" | "paranoid" | "underscored" | "freezeTableName"
> = {
  ...BASE_OPTIONS,
  paranoid: true,
  deletedAt: "deleted_on",
};

/** No ORM timestamps at all — for pure key/value churn tables. */
export const NO_TIMESTAMP_OPTIONS: Pick<
  ModelOptions,
  "timestamps" | "underscored" | "freezeTableName"
> = {
  timestamps: false,
  underscored: true,
  freezeTableName: true,
};

/** Current UTC time in the exact format the Worker wrote. */
export function nowIso(): string {
  return new Date().toISOString();
}
