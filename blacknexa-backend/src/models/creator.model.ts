/**
 * `creators` — creator profiles eligible to receive tips.
 *
 * The primary key is a TEXT id in the form `creator_<userId>`. That string is
 * derived **client-side** (`creatorIdFor()` in `TippingDashboard.tsx`) and sent
 * back in `GET /platform/tipping/creator/:id/balance`, so it is a wire contract,
 * not an internal detail. Replacing it with a UUID would break the tipping
 * dashboard on first load.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { SOFT_DELETE_OPTIONS } from "@/models/model_options";

export class Creator extends Model<
  InferAttributes<Creator>,
  InferCreationAttributes<Creator>
> {
  declare id: string;
  declare user_id: string;
  declare display_name: string;
  declare handle: string;
  declare bio: string;
  declare default_currency: string;
  declare stripe_account_id: string | null;
  /** Registration defaults to false — verification requires moderation review. */
  declare verified: boolean;
  declare created_at: string;
}

Creator.init(
  {
    id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: "creators_user_id_unique",
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    handle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: "creators_handle_unique",
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    default_currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "USD",
    },
    stripe_account_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Creator",
    tableName: "creators",
    ...SOFT_DELETE_OPTIONS,
    indexes: [{ name: "idx_creators_verified", fields: ["verified"] }],
  },
);

export default Creator;
