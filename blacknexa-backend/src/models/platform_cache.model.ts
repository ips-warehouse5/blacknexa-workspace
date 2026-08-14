/**
 * `platform_cache` — TTL cache, and `idempotency_replay` — request replay store.
 *
 * The Durable Object used its in-process SQLite as a hot cache because it had no
 * Redis. Kept as a database table here for the same reason the original did: it
 * makes the deployment dependency-free. Swapping in Redis later means replacing
 * one service, not touching any caller.
 *
 * Neither table is `paranoid` — both have prune paths whose entire purpose is to
 * reclaim rows.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { NO_TIMESTAMP_OPTIONS, BASE_OPTIONS } from "@/models/model_options";

export class PlatformCache extends Model<
  InferAttributes<PlatformCache>,
  InferCreationAttributes<PlatformCache>
> {
  declare key: string;
  declare value: string;
  /** Epoch millis. Compared numerically, exactly as the DO did. */
  declare expires_at: string;
  declare created_at_ms: string;
}

// BIGINT is returned as a string by node-postgres to avoid precision loss;
// the cache service converts on read/write.
PlatformCache.init(
  {
    key: {
      type: DataTypes.STRING(512),
      primaryKey: true,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    created_at_ms: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "PlatformCache",
    tableName: "platform_cache",
    ...NO_TIMESTAMP_OPTIONS,
    indexes: [{ name: "idx_cache_expires", fields: ["expires_at"] }],
  },
);

export class IdempotencyReplay extends Model<
  InferAttributes<IdempotencyReplay>,
  InferCreationAttributes<IdempotencyReplay>
> {
  declare key: string;
  /** The full response body that was returned the first time this key was seen. */
  declare response_json: Record<string, unknown>;
  declare created_at: string;
}

IdempotencyReplay.init(
  {
    key: {
      type: DataTypes.STRING(512),
      primaryKey: true,
      allowNull: false,
    },
    response_json: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "IdempotencyReplay",
    tableName: "idempotency_replay",
    ...BASE_OPTIONS,
  },
);

export default PlatformCache;
