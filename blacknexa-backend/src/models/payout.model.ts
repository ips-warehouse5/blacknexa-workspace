/**
 * `payouts` — creator withdrawal requests.
 *
 * `idempotency_key` is UNIQUE, which is what makes a retried withdrawal safe:
 * the client generates the key, and a duplicate request replays the original
 * response instead of creating a second transfer.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import type { PayoutDestination, PayoutStatus } from "@/types/platform.interface";

export class Payout extends Model<InferAttributes<Payout>, InferCreationAttributes<Payout>> {
  declare id: string;
  declare creator_id: string;
  /** Gross amount withdrawn, in USD cents. */
  declare amount_usd: number;
  declare payout_fee_usd: number;
  declare net_amount_usd: number;
  declare destination: PayoutDestination;
  declare provider_transfer_id: string | null;
  declare status: PayoutStatus;
  declare idempotency_key: string;
  declare created_at: string;
  declare processed_at: string | null;
  declare failure_reason: string | null;
}

Payout.init(
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
    amount_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    payout_fee_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    net_amount_usd: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    destination: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "stripe",
    },
    provider_transfer_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "requested",
    },
    idempotency_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: "payouts_idempotency_key_unique",
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    processed_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    failure_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Payout",
    tableName: "payouts",
    ...BASE_OPTIONS,
    indexes: [
      {
        name: "idx_payouts_creator",
        fields: ["creator_id", { name: "created_at", order: "DESC" }],
      },
      { name: "idx_payouts_status", fields: ["status"] },
    ],
  },
);

export default Payout;
