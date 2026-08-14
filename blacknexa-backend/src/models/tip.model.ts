/**
 * `tips` — every micro-tip transaction.
 *
 * All monetary columns are integers in **USD cents**. That is deliberate and
 * carried over from the original: floating-point money in a ledger accumulates
 * error, and the platform reconciles across 14 currencies.
 *
 * Not `paranoid`: a tip is a financial record. It transitions status
 * (pending → succeeded/failed/refunded) and is never deleted; a reversal is
 * recorded as a new ledger entry instead.
 *
 * `idempotency_key` is UNIQUE — that constraint, not application logic, is what
 * ultimately prevents a retried request from double-charging.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import type { PaymentProvider, TipStatus } from "@/types/platform.interface";

export class Tip extends Model<InferAttributes<Tip>, InferCreationAttributes<Tip>> {
  declare id: string;
  declare idempotency_key: string;
  declare sender_user_id: string;
  declare creator_id: string;
  /** Original amount in the sender's currency (minor units). */
  declare amount: number;
  declare currency: string;
  /** Amount normalised to USD cents for ledger reconciliation. */
  declare amount_usd: number;
  declare platform_fee_percent: number;
  declare platform_fee_usd: number;
  declare net_to_creator_usd: number;
  declare provider_transaction_id: string | null;
  declare provider: PaymentProvider;
  declare status: TipStatus;
  declare message: string | null;
  /** True when this was a platform-funded "Seed Drop" micro-grant. */
  declare is_seed_drop: boolean;
  declare created_at: string;
  declare settled_at: string | null;
}

Tip.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    idempotency_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: "tips_idempotency_key_unique",
    },
    sender_user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    creator_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "USD",
    },
    amount_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    platform_fee_percent: {
      type: DataTypes.REAL,
      allowNull: false,
    },
    platform_fee_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    net_to_creator_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    provider_transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "stripe",
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_seed_drop: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    settled_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Tip",
    tableName: "tips",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_tips_creator", fields: ["creator_id", { name: "created_at", order: "DESC" }] },
      { name: "idx_tips_sender", fields: ["sender_user_id", { name: "created_at", order: "DESC" }] },
      { name: "idx_tips_status", fields: ["status"] },
    ],
  },
);

export default Tip;
