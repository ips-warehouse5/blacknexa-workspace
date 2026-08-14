/**
 * Zero-Data-Loss State Persistence Engine.
 *
 * Ported from `platform/persistence.ts`. The engine exists to satisfy one
 * directive: no prompt injection, template reset, or component update may ever
 * wipe existing articles, vault logs, artist tips, or user records.
 *
 * The mechanism is a **merge, never a restore**. `mergeSnapshot` inserts a row
 * only when its primary key is absent; an existing row always wins. That makes a
 * restore idempotent and impossible to use as a destructive operation, which is
 * the whole point.
 *
 * ── SQL-injection note ──────────────────────────────────────────────────────
 * This is the only module that interpolates a table name into SQL, because it
 * iterates over tables generically. Every name comes from the frozen
 * `PERSISTED_TABLES` tuple and is re-checked against it by `assertTable()` before
 * use, so no caller-supplied string can reach a query. Row *values* are always
 * bind parameters.
 */

import { Op, QueryTypes } from "sequelize";
import sequelize from "@/config/database.config";
import logger from "@/utils/logger.util";
import { djb2 } from "@/utils/hash.util";
import { prefixedId } from "@/utils/id.util";
import PersistenceSnapshotModel from "@/models/persistence_snapshot.model";
import { DEFAULTS, ENTERPRISE_VERSION } from "@/config/constants";
import {
  PERSISTED_PRIMARY_KEYS,
  PERSISTED_TABLES,
  type IntegrityResult,
  type MergeResult,
  type PersistedTableName,
  type PersistenceSnapshot,
  type SnapshotListItem,
} from "@/types/persistence.interface";

/** Identifiers that may be interpolated into SQL — nothing else, ever. */
const ALLOWED_TABLES: ReadonlySet<string> = new Set(PERSISTED_TABLES);
const ALLOWED_COLUMN = /^[a-z_][a-z0-9_]*$/;

class PersistenceService {
  /** Reject anything not in the frozen allowlist before it touches a query. */
  private assertTable(table: string): PersistedTableName {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`refusing to query non-allowlisted table '${table}'`);
    }
    return table as PersistedTableName;
  }

  /** Reject column names that are not plain snake_case identifiers. */
  private assertColumn(column: string): string {
    if (!ALLOWED_COLUMN.test(column)) {
      throw new Error(`refusing to query invalid column '${column}'`);
    }
    return column;
  }

  /** A snapshot skeleton with an empty array for every persisted table. */
  private emptyTables(): Record<PersistedTableName, unknown[]> {
    const tables = {} as Record<PersistedTableName, unknown[]>;
    for (const table of PERSISTED_TABLES) tables[table] = [];
    return tables;
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  /** Read every persisted table into a snapshot, with a comparison checksum. */
  async snapshotAllTables(): Promise<PersistenceSnapshot> {
    const tables = this.emptyTables();
    const counts: Record<string, number> = {};

    for (const table of PERSISTED_TABLES) {
      const name = this.assertTable(table);
      try {
        const rows = await sequelize.query<Record<string, unknown>>(
          `SELECT * FROM ${name}`,
          { type: QueryTypes.SELECT },
        );
        tables[name] = rows;
        counts[name] = rows.length;
      } catch (err) {
        // A table that does not exist yet is treated as empty, matching the original.
        logger.debug(`[persistence] table ${name} unavailable`, {
          message: err instanceof Error ? err.message : String(err),
        });
        tables[name] = [];
        counts[name] = 0;
      }
    }

    return {
      version: ENTERPRISE_VERSION,
      timestamp: new Date().toISOString(),
      tables,
      counts,
      checksum: this.computeChecksum(tables),
    };
  }

  // ── Merge / restore ────────────────────────────────────────────────────────

  /**
   * Merge a snapshot into the current state, append-only.
   *
   * For each table: read the existing primary keys, then insert only the incoming
   * rows whose key is absent. `ON CONFLICT DO NOTHING` is a second line of defence
   * so a concurrent insert cannot turn into an error or an overwrite.
   */
  async mergeSnapshot(snapshot: PersistenceSnapshot): Promise<MergeResult> {
    const result: MergeResult = {
      success: true,
      inserted: {},
      skipped: {},
      totalBefore: {},
      totalAfter: {},
      errors: [],
    };

    for (const table of PERSISTED_TABLES) {
      const name = this.assertTable(table);
      const pk = this.assertColumn(PERSISTED_PRIMARY_KEYS[name]);
      const incomingRows = snapshot.tables?.[name] ?? [];

      let existingIds = new Set<string | number>();
      try {
        const existingRows = await sequelize.query<{ pk: string | number }>(
          `SELECT ${pk} AS pk FROM ${name}`,
          { type: QueryTypes.SELECT },
        );
        existingIds = new Set(existingRows.map((r) => r.pk));
      } catch {
        // Table absent — start from empty.
      }

      result.totalBefore[name] = existingIds.size;
      let inserted = 0;
      let skipped = 0;

      for (const row of incomingRows) {
        const rowRecord = row as Record<string, unknown>;
        const rowId = rowRecord[pk];

        if (rowId === undefined || rowId === null) {
          result.errors.push(`[${name}] row missing primary key '${pk}' — skipped`);
          skipped++;
          continue;
        }
        if (existingIds.has(rowId as string | number)) {
          // Existing record wins. This is the guarantee, not a fallback.
          skipped++;
          continue;
        }

        try {
          const columns = Object.keys(rowRecord).map((c) => this.assertColumn(c));
          if (columns.length === 0) {
            skipped++;
            continue;
          }
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const values = columns.map((c) => rowRecord[c]);

          await sequelize.query(
            `INSERT INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})
             ON CONFLICT DO NOTHING`,
            { bind: values, type: QueryTypes.INSERT },
          );
          existingIds.add(rowId as string | number);
          inserted++;
        } catch (err) {
          result.errors.push(
            `[${name}] insert failed for id=${String(rowId)}: ${err instanceof Error ? err.message : String(err)}`,
          );
          skipped++;
        }
      }

      result.inserted[name] = inserted;
      result.skipped[name] = skipped;

      try {
        const [countRow] = await sequelize.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM ${name}`,
          { type: QueryTypes.SELECT },
        );
        result.totalAfter[name] = Number(countRow?.c ?? 0);
      } catch {
        result.totalAfter[name] = result.totalBefore[name] + inserted;
      }
    }

    // Row-level failures are reported but do not mark the whole merge as failed —
    // partial progress is still progress, and the errors array says what was lost.
    logger.info("[persistence] merge complete", {
      inserted: result.inserted,
      errorCount: result.errors.length,
    });
    return result;
  }

  // ── Integrity ──────────────────────────────────────────────────────────────

  /** Row counts, orphan detection, and a comparable checksum. */
  async integrityCheck(): Promise<IntegrityResult> {
    const tableCounts: Record<string, number> = {};
    const orphanedRecords: Record<string, number> = {};
    const issues: string[] = [];

    for (const table of PERSISTED_TABLES) {
      const name = this.assertTable(table);
      try {
        const [row] = await sequelize.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM ${name}`,
          { type: QueryTypes.SELECT },
        );
        tableCounts[name] = Number(row?.c ?? 0);
      } catch {
        tableCounts[name] = 0;
        issues.push(`Table '${name}' does not exist or is inaccessible`);
      }
    }

    // Financial tables referencing a missing creator indicate a real problem.
    for (const child of ["tips", "ledger", "payouts"] as const) {
      const name = this.assertTable(child);
      try {
        const [row] = await sequelize.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM ${name} WHERE creator_id NOT IN (SELECT id FROM creators)`,
          { type: QueryTypes.SELECT },
        );
        const count = Number(row?.c ?? 0);
        orphanedRecords[name] = count;
        if (count > 0) {
          issues.push(`${count} ${name} record(s) reference non-existent creators`);
        }
      } catch {
        orphanedRecords[name] = 0;
      }
    }

    let checksum = "";
    try {
      const snapshot = await this.snapshotAllTables();
      checksum = snapshot.checksum;
    } catch {
      checksum = "unable-to-compute";
      issues.push("Could not compute checksum");
    }

    return {
      success: issues.length === 0,
      tableCounts,
      orphanedRecords,
      checksum,
      issues,
    };
  }

  // ── Snapshot storage ───────────────────────────────────────────────────────

  /** Persist a snapshot for later retrieval. */
  async storeSnapshot(snapshot: PersistenceSnapshot, auto = false): Promise<string> {
    const id = prefixedId("snap");
    const totalRows = Object.values(snapshot.counts).reduce((a, b) => a + b, 0);
    await PersistenceSnapshotModel.create({
      id,
      snapshot_json: snapshot,
      row_count: totalRows,
      checksum: snapshot.checksum,
      created_at: snapshot.timestamp,
      auto,
    });
    return id;
  }

  /** The most recent snapshot, used when restore is called with no body. */
  async getLatestSnapshot(): Promise<{ id: string; snapshot: PersistenceSnapshot } | null> {
    const row = await PersistenceSnapshotModel.findOne({
      order: [["created_at", "DESC"]],
    });
    if (!row) return null;
    return { id: row.id, snapshot: row.snapshot_json };
  }

  /** Snapshot metadata only — the full JSON would be megabytes per row. */
  async listSnapshots(limit = DEFAULTS.SNAPSHOTS_LIMIT): Promise<SnapshotListItem[]> {
    const rows = await PersistenceSnapshotModel.findAll({
      attributes: ["id", "row_count", "checksum", "created_at", "auto"],
      order: [["created_at", "DESC"]],
      limit,
    });
    return rows.map((r) => ({
      id: r.id,
      rowCount: r.row_count,
      checksum: r.checksum,
      createdAt: r.created_at,
      auto: r.auto,
    }));
  }

  /**
   * Keep the most recent `keep` snapshots and delete the rest. Returns the number
   * of rows removed.
   *
   * Snapshots hold a full JSON copy of every table, so unbounded growth is a real
   * disk problem — this runs on every maintenance cycle.
   */
  async pruneOldSnapshots(keep = DEFAULTS.SNAPSHOT_RETENTION): Promise<number> {
    const survivors = await PersistenceSnapshotModel.findAll({
      attributes: ["id"],
      order: [["created_at", "DESC"]],
      limit: keep,
    });
    const keepIds = survivors.map((r) => r.id);
    if (keepIds.length === 0) return 0;

    return PersistenceSnapshotModel.destroy({
      where: { id: { [Op.notIn]: keepIds } },
    });
  }

  // ── Checksum ───────────────────────────────────────────────────────────────

  /**
   * djb2 over table names, row counts, and the first/last row of each table.
   *
   * Not cryptographic — it is a fast comparison aid, and it is kept identical to
   * the original so checksums recorded before the migration remain comparable.
   */
  private computeChecksum(tables: Record<PersistedTableName, unknown[]>): string {
    const parts: string[] = [];
    for (const [name, rows] of Object.entries(tables)) {
      parts.push(`${name}:${rows.length}`);
      if (rows.length > 0) {
        parts.push(`f:${djb2(JSON.stringify(rows[0]))}`);
        parts.push(`l:${djb2(JSON.stringify(rows[rows.length - 1]))}`);
      }
    }
    return djb2(parts.join("|"));
  }
}

export const persistenceService = new PersistenceService();
export default persistenceService;
