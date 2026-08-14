/**
 * `articles` — the news article table, ported from the NewsStore Durable Object.
 *
 * The primary key stays a TEXT id (`bn-2026-001`, `bn-gen-<millis>-<rand>`)
 * because it is the public article identifier: it appears in every feed response
 * and in the `/api/v1/news/image/:articleId` and `/audio/:articleId` paths that
 * the mobile clients construct from it. A UUID here would break both apps.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { SOFT_DELETE_OPTIONS } from "@/models/model_options";
import type { NewsCategory, NewsScope, VerifiedSource } from "@/types/news.interface";

export class Article extends Model<
  InferAttributes<Article>,
  InferCreationAttributes<Article>
> {
  declare id: string;
  declare slug: string;
  declare headline: string;
  declare category: NewsCategory;
  declare scope: NewsScope;
  declare summary: string;
  declare content: string;
  /** Empty string means "serve from the self-hosted media endpoint". */
  declare image_url: string;
  declare fact_check_status: string;
  /** Stored as JSONB; the DO stored a JSON string. Reads are normalised in the service. */
  declare verified_sources: VerifiedSource[];
  declare godly_principle_alignment: string;
  declare audio_url: string;
  /** ISO-8601 UTC string — contract field, sorts correctly lexicographically. */
  declare published_at: string;
  declare author: string;
  /** FNV-1a fingerprint of headline|summary|category|scope, for dedup. */
  declare content_hash: string;
}

Article.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    headline: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    scope: {
      type: DataTypes.STRING(32),
      allowNull: false,
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
    image_url: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    fact_check_status: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "",
    },
    verified_sources: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    godly_principle_alignment: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    audio_url: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    published_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    author: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
    },
    content_hash: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "",
    },
  },
  {
    sequelize,
    modelName: "Article",
    tableName: "articles",
    ...SOFT_DELETE_OPTIONS,
    indexes: [
      // Mirrors the DO's idx_articles_published / _slug / _content_hash.
      { name: "idx_articles_published", fields: [{ name: "published_at", order: "DESC" }] },
      { name: "idx_articles_slug", fields: ["slug"] },
      { name: "idx_articles_content_hash", fields: ["content_hash"] },
      { name: "idx_articles_category", fields: ["category"] },
      { name: "idx_articles_scope", fields: ["scope"] },
    ],
  },
);

export default Article;
