/**
 * The moderation worker — claims runs from `moderation_runs` and keeps the
 * queue honest.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.2 and §5.4, D5 and D13. Started from
 * `server.ts` on every replica (unless `MODERATION_WORKER_ENABLED=false`) and
 * independent of `ENABLE_CRON`: moderation is on the request path of every
 * filing, so it cannot wait for the single replica that runs cron, nor for a
 * one-minute tick.
 *
 * ── The loop ──────────────────────────────────────────────────────────────
 * Every `MODERATION_WORKER_POLL_MS` (1.5 s), on every poke from
 * `moderation_signal.ts` (domain services ring it after a transaction that
 * queued a run commits), and whenever a run finishes, the worker claims up to
 * `concurrency − inFlight` runs:
 *
 *   UPDATE moderation_runs SET status='running', attempts=attempts+1, locked_until=…
 *    WHERE id IN (SELECT id … WHERE (queued AND due) OR (running AND lease expired)
 *                 ORDER BY priority DESC, available_at ASC LIMIT n FOR UPDATE SKIP LOCKED)
 *
 * `SKIP LOCKED` makes any number of replicas safe; the lease makes a crashed
 * replica's work re-claimable (the attempt still counts); `attempts` after the
 * claim is the fencing token the pipeline writes with.
 *
 * ── What happens to a run that does not finish ────────────────────────────
 *   • `RetryLater` (a retryable AI failure with attempts left) → back to the
 *     queue after `min(15 s × 4^(n−1), 10 min) ± 20 %`; an attempt is spent.
 *   • The breaker is open → parked until it reopens, the attempt handed back.
 *   • Anything else (a bug, a database error, a lock timeout) → the catch-all
 *     records `system:<ErrorName>` and retries with the same backoff. Nothing
 *     ever throws out of the worker, and an exhausted run's next claim takes the
 *     terminal path, so a poison run ends held for a human — never a crash loop.
 *   • Shutdown → claiming stops, in-flight engine calls are aborted, their rows
 *     are released (fenced) without spending an attempt.
 *
 * ── The reconciler (every 5 minutes, one replica at a time) ───────────────
 * `pg_try_advisory_xact_lock` elects one replica per cycle; the others skip.
 * Each step runs in its own savepoint and locks targets with `SKIP LOCKED`, so
 * one busy row or one failing step never blocks the rest:
 *
 *   1. approve — never send to AI — pending private reports, their pending
 *      comments and evidence (D3);
 *   2. queue a run for pending reports and comments that have no live run
 *      ("enqueue missed", §5.4);
 *   3. queue an `evidence` run for approved reports whose sealed evidence is
 *      still pending with no live run and no media review open — the enqueue
 *      merge can fold an evidence commit into another queued trigger — or
 *      whose open media case an outage left behind (hold reasons only
 *      `ai_unavailable` / `system_error`, no user flags), once the engine is
 *      healthy (review R13: step 5 cannot re-run those, because an evidence
 *      hold leaves the report approved, not held);
 *   4. open a case for held reports and comments that have none.
 *      Comment steps (1, 2 and 4) skip comments on a *deactivated* report
 *      (review Q8): deactivation supersedes their cases and withdraws their
 *      runs, and re-opening them would leave cases nobody can decide (every
 *      decision answers 409 until Reactivate). The comments keep their
 *      pending/held state, so once the report is reactivated these same steps
 *      queue their runs and reopen their cases again;
 *   5. when the engine reports `moderationReady`, re-run (`manual`) the open
 *      cases an AI outage left behind on a *held* target — hold reasons only
 *      `ai_unavailable` / `system_error`, no user flags (D5: an outage must not
 *      leave a permanent human backlog). Evidence outages on approved reports
 *      are step 3's.
 */

import { QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report } from "@/models/report.model";
import { ReportComment } from "@/models/report_social.model";
import { aiEngineClient } from "@/services/ai_engine.client";
import { auditService } from "@/services/audit.service";
import { moderationCaseService } from "@/services/moderation_case.service";
import { cancelQueuedRunsForTarget, enqueueRun, maxAttemptsFor } from "@/services/moderation_enqueue";
import { onPoke } from "@/services/moderation_signal";
import type { PendingPush } from "@/services/notification.service";
import { CircuitBreaker, breakerDelayMs, retryDelayMs } from "@/services/moderation_breaker";
import { SYSTEM_ERROR_PREFIX, reconcileTriggerFor } from "@/services/moderation_policy";
import {
  FencingLost,
  RetryLater,
  ShutdownAbort,
  approvePrivateContent,
  dispatchAfterCommit,
  moderationPipeline,
  requestRerun,
  setLockTimeout,
  type ClaimedRun,
} from "@/services/moderation_pipeline.service";
import {
  HOLD_REASONS,
  RUN_PRIORITY,
  type HoldReason,
  type ModerationTargetType,
  type SafetyRisk,
} from "@/types/moderation.interface";

const RECONCILE_INTERVAL_MS = 5 * 60_000;
/** First reconcile shortly after boot, once the replica has settled. */
const RECONCILE_FIRST_DELAY_MS = 30_000;
/** Rows per reconciler step per cycle — keeps the elected transaction short. */
const RECONCILE_BATCH = 50;
/**
 * A case is re-run after an outage only once its latest run has been finished
 * this long, and a report is given an evidence run only when nothing finished
 * on it this recently — so a flapping engine costs a few calls per quarter hour
 * per item, not a loop.
 */
const RECONCILE_IDLE_MS = 10 * 60_000;
/** How long `stop()` waits for in-flight work to notice the abort. */
const SHUTDOWN_GRACE_MS = 5_000;
/** `hashtext()` of this names the reconciler's advisory lock. */
const RECONCILER_LOCK_KEY = "blacknexa.moderation.reconciler";
/** A failing claim (database down) is logged at most this often, not every poll. */
const CLAIM_ERROR_LOG_INTERVAL_MS = 30_000;

/** Hold reasons that come from the AI — the case's *AI Flags* source. */
const AI_HOLD_REASONS: readonly HoldReason[] = [
  "ai_violation",
  "ai_low_confidence",
  "ai_blocked",
  "injection_suspected",
  "safety_risk",
];

interface InFlight {
  run: ClaimedRun;
  controller: AbortController;
  promise: Promise<void>;
}

export interface ReconcileResult {
  /** Another replica held the reconciler lock this cycle. */
  skipped: boolean;
  engineHealthy: boolean;
  privateApproved: number;
  reportsEnqueued: number;
  commentsEnqueued: number;
  evidenceEnqueued: number;
  casesOpened: number;
  rerun: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/** `system:<ErrorName>[:<pg code>]` — what a run's `error` records for a crash. */
function systemErrorCode(err: unknown): string {
  if (!(err instanceof Error)) return `${SYSTEM_ERROR_PREFIX}unknown`;
  const parent = (err as Error & { parent?: { code?: unknown } }).parent;
  const code = parent && typeof parent.code === "string" ? `:${parent.code}` : "";
  return `${SYSTEM_ERROR_PREFIX}${err.name}${code}`.slice(0, 512);
}

/** An error's message for the log, bounded. Database messages carry no member text. */
function logMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

function validHoldReasons(raw: unknown): HoldReason[] {
  if (!Array.isArray(raw)) return [];
  const allowed = HOLD_REASONS as readonly string[];
  return raw.filter((value): value is HoldReason => typeof value === "string" && allowed.includes(value));
}

export class ModerationWorker {
  private running = false;
  private stopping = false;
  private ticking = false;
  private tickAgain = false;
  private reconciling = false;
  private reconcilePromise: Promise<ReconcileResult | null> | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private reconcileFirst: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastClaimErrorLoggedAt = 0;
  private suppressedClaimErrors = 0;
  /** The claim statement in progress, so `stop()` can wait for its rows. */
  private claiming: Promise<unknown> | null = null;
  private readonly inFlight = new Map<string, InFlight>();
  private readonly breaker = new CircuitBreaker();

  /** True between `start()` and `stop()` on a replica where the worker is enabled. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Start polling, listening for pokes and reconciling. No-op when disabled. */
  start(): void {
    if (this.running) return;
    if (!env.moderation.workerEnabled) {
      logger.info("[moderation] worker disabled on this replica (MODERATION_WORKER_ENABLED=false)");
      return;
    }
    this.running = true;
    this.stopping = false;

    this.pollTimer = setInterval(() => void this.tick(), env.moderation.workerPollMs);
    this.pollTimer.unref();
    this.unsubscribe = onPoke(() => void this.tick());
    this.reconcileFirst = setTimeout(() => void this.reconcile(), RECONCILE_FIRST_DELAY_MS);
    this.reconcileFirst.unref();
    this.reconcileTimer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref();

    logger.info("[moderation] worker started", {
      concurrency: env.moderation.workerConcurrency,
      pollMs: env.moderation.workerPollMs,
      leaseSeconds: env.moderation.leaseSeconds,
      maxAttempts: env.moderation.maxAttempts,
    });
    if (!env.moderation.enabled || !aiEngineClient.isConfigured) {
      // D5: not a publish-everything switch — the fallbacks still decide.
      logger.warn(
        `[moderation] ${
          env.moderation.enabled
            ? "AI engine not configured (AI_ENGINE_URL / AI_ENGINE_TOKEN)"
            : "MODERATION_ENABLED=false"
        } — the AI stage is skipped. Public reports follow ` +
          `MODERATION_REPORT_AI_FALLBACK=${env.moderation.reportAiFallback}` +
          `${env.moderation.reportAiFallback === "hold" ? " (held for a human)" : ""}; keyword-clean ` +
          `comments follow MODERATION_COMMENT_AI_FALLBACK=${env.moderation.commentAiFallback}.`,
      );
    }

    void this.tick();
  }

  /**
   * Stop claiming, abort in-flight engine calls and release their rows without
   * spending an attempt (§5.2 "Shutdown", §5.4 "Deploy mid-run"). Resolves once
   * in-flight work has settled or the grace period is over; the database pool
   * may be closed after that.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.reconcileFirst) clearTimeout(this.reconcileFirst);
    this.pollTimer = null;
    this.reconcileTimer = null;
    this.reconcileFirst = null;
    this.unsubscribe?.();
    this.unsubscribe = null;

    // A claim already on the wire releases its own rows once it returns (see
    // `tick`); wait for that before the pool can close under it.
    if (this.claiming) await Promise.race([this.claiming.catch(() => undefined), sleep(SHUTDOWN_GRACE_MS)]);

    const flights = [...this.inFlight.values()];
    // Abort first, so no in-flight run passes its fencing write after the
    // release; the release itself is fenced as well.
    for (const flight of flights) flight.controller.abort();
    const released = await Promise.all(
      flights.map((flight) =>
        moderationPipeline.release(flight.run).catch((err: unknown) => {
          logger.warn("[moderation] could not release run on shutdown — its lease will expire", {
            runId: flight.run.id,
            error: systemErrorCode(err),
          });
          return false;
        }),
      ),
    );

    const settled: Promise<unknown>[] = flights.map((flight) => flight.promise);
    if (this.reconcilePromise) settled.push(this.reconcilePromise);
    await Promise.race([Promise.allSettled(settled), sleep(SHUTDOWN_GRACE_MS)]);

    logger.info("[moderation] worker stopped", {
      inFlight: flights.length,
      released: released.filter(Boolean).length,
    });
  }

  // ── The loop ──────────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (!this.running || this.stopping) return;
    if (this.ticking) {
      // A poke during a claim: claim again once this one is done.
      this.tickAgain = true;
      return;
    }
    this.ticking = true;
    try {
      const capacity = env.moderation.workerConcurrency - this.inFlight.size;
      if (capacity <= 0) return;
      const claim = this.claim(capacity).then(async (runs) => {
        if (!this.stopping) return runs;
        // Shutdown began while the claim was on the wire: hand the rows
        // straight back, without spending their attempts.
        await Promise.all(runs.map((run) => moderationPipeline.release(run).catch(() => false)));
        return [];
      });
      this.claiming = claim;
      const runs = await claim;
      for (const run of runs) this.launch(run);
    } catch (err) {
      // The database is unreachable, most likely. The next tick tries again;
      // the log says so at most every thirty seconds, with a count.
      const now = Date.now();
      if (now - this.lastClaimErrorLoggedAt >= CLAIM_ERROR_LOG_INTERVAL_MS) {
        logger.warn("[moderation] claim failed", {
          error: systemErrorCode(err),
          message: logMessage(err),
          suppressedSinceLast: this.suppressedClaimErrors,
        });
        this.lastClaimErrorLoggedAt = now;
        this.suppressedClaimErrors = 0;
      } else {
        this.suppressedClaimErrors += 1;
      }
    } finally {
      this.ticking = false;
      this.claiming = null;
      if (this.tickAgain && this.running && !this.stopping) {
        this.tickAgain = false;
        setImmediate(() => void this.tick());
      }
    }
  }

  /** The §5.2 claim, verbatim. */
  private async claim(limit: number): Promise<ClaimedRun[]> {
    const now = Date.now();
    return sequelize.query<ClaimedRun>(
      `UPDATE moderation_runs
          SET status = 'running', attempts = attempts + 1, locked_until = :leaseUntil,
              started_at = :nowIso, updated_on = now()
        WHERE id IN (SELECT id FROM moderation_runs
                      WHERE (status = 'queued'  AND available_at <= :now)
                         OR (status = 'running' AND locked_until < :now)
                      ORDER BY priority DESC, available_at ASC
                      LIMIT :limit
                      FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      {
        replacements: {
          now,
          leaseUntil: now + env.moderation.leaseSeconds * 1000,
          nowIso: nowIso(),
          limit,
        },
        type: QueryTypes.SELECT,
      },
    );
  }

  private launch(run: ClaimedRun): void {
    const controller = new AbortController();
    const flight: InFlight = { run, controller, promise: Promise.resolve() };
    this.inFlight.set(run.id, flight);
    flight.promise = this.execute(run, controller).finally(() => {
      this.inFlight.delete(run.id);
      if (this.running && !this.stopping) void this.tick();
    });
  }

  /** Process one run and handle every way it can fail. Never throws. */
  private async execute(run: ClaimedRun, controller: AbortController): Promise<void> {
    const startedAt = Date.now();
    try {
      const summary = await moderationPipeline.process(run, {
        signal: controller.signal,
        breaker: this.breaker,
      });
      logger.info("[moderation] run finished", {
        runId: run.id,
        targetType: run.target_type,
        trigger: run.trigger,
        attempt: run.attempts,
        outcome: summary.outcome,
        mode: summary.mode,
        reason: summary.reason,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      if (err instanceof FencingLost) {
        logger.info("[moderation] run result dropped — lease lost to another worker", {
          runId: run.id,
          attempt: run.attempts,
        });
        return;
      }
      if (err instanceof ShutdownAbort || controller.signal.aborted) {
        // `stop()` releases the row.
        return;
      }
      if (err instanceof RetryLater) {
        const now = Date.now();
        const delayMs = err.consumeAttempt
          ? retryDelayMs(run.attempts, run.max_attempts)
          : breakerDelayMs(err.notBefore ?? now, now);
        const requeued = await moderationPipeline
          .reschedule(run, { errorCode: err.errorCode, delayMs, consumeAttempt: err.consumeAttempt })
          .catch((rescheduleErr: unknown) => {
            logger.warn("[moderation] could not reschedule run — its lease will expire", {
              runId: run.id,
              error: systemErrorCode(rescheduleErr),
            });
            return false;
          });
        logger.info("[moderation] run rescheduled", {
          runId: run.id,
          attempt: run.attempts,
          maxAttempts: run.max_attempts,
          error: err.errorCode,
          delayMs,
          attemptSpent: err.consumeAttempt,
          requeued,
        });
        return;
      }

      // The catch-all (§5.2): record the error type, retry with backoff.
      const errorCode = systemErrorCode(err);
      logger.error("[moderation] run failed — retrying", {
        runId: run.id,
        targetType: run.target_type,
        attempt: run.attempts,
        maxAttempts: run.max_attempts,
        error: errorCode,
        message: logMessage(err),
      });
      await moderationPipeline
        .reschedule(run, {
          errorCode,
          delayMs: retryDelayMs(run.attempts, run.max_attempts),
          consumeAttempt: true,
        })
        .catch((rescheduleErr: unknown) => {
          logger.warn("[moderation] could not reschedule run — its lease will expire", {
            runId: run.id,
            error: systemErrorCode(rescheduleErr),
          });
        });
    }
  }

  // ── The reconciler ────────────────────────────────────────────────────────

  /** One reconciler cycle, unless one is already running here. Never throws. */
  async reconcile(): Promise<ReconcileResult | null> {
    if (this.reconciling || this.stopping) return null;
    this.reconciling = true;
    const promise = this.reconcileOnce()
      .catch((err: unknown) => {
        logger.warn("[moderation] reconcile failed", { error: systemErrorCode(err), message: logMessage(err) });
        return null;
      })
      .finally(() => {
        this.reconciling = false;
        this.reconcilePromise = null;
      });
    this.reconcilePromise = promise;
    return promise;
  }

  private async reconcileOnce(): Promise<ReconcileResult> {
    // Asked before the transaction: an HTTP call must never hold a lock.
    const engineHealthy =
      env.moderation.enabled && aiEngineClient.isConfigured && (await aiEngineClient.moderationReady());

    const result: ReconcileResult = {
      skipped: false,
      engineHealthy,
      privateApproved: 0,
      reportsEnqueued: 0,
      commentsEnqueued: 0,
      evidenceEnqueued: 0,
      casesOpened: 0,
      rerun: 0,
    };
    const pendingPushes: PendingPush[] = [];

    await sequelize.transaction(async (tx) => {
      await setLockTimeout(tx);
      const lock = await sequelize.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtext(:key)) AS locked`,
        { replacements: { key: RECONCILER_LOCK_KEY }, type: QueryTypes.SELECT, transaction: tx },
      );
      if (!lock[0]?.locked) {
        result.skipped = true;
        return;
      }

      // Each step in its own savepoint, with its own push list: a failed step
      // rolls back alone and owes no pushes.
      const step = async (
        name: string,
        work: (sp: Transaction, pushes: PendingPush[]) => Promise<number>,
      ): Promise<number> => {
        const pushes: PendingPush[] = [];
        try {
          const count = await sequelize.transaction({ transaction: tx }, (sp) => work(sp, pushes));
          pendingPushes.push(...pushes);
          return count;
        } catch (err) {
          logger.warn("[moderation] reconcile step failed", {
            step: name,
            error: systemErrorCode(err),
            message: logMessage(err),
          });
          return 0;
        }
      };

      result.privateApproved = await step("private", (sp, pushes) => this.approvePendingPrivate(sp, pushes));
      result.reportsEnqueued = await step("reports", (sp) => this.enqueueMissingReportRuns(sp));
      result.commentsEnqueued = await step("comments", (sp) => this.enqueueMissingCommentRuns(sp));
      result.evidenceEnqueued = await step("evidence", (sp) => this.enqueueMissingEvidenceRuns(sp, engineHealthy));
      result.casesOpened = await step("cases", (sp) => this.openMissingCases(sp));
      if (engineHealthy) result.rerun = await step("rerun", (sp) => this.rerunOutageHolds(sp));
    });

    if (!result.skipped) {
      dispatchAfterCommit(pendingPushes);
      const queued = result.reportsEnqueued + result.commentsEnqueued + result.evidenceEnqueued + result.rerun;
      if (queued > 0) void this.tick();
      const changed = queued + result.privateApproved + result.casesOpened;
      if (changed > 0) logger.info("[moderation] reconciled", { ...result });
      else logger.debug("[moderation] reconciled — nothing to do", { engineHealthy });
    }
    return result;
  }

  /** Step 1 — D3: private content pending for any reason is approved, never assessed. */
  private async approvePendingPrivate(sp: Transaction, pushes: PendingPush[]): Promise<number> {
    let approved = 0;

    const reports = await sequelize.query<{ id: string }>(
      `SELECT id FROM reports
        WHERE moderation_state = 'pending' AND visibility = 'private' AND deleted_at IS NULL
        ORDER BY filed_at ASC
        LIMIT :limit
        FOR UPDATE SKIP LOCKED`,
      { replacements: { limit: RECONCILE_BATCH }, type: QueryTypes.SELECT, transaction: sp },
    );
    for (const { id } of reports) {
      const report = await Report.findByPk(id, { transaction: sp });
      if (!report) continue;
      await cancelQueuedRunsForTarget(sp, "report", report.id);
      if (await approvePrivateContent(sp, report, null, pushes)) {
        approved += 1;
        await this.auditPrivate(sp, "report", report.id, report.id);
      }
    }

    const comments = await sequelize.query<{ id: string; report_id: string }>(
      `SELECT c.id, c.report_id
         FROM report_comments c
         JOIN reports r ON r.id = c.report_id
        WHERE c.moderation_state = 'pending' AND c.status = 'visible'
          AND r.visibility = 'private' AND r.deleted_at IS NULL
          AND r.moderation_state <> 'deactivated'
        ORDER BY c.created_at ASC
        LIMIT :limit
        FOR UPDATE OF c SKIP LOCKED`,
      { replacements: { limit: RECONCILE_BATCH }, type: QueryTypes.SELECT, transaction: sp },
    );
    for (const row of comments) {
      const comment = await ReportComment.findByPk(row.id, { transaction: sp });
      const report = await Report.findByPk(row.report_id, { transaction: sp });
      if (!comment || !report) continue;
      await cancelQueuedRunsForTarget(sp, "comment", comment.id);
      if (await approvePrivateContent(sp, report, comment, pushes)) {
        approved += 1;
        await this.auditPrivate(sp, "comment", comment.id, report.id);
      }
    }

    // Files on an already-approved private report (a late upload the insert
    // path wrote as pending). Scope `full`, like every private approval
    // (`approvePrivateContent`): an approval names what it covers (review R5),
    // and nobody but the owner and staff can see these.
    const files = await sequelize.query<{ id: string }>(
      `UPDATE report_evidence e
          SET moderation_state = 'approved', approved_scope = 'full', updated_on = now()
         FROM reports r
        WHERE r.id = e.report_id AND r.visibility = 'private' AND r.deleted_at IS NULL
          AND r.moderation_state = 'approved' AND e.moderation_state = 'pending'
        RETURNING e.id`,
      { type: QueryTypes.SELECT, transaction: sp },
    );
    return approved + files.length;
  }

  private async auditPrivate(
    sp: Transaction,
    targetType: ModerationTargetType,
    targetId: string,
    reportId: string,
  ): Promise<void> {
    await auditService.record(sp, {
      actorKind: "system",
      action: "moderation.auto_approve",
      targetType,
      targetId,
      reportId,
      reasonCode: "private_target",
      metadata: { reconciler: true, reason: "private_target", aiSent: false },
    });
  }

  /** Step 2a — pending public/trusted reports with no live run. */
  private async enqueueMissingReportRuns(sp: Transaction): Promise<number> {
    const rows = await sequelize.query<{
      id: string;
      content_version: number;
      urgent: boolean;
      published_at: string | null;
      last_trigger: string | null;
      last_resolution: string | null;
    }>(
      `SELECT r.id, r.content_version, r.urgent, r.published_at,
              (SELECT m."trigger" FROM moderation_runs m
                WHERE m.target_type = 'report' AND m.target_id = r.id
                ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_trigger,
              (SELECT c.resolution FROM moderation_cases c
                WHERE c.target_type = 'report' AND c.target_id = r.id AND c.state = 'resolved'
                ORDER BY c.resolved_at DESC NULLS LAST LIMIT 1) AS last_resolution
         FROM reports r
        WHERE r.moderation_state = 'pending' AND r.deleted_at IS NULL AND r.visibility <> 'private'
          AND NOT EXISTS (
                SELECT 1 FROM moderation_runs m
                 WHERE m.target_type = 'report' AND m.target_id = r.id
                   AND (m.status = 'queued'
                        OR (m.status = 'running' AND m.content_version >= r.content_version)))
        ORDER BY r.filed_at ASC
        LIMIT :limit
        FOR UPDATE OF r SKIP LOCKED`,
      { replacements: { limit: RECONCILE_BATCH }, type: QueryTypes.SELECT, transaction: sp },
    );
    for (const row of rows) {
      const trigger = reconcileTriggerFor({
        lastTrigger: row.last_trigger,
        lastResolution: row.last_resolution,
        published: Boolean(row.published_at),
      });
      const priority = row.urgent
        ? RUN_PRIORITY.urgent
        : trigger === "edited" && row.published_at
          ? RUN_PRIORITY.editedApproved
          : RUN_PRIORITY.normal;
      await enqueueRun(sp, {
        targetType: "report",
        targetId: row.id,
        reportId: row.id,
        contentVersion: row.content_version,
        trigger,
        priority,
        maxAttempts: maxAttemptsFor(Boolean(row.urgent)),
      });
    }
    return rows.length;
  }

  /** Step 2b — pending visible comments on public/trusted reports with no live run. */
  private async enqueueMissingCommentRuns(sp: Transaction): Promise<number> {
    const rows = await sequelize.query<{ id: string; report_id: string }>(
      `SELECT c.id, c.report_id
         FROM report_comments c
         JOIN reports r ON r.id = c.report_id
        WHERE c.moderation_state = 'pending' AND c.status = 'visible'
          AND r.deleted_at IS NULL AND r.visibility <> 'private'
          AND r.moderation_state <> 'deactivated'
          AND NOT EXISTS (
                SELECT 1 FROM moderation_runs m
                 WHERE m.target_type = 'comment' AND m.target_id = c.id
                   AND m.status IN ('queued', 'running'))
        ORDER BY c.created_at ASC
        LIMIT :limit
        FOR UPDATE OF c SKIP LOCKED`,
      { replacements: { limit: RECONCILE_BATCH }, type: QueryTypes.SELECT, transaction: sp },
    );
    for (const row of rows) {
      await enqueueRun(sp, {
        targetType: "comment",
        targetId: row.id,
        reportId: row.report_id,
        commentId: row.id,
        // Comments are not versioned; the guard ignores the value for them.
        contentVersion: 1,
        trigger: "comment",
        priority: RUN_PRIORITY.normal,
      });
    }
    return rows.length;
  }

  /**
   * Step 3 — approved reports with sealed evidence still pending, no live run,
   * nothing finished on them recently, and no media review already waiting for
   * a human.
   *
   * Review R13: an open media case an outage left behind — outage-only hold
   * reasons (`isOutageOnlyCase`, restated in SQL as in step 5), no user flags,
   * and a latest run that did not fail permanently (`ai_status = 'error'`, a
   * moderator's *Re-run AI* job) — is not waiting for a human but for the
   * engine: when the engine is healthy the report gets an evidence run again.
   * Step 5 cannot do this, because an evidence hold leaves the report
   * `approved` and `requestRerun` re-runs only held targets. The run's result
   * clears the case (the evidence-mode apply) or merges a new hold into it.
   * The idle window above keeps a flapping engine to one try per report per
   * `RECONCILE_IDLE_MS`.
   */
  private async enqueueMissingEvidenceRuns(sp: Transaction, engineHealthy: boolean): Promise<number> {
    const rows = await sequelize.query<{ id: string; content_version: number; urgent: boolean }>(
      `SELECT r.id, r.content_version, r.urgent
         FROM reports r
        WHERE r.moderation_state = 'approved' AND r.deleted_at IS NULL AND r.visibility <> 'private'
          AND EXISTS (
                SELECT 1 FROM report_evidence e
                 WHERE e.report_id = r.id AND e.moderation_state = 'pending' AND e.upload_state = 'sealed')
          AND NOT EXISTS (
                SELECT 1 FROM moderation_runs m
                 WHERE m.target_type = 'report' AND m.target_id = r.id
                   AND (m.status IN ('queued', 'running') OR m.finished_at > :recent))
          AND NOT EXISTS (
                SELECT 1 FROM moderation_cases c
                  LEFT JOIN moderation_runs lr ON lr.id = c.latest_run_id
                 WHERE c.target_type = 'report' AND c.target_id = r.id
                   AND c.state = 'open' AND c.media_review
                   AND NOT (
                         CAST(:engineHealthy AS boolean)
                         AND c.user_flag_count = 0
                         AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.hold_reasons) AS h(v)
                                      WHERE h.v IN ('ai_unavailable', 'system_error'))
                         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.hold_reasons) AS h(v)
                                          WHERE h.v NOT IN ('ai_unavailable', 'system_error', 'media_unassessed'))
                         AND COALESCE(lr.ai_status, '') <> 'error'))
        ORDER BY r.filed_at ASC
        LIMIT :limit
        FOR UPDATE OF r SKIP LOCKED`,
      {
        replacements: {
          limit: RECONCILE_BATCH,
          recent: new Date(Date.now() - RECONCILE_IDLE_MS).toISOString(),
          engineHealthy,
        },
        type: QueryTypes.SELECT,
        transaction: sp,
      },
    );
    for (const row of rows) {
      const urgent = Boolean(row.urgent);
      await enqueueRun(sp, {
        targetType: "report",
        targetId: row.id,
        reportId: row.id,
        contentVersion: row.content_version,
        trigger: "evidence",
        // An urgent report keeps its priority and short budget (D5/D21), as
        // the late-evidence path does (review R2).
        priority: urgent ? RUN_PRIORITY.urgent : RUN_PRIORITY.normal,
        maxAttempts: maxAttemptsFor(urgent),
      });
    }
    return rows.length;
  }

  /** Step 4 — held content must always be in front of a human: open its case. */
  private async openMissingCases(sp: Transaction): Promise<number> {
    let opened = 0;

    const reports = await sequelize.query<{ id: string; urgent: boolean }>(
      `SELECT r.id, r.urgent
         FROM reports r
        WHERE r.moderation_state = 'held' AND r.deleted_at IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM moderation_cases c
                 WHERE c.target_type = 'report' AND c.target_id = r.id AND c.state = 'open')
        ORDER BY r.filed_at ASC
        LIMIT :limit
        FOR UPDATE OF r SKIP LOCKED`,
      { replacements: { limit: RECONCILE_BATCH }, type: QueryTypes.SELECT, transaction: sp },
    );
    for (const row of reports) {
      await this.openCaseFromHistory(sp, "report", row.id, row.id, null, Boolean(row.urgent));
      opened += 1;
    }

    const comments = await sequelize.query<{ id: string; report_id: string }>(
      `SELECT c.id, c.report_id
         FROM report_comments c
         JOIN reports r ON r.id = c.report_id
        WHERE c.moderation_state = 'held' AND c.status = 'visible' AND r.deleted_at IS NULL
          AND r.moderation_state <> 'deactivated'
          AND NOT EXISTS (
                SELECT 1 FROM moderation_cases k
                 WHERE k.target_type = 'comment' AND k.target_id = c.id AND k.state = 'open')
        ORDER BY c.created_at ASC
        LIMIT :limit
        FOR UPDATE OF c SKIP LOCKED`,
      { replacements: { limit: RECONCILE_BATCH }, type: QueryTypes.SELECT, transaction: sp },
    );
    for (const row of comments) {
      await this.openCaseFromHistory(sp, "comment", row.id, row.report_id, row.id, false);
      opened += 1;
    }
    return opened;
  }

  /** Rebuild a case from the target's latest finished run (or `system_error`). */
  private async openCaseFromHistory(
    sp: Transaction,
    targetType: ModerationTargetType,
    targetId: string,
    reportId: string,
    commentId: string | null,
    urgent: boolean,
  ): Promise<void> {
    const runs = await sequelize.query<{ id: string; reasons: unknown; safety_risk: SafetyRisk | null }>(
      `SELECT id, reasons, safety_risk FROM moderation_runs
        WHERE target_type = :targetType AND target_id = :targetId AND status = 'done'
        ORDER BY finished_at DESC NULLS LAST
        LIMIT 1`,
      { replacements: { targetType, targetId }, type: QueryTypes.SELECT, transaction: sp },
    );
    const latest = runs[0] ?? null;
    const reasons = validHoldReasons(latest?.reasons);
    const holdReasons: HoldReason[] = reasons.length > 0 ? reasons : ["system_error"];
    const caseRow = await moderationCaseService.upsertOpenCase(sp, {
      targetType,
      targetId,
      reportId,
      commentId,
      aiFlagged: holdReasons.some((reason) => AI_HOLD_REASONS.includes(reason)),
      keywordFlagged: holdReasons.includes("keyword_match"),
      mediaReview: holdReasons.includes("media_unassessed"),
      holdReasons,
      safetyRisk: latest?.safety_risk ?? null,
      urgent,
      latestRunId: latest?.id ?? null,
    });
    await auditService.record(sp, {
      actorKind: "system",
      action: "moderation.hold",
      targetType,
      targetId,
      reportId,
      caseId: caseRow.id,
      reasonCode: holdReasons[0],
      metadata: { reconciler: true, reason: "case_missing", holdReasons, latestRunId: latest?.id ?? null },
    });
  }

  /**
   * Step 5 — D5's automatic recovery: held → pending + a `manual` run for the
   * open cases an outage left behind. The latest run must have finished a while
   * ago and not with a permanent engine error (a 4xx will not fix itself; a
   * moderator can still press *Re-run AI*).
   *
   * Only cases whose target is still `held` are candidates. Since review R13 an
   * evidence outage is an outage-only case on an `approved` report (step 3
   * re-runs those); `requestRerun` would refuse each as `not_held`, and because
   * this query takes the top `RECONCILE_BATCH` by priority, a backlog of them
   * after a long outage could crowd out every held report behind them.
   */
  private async rerunOutageHolds(sp: Transaction): Promise<number> {
    const candidates = await sequelize.query<{ id: string }>(
      `SELECT c.id
         FROM moderation_cases c
         LEFT JOIN moderation_runs m ON m.id = c.latest_run_id
        WHERE c.state = 'open' AND c.user_flag_count = 0
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.hold_reasons) AS h(v)
                       WHERE h.v IN ('ai_unavailable', 'system_error'))
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.hold_reasons) AS h(v)
                           WHERE h.v NOT IN ('ai_unavailable', 'system_error', 'media_unassessed'))
          AND ((c.target_type = 'report'
                AND EXISTS (SELECT 1 FROM reports tr
                             WHERE tr.id = c.target_id AND tr.moderation_state = 'held'))
               OR (c.target_type = 'comment'
                   AND EXISTS (SELECT 1 FROM report_comments tc
                                WHERE tc.id = c.target_id AND tc.moderation_state = 'held')))
          AND (m.id IS NULL
               OR (m.status IN ('done', 'cancelled')
                   AND COALESCE(m.ai_status, '') <> 'error'
                   AND COALESCE(m.finished_at, '') < :idleCutoff))
          AND NOT EXISTS (
                SELECT 1 FROM moderation_runs q
                 WHERE q.target_type = c.target_type AND q.target_id = c.target_id
                   AND q.status IN ('queued', 'running'))
        ORDER BY c.priority DESC, c.opened_at ASC
        LIMIT :limit`,
      {
        replacements: {
          limit: RECONCILE_BATCH,
          idleCutoff: new Date(Date.now() - RECONCILE_IDLE_MS).toISOString(),
        },
        type: QueryTypes.SELECT,
        transaction: sp,
      },
    );

    let rerun = 0;
    for (const candidate of candidates) {
      // The shared primitive locks the target first (skipping busy rows), then
      // the case, and re-checks "outage only, no user flags" under the locks.
      const result = await requestRerun(sp, {
        caseId: candidate.id,
        actor: { kind: "system", id: null },
        skipLocked: true,
        requireOutageOnly: true,
      });
      if (result.ok) rerun += 1;
    }
    return rerun;
  }
}

export const moderationWorker = new ModerationWorker();
export default moderationWorker;
