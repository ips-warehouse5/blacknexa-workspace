/**
 * `article_images` and `article_audio` — AI-generated media bytes.
 *
 * The Durable Object stored these as base64 TEXT because DO-SQLite has no blob
 * ergonomics. PostgreSQL `BYTEA` is used instead: the same bytes, roughly a third
 * smaller on disk, and no encode/decode round-trip when serving. The endpoints
 * (`/api/v1/news/image/:id`, `/audio/:id`) return identical bytes and headers.
 *
 * Media is kept in the database rather than object storage so the self-served
 * endpoint contract is preserved byte-for-byte. `s3.service.ts` is available for
 * private/sensitive files, which these are not — they are public article art.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";

export class ArticleImage extends Model<
  InferAttributes<ArticleImage>,
  InferCreationAttributes<ArticleImage>
> {
  declare article_id: string;
  declare media_type: string;
  declare bytes: Buffer;
}

ArticleImage.init(
  {
    article_id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    media_type: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "image/png",
    },
    bytes: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ArticleImage",
    tableName: "article_images",
    ...BASE_OPTIONS,
  },
);

export class ArticleAudio extends Model<
  InferAttributes<ArticleAudio>,
  InferCreationAttributes<ArticleAudio>
> {
  declare article_id: string;
  declare media_type: string;
  declare bytes: Buffer;
}

ArticleAudio.init(
  {
    article_id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    media_type: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "audio/mpeg",
    },
    bytes: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "ArticleAudio",
    tableName: "article_audio",
    ...BASE_OPTIONS,
  },
);

export default ArticleImage;
