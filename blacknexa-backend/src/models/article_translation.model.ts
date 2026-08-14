/**
 * `article_translations` — cached AI translations keyed by (article, language).
 *
 * A second read of the same article in the same language is a single indexed
 * lookup and costs nothing, which is what makes the 19-language pre-translation
 * strategy viable.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import type { LanguageCode } from "@/types/i18n.interface";

export class ArticleTranslation extends Model<
  InferAttributes<ArticleTranslation>,
  InferCreationAttributes<ArticleTranslation>
> {
  declare article_id: string;
  declare language: LanguageCode;
  declare headline: string;
  declare summary: string;
  declare content: string;
  declare godly_principle_alignment: string;
  /** ISO-8601 UTC string — contract field returned as `translatedAt`. */
  declare translated_at: string;
}

ArticleTranslation.init(
  {
    article_id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    language: {
      type: DataTypes.STRING(8),
      primaryKey: true,
      allowNull: false,
    },
    headline: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    godly_principle_alignment: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    translated_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ArticleTranslation",
    tableName: "article_translations",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_translations_article", fields: ["article_id"] }],
  },
);

export default ArticleTranslation;
