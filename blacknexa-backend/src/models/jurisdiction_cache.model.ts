/**
 * `jurisdiction_cache` and `legal_translations` — the Geo-Legal engine's caches.
 *
 * A lookup resolves in this order: cache → curated database (19 jurisdictions)
 * → AI resolver. Anything the AI resolves is written back here so the second
 * lookup for the same country is instant, which is exactly how the Durable
 * Object behaved.
 *
 * `profile_json` moves from a TEXT blob to `JSONB`, so the profile no longer
 * needs a parse-with-try/catch on every read.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import type { JurisdictionProfile } from "@/types/geo_legal.interface";

export class JurisdictionCache extends Model<
  InferAttributes<JurisdictionCache>,
  InferCreationAttributes<JurisdictionCache>
> {
  declare country_code: string;
  declare profile_json: JurisdictionProfile;
  declare cached_at: string;
  /** "curated" | "ai-generated" */
  declare source: string;
}

JurisdictionCache.init(
  {
    country_code: {
      type: DataTypes.STRING(8),
      primaryKey: true,
      allowNull: false,
    },
    profile_json: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    cached_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "curated",
    },
  },
  {
    sequelize,
    modelName: "JurisdictionCache",
    tableName: "jurisdiction_cache",
    ...BASE_OPTIONS,
  },
);

export class LegalTranslation extends Model<
  InferAttributes<LegalTranslation>,
  InferCreationAttributes<LegalTranslation>
> {
  declare country_code: string;
  declare language: string;
  declare profile_json: JurisdictionProfile;
  declare translated_at: string;
}

LegalTranslation.init(
  {
    country_code: {
      type: DataTypes.STRING(8),
      primaryKey: true,
      allowNull: false,
    },
    language: {
      type: DataTypes.STRING(8),
      primaryKey: true,
      allowNull: false,
    },
    profile_json: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    translated_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "LegalTranslation",
    tableName: "legal_translations",
    ...BASE_OPTIONS,
  },
);

export default JurisdictionCache;
