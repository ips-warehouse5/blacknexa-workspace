/**
 * `enterprise_articles`, `artist_tips`, `hardware_triggers` — the Enterprise Core
 * Engine tables behind `/api/v1/blacknexa/*`.
 *
 * `enterprise_articles.id` stays an **integer autoincrement**. That is a wire
 * contract, not laziness: `NewsProvider.tsx` normalises the response with
 * `id: \`ent-${ent.id}\`` and `slug: \`verified-${ent.id}\``, so a UUID would
 * change the ids the app renders and stores.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type CreationOptional } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS, SOFT_DELETE_OPTIONS } from "@/models/model_options";

export class EnterpriseArticle extends Model<
  InferAttributes<EnterpriseArticle>,
  InferCreationAttributes<EnterpriseArticle>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare category: string;
  declare location: string;
  /** JSON array of named individuals. */
  declare key_individuals: string[];
  declare content: string;
  declare character_count: number;
  declare fact_verified: boolean;
  declare locale: string;
  declare verified_sources: { name: string; url: string }[];
  declare timestamp: string;
}

EnterpriseArticle.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    key_individuals: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    character_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fact_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    locale: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "en",
    },
    verified_sources: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    timestamp: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "EnterpriseArticle",
    tableName: "enterprise_articles",
    ...SOFT_DELETE_OPTIONS,
    indexes: [
      { name: "idx_enterprise_category", fields: ["category"] },
      { name: "idx_enterprise_location", fields: ["location"] },
      { name: "idx_enterprise_timestamp", fields: [{ name: "timestamp", order: "DESC" }] },
    ],
  },
);

export class ArtistTip extends Model<
  InferAttributes<ArtistTip>,
  InferCreationAttributes<ArtistTip>
> {
  declare id: CreationOptional<number>;
  declare artist_id: string;
  declare supporter_user_id: string;
  /** Dollars, not cents — this simplified path mirrors the original's REAL column. */
  declare tip_amount_usd: number;
  declare message: string;
  declare timestamp: string;
}

ArtistTip.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    artist_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    supporter_user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tip_amount_usd: {
      type: DataTypes.REAL,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    timestamp: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ArtistTip",
    tableName: "artist_tips",
    ...BASE_OPTIONS,
    indexes: [
      {
        name: "idx_artist_tips_artist",
        fields: ["artist_id", { name: "timestamp", order: "DESC" }],
      },
    ],
  },
);

export class HardwareTrigger extends Model<
  InferAttributes<HardwareTrigger>,
  InferCreationAttributes<HardwareTrigger>
> {
  declare event_id: CreationOptional<number>;
  declare user_id: string;
  declare device_mac: string;
  declare action: string;
  /** "lat,lon" — stored exactly as the original formatted it. */
  declare location: string;
  declare timestamp: string;
}

HardwareTrigger.init(
  {
    event_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    device_mac: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    location: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "0,0",
    },
    timestamp: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "HardwareTrigger",
    tableName: "hardware_triggers",
    ...BASE_OPTIONS,
    indexes: [
      {
        name: "idx_hw_triggers_user",
        fields: ["user_id", { name: "timestamp", order: "DESC" }],
      },
    ],
  },
);

export default EnterpriseArticle;
