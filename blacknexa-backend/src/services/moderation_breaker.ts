/**
 * Retry timing for the moderation worker — the circuit breaker and the delay
 * helpers, as pure code.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.2 and §5.4 ("AI down / slow / 5xx / 429").
 * Kept out of `moderation_worker.ts` (which imports env, models and the AI
 * client) so `npm test` can drive the breaker with a fake clock.
 *
 * ── The breaker ───────────────────────────────────────────────────────────
 * Per replica: after 5 consecutive *retryable* engine failures, AI-stage runs
 * are rescheduled for 30 s without calling the engine and without consuming an
 * attempt. Without it, an engine outage turns every queued run into a timeout
 * per attempt — 40 s of a worker slot each, and a burst of load on an engine
 * that is trying to recover. Rescheduling without an attempt matters as much:
 * the runs did not fail, they were never tried, so an outage shorter than the
 * attempt budget must not push a single report to a human.
 *
 * After the 30 s window the breaker is half-open: the next call goes through; a
 * success closes it, a failure re-opens it at once (the failure count is not
 * reset when the breaker opens, so one more failure is already "5 in a row").
 * Permanent errors (a 4xx, or an `unavailable` answer the engine marks
 * `retryable: false`, review R20) are not outages and neither trip nor reset it.
 */

import { backoffMs } from "@/types/moderation.interface";

export const BREAKER = {
  /** Consecutive retryable engine failures that open the breaker. */
  failureThreshold: 5,
  /** How long it stays open. */
  openMs: 30_000,
  /** Spread over the reopening instant, so parked runs do not all fire at once. */
  reopenJitterMs: 2_000,
} as const;

export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntilMs = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly threshold: number = BREAKER.failureThreshold,
    private readonly openMs: number = BREAKER.openMs,
  ) {}

  /** True while AI-stage runs must be parked instead of calling the engine. */
  isOpen(): boolean {
    return this.now() < this.openUntilMs;
  }

  /** When the breaker next lets a call through (epoch ms; 0 when closed). */
  get openUntil(): number {
    return this.openUntilMs;
  }

  /** Consecutive retryable failures seen so far. */
  get failures(): number {
    return this.consecutiveFailures;
  }

  /**
   * The engine answered with a verdict (assessed or blocked): not an outage.
   * A permanent failure — a 4xx, or a 200 `unavailable` the engine marks
   * `retryable: false` (review R20) — calls neither this nor `recordFailure`,
   * as the header says: it is not an outage, and one bad request says nothing
   * about whether the provider has recovered.
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntilMs = 0;
  }

  /** A retryable failure. Returns true when this failure (re-)opened the breaker. */
  recordFailure(): boolean {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.threshold) {
      this.openUntilMs = this.now() + this.openMs;
      return true;
    }
    return false;
  }
}

/**
 * The delay before a failed run is claimed again. `attempt` is the run's
 * `attempts` after the claim. When that was the last attempt the next claim can
 * only take the terminal path (§5.2), which does no AI work — so there is no
 * reason to make a human wait a backoff interval for it.
 */
export function retryDelayMs(
  attempt: number,
  maxAttempts: number,
  randomFn: () => number = Math.random,
): number {
  if (attempt >= maxAttempts) return 0;
  return backoffMs(attempt, randomFn);
}

/** Park a run until the breaker reopens, plus a little jitter. */
export function breakerDelayMs(
  openUntil: number,
  now: number,
  randomFn: () => number = Math.random,
): number {
  const jitter = Math.floor(Math.min(Math.max(Number(randomFn()) || 0, 0), 1) * BREAKER.reopenJitterMs);
  return Math.max(0, openUntil - now) + jitter;
}
