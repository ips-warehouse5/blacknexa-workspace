/**
 * `ledger` — immutable append-only log of every balance change per creator.
 *
 * Each row carries `balance_after_usd`, the running balance at the moment it was
 * written, so a creator's history can be audited without recomputing from
 * scratch. Rows are never updated or deleted: a refund, a failed payment, or a
 * failed payout is recorded as a compensating entry.
 *
 * Not `paranoid` for that reason — there is no such thing as an un-written
 * ledger line.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { NO_TIMESTAMP_OPTIONS } from "@/models/model_options";
import type { LedgerEntry as LedgerEntryType } from "@/types/platform.interface";

export class LedgerEntry extends Model<
  InferAttributes<LedgerEntry>,
  InferCreationAttributes<LedgerEntry>
> {
  declare id: string;
  declare creator_id: string;
  /** For a payout entry this holds the payout id, mirroring the original. */
  declare tip_id: string;
  declare type: LedgerEntryType["type"];
  /** Signed amount in USD cents — negative for debits and payouts. */
  declare amount_usd: number;
  declare balance_after_usd: number;
  declare description: string;
  declare created_at: string;
}

LedgerEntry.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    creator_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tip_id: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "",
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    amount_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    balance_after_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "LedgerEntry",
    tableName: "ledger",
    ...NO_TIMESTAMP_OPTIONS,
    indexes: [
      {
        name: "idx_ledger_creator",
        fields: ["creator_id", { name: "created_at", order: "DESC" }],
      },
    ],
  },
);

export default LedgerEntry;
