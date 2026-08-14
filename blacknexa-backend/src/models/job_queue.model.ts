/**
 * `job_queue` — the async worker queue.
 *
 * Replaces BullMQ/Celery with a plain table, as the original did: no Redis, no
 * broker. The maintenance cron drains it in bounded batches. Failed jobs retry
 * up to `max_attempts` with a delay, then park as `failed` for inspection.
 *
 * Claiming uses a conditional UPDATE (`… WHERE status = 'pending' RETURNING`),
 * so two replicas draining concurrently cannot pick up the same job. The Durable
 * Object got that for free from single-threaded execution; Postgres needs it
 * stated explicitly.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { NO_TIMESTAMP_OPTIONS } from "@/models/model_options";
import type { QueueJobType, QueueJob } from "@/types/platform.interface";

export class JobQueue extends Model<
  InferAttributes<JobQueue>,
  InferCreationAttributes<JobQueue>
> {
  declare id: string;
  declare type: QueueJobType;
  /** JSON-encoded payload. Kept as TEXT because the contract exposes it verbatim. */
  declare payload: string;
  declare status: QueueJob["status"];
  declare attempts: number;
  declare max_attempts: number;
  /** Epoch millis, as BIGINT. Returned as a string by the pg driver. */
  declare scheduled_at: string;
  declare processed_at: string | null;
  declare error: string | null;
}

JobQueue.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    payload: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "{}",
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    scheduled_at: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    processed_at: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "JobQueue",
    tableName: "job_queue",
    ...NO_TIMESTAMP_OPTIONS,
    indexes: [
      { name: "idx_queue_status", fields: ["status", "scheduled_at"] },
      { name: "idx_queue_type", fields: ["type"] },
    ],
  },
);

export default JobQueue;
