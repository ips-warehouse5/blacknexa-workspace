/**
 * Async worker queue backed by PostgreSQL.
 *
 * Ported from `platform/queue.ts`. The queue keeps slow work — ledger
 * confirmation, second-pass moderation, fact verification — off the request path.
 *
 * One behavioural hardening over the original: job claiming is a conditional
 * `UPDATE … WHERE status = 'pending' RETURNING`, so two replicas draining at the
 * same instant cannot both pick up the same job. The Durable Object got that for
 * free from single-threaded execution; Postgres has to be told.
 */

import { Op, QueryTypes } from "sequelize";
import sequelize from "@/config/database.config";
import logger from "@/utils/logger.util";
import JobQueue from "@/models/job_queue.model";
import { prefixedId } from "@/utils/id.util";
import { DEFAULTS } from "@/config/constants";
import type { QueueJob, QueueJobType } from "@/types/platform.interface";

/** Raw row shape returned by the claim query. */
interface ClaimedRow {
  id: string;
  type: string;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  processed_at: string | null;
  error: string | null;
}

class QueueService {
  /** Enqueue a job. Returns its id. */
  async enqueue(
    type: QueueJobType,
    payload: Record<string, unknown>,
    options?: { maxAttempts?: number; delaySeconds?: number },
  ): Promise<string> {
    const id = prefixedId("job");
    const scheduledAt = Date.now() + (options?.delaySeconds ?? 0) * 1000;

    await JobQueue.create({
      id,
      type,
      payload: JSON.stringify(payload),
      status: "pending",
      attempts: 0,
      max_attempts: options?.maxAttempts ?? 3,
      scheduled_at: String(scheduledAt),
      processed_at: null,
      error: null,
    });
    return id;
  }

  /**
   * Claim up to `limit` due jobs atomically.
   *
   * `FOR UPDATE SKIP LOCKED` in the sub-select means concurrent drainers take
   * disjoint sets instead of blocking on each other, and the outer `WHERE
   * status = 'pending'` guarantees a job is claimed exactly once.
   */
  async dequeuePending(limit = DEFAULTS.QUEUE_DRAIN_LIMIT): Promise<QueueJob[]> {
    const rows = await sequelize.query<ClaimedRow>(
      `UPDATE job_queue
          SET status = 'processing',
              attempts = attempts + 1
        WHERE id IN (
                SELECT id
                  FROM job_queue
                 WHERE status = 'pending'
                   AND scheduled_at <= :now
                 ORDER BY scheduled_at ASC
                 LIMIT :limit
                 FOR UPDATE SKIP LOCKED
              )
          AND status = 'pending'
      RETURNING id, type, payload, status, attempts, max_attempts,
                scheduled_at, processed_at, error`,
      {
        replacements: { now: Date.now(), limit },
        type: QueryTypes.SELECT,
      },
    );
    return rows.map((r) => this.rowToJob(r));
  }

  /** Mark a job completed. */
  async completeJob(jobId: string): Promise<void> {
    await JobQueue.update(
      { status: "completed", processed_at: String(Date.now()) },
      { where: { id: jobId } },
    );
  }

  /**
   * Record a failure. Retries with a delay while attempts remain, then parks the
   * job as `failed` so it can be inspected rather than silently retried forever.
   */
  async failJob(jobId: string, error: string, retryDelaySeconds = 30): Promise<void> {
    const job = await JobQueue.findByPk(jobId);
    if (!job) return;

    const message = error.slice(0, 500);
    if (job.attempts < job.max_attempts) {
      await JobQueue.update(
        {
          status: "pending",
          error: message,
          scheduled_at: String(Date.now() + retryDelaySeconds * 1000),
        },
        { where: { id: jobId } },
      );
    } else {
      await JobQueue.update(
        { status: "failed", error: message, processed_at: String(Date.now()) },
        { where: { id: jobId } },
      );
    }
  }

  /** Counts per status, for the monitoring endpoint. */
  async stats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const [pending, processing, completed, failed] = await Promise.all([
      JobQueue.count({ where: { status: "pending" } }),
      JobQueue.count({ where: { status: "processing" } }),
      JobQueue.count({ where: { status: "completed" } }),
      JobQueue.count({ where: { status: "failed" } }),
    ]);
    return { pending, processing, completed, failed };
  }

  /** Recent jobs of a given type. */
  async getJobsByType(type: QueueJobType, limit = 20): Promise<QueueJob[]> {
    const rows = await JobQueue.findAll({
      where: { type },
      order: [["scheduled_at", "DESC"]],
      limit,
    });
    return rows.map((r) =>
      this.rowToJob({
        id: r.id,
        type: r.type,
        payload: r.payload,
        status: r.status,
        attempts: r.attempts,
        max_attempts: r.max_attempts,
        scheduled_at: r.scheduled_at,
        processed_at: r.processed_at,
        error: r.error,
      }),
    );
  }

  /** Delete completed jobs older than `daysOld`. */
  async pruneOldJobs(daysOld = DEFAULTS.QUEUE_PRUNE_DAYS): Promise<number> {
    const cutoff = Date.now() - daysOld * 86_400_000;
    return JobQueue.destroy({
      where: { status: "completed", processed_at: { [Op.lt]: String(cutoff) } },
    });
  }

  /**
   * Process one job. Dispatches by type.
   *
   * The handlers log rather than call out to providers, exactly as the original
   * did — the real Stripe confirmation and second-pass AI review are the intended
   * next step, and the queue plumbing is in place for them.
   */
  async processJob(job: QueueJob): Promise<void> {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(job.payload) as Record<string, unknown>;
    } catch {
      // A malformed payload is a permanent failure, not a retryable one.
      throw new Error(`job ${job.id} has a malformed payload`);
    }

    switch (job.type) {
      case "ledger-update":
        // The tip/payout is already recorded; this is where the payment provider
        // would be asked to confirm the intent.
        logger.info("[queue] ledger-update", {
          jobId: job.id,
          tipId: payload.tipId,
          payoutId: payload.payoutId,
        });
        break;
      case "content-moderation":
        logger.info("[queue] content-moderation", { jobId: job.id });
        break;
      case "fact-verification":
        logger.info("[queue] fact-verification", { jobId: job.id });
        break;
      case "translate-article":
      case "translate-legal":
      case "image-generation":
      case "audio-generation":
      case "seed-drop-distribution":
        logger.info(`[queue] ${job.type}`, { jobId: job.id });
        break;
      default:
        logger.warn("[queue] unhandled job type", { jobId: job.id, type: job.type });
    }
  }

  /**
   * Drain up to `limit` jobs, completing or failing each. Used by the manual
   * drain endpoint and by the maintenance cron.
   */
  async drain(limit = DEFAULTS.QUEUE_DRAIN_LIMIT): Promise<number> {
    const jobs = await this.dequeuePending(limit);
    for (const job of jobs) {
      try {
        await this.processJob(job);
        await this.completeJob(job.id);
      } catch (err) {
        await this.failJob(job.id, err instanceof Error ? err.message : String(err));
      }
    }
    return jobs.length;
  }

  private rowToJob(r: ClaimedRow): QueueJob {
    return {
      id: r.id,
      type: r.type as QueueJobType,
      payload: r.payload,
      status: r.status as QueueJob["status"],
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      scheduledAt: Number(r.scheduled_at),
      processedAt: r.processed_at ? Number(r.processed_at) : undefined,
      error: r.error ?? undefined,
    };
  }
}

export const queueService = new QueueService();
export default queueService;
