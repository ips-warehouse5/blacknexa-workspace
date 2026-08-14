/**
 * `persistence_snapshots` — the Zero-Data-Loss engine's snapshot store.
 *
 * Snapshots exist so a restore can be an *append-only merge*: incoming rows are
 * inserted only when their primary key is absent, and existing rows always win.
 * That is the whole point of the engine — a template reset or component update
 * can never wipe articles, vault logs, tips or user records.
 *
 * Not `paranoid`: `pruneOldSnapshots` keeps the most recent N and must actually
 * reclaim the rest, since each row holds a full JSON copy of every table.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { NO_TIMESTAMP_OPTIONS } from "@/models/model_options";
import type { PersistenceSnapshot } from "@/types/persistence.interface";

export class PersistenceSnapshotModel extends Model<
  InferAttributes<PersistenceSnapshotModel>,
  InferCreationAttributes<PersistenceSnapshotModel>
> {
  declare id: string;
  declare snapshot_json: PersistenceSnapshot;
  declare row_count: number;
  declare checksum: string;
  declare created_at: string;
  /** True when written by the maintenance cron rather than an operator. */
  declare auto: boolean;
}

PersistenceSnapshotModel.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    snapshot_json: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    row_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    auto: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "PersistenceSnapshot",
    tableName: "persistence_snapshots",
    ...NO_TIMESTAMP_OPTIONS,
    indexes: [
      { name: "idx_snapshots_created", fields: [{ name: "created_at", order: "DESC" }] },
    ],
  },
);

export default PersistenceSnapshotModel;
