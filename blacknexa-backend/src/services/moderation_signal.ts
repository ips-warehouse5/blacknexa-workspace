/**
 * "There is moderation work" — an in-process doorbell for the worker.
 *
 * docs/INCIDENT_MODULE_PLAN.md §5.2: the worker polls `moderation_runs` every
 * `MODERATION_WORKER_POLL_MS` (1.5 s), and domain services ring this bell after
 * a transaction that queued a run commits, so a filed report is claimed in
 * milliseconds rather than on the next tick.
 *
 * ── Why a separate, dependency-free module ─────────────────────────────────
 * The domain services (reports, comments, flags, evidence) must be able to wake
 * the worker without importing it. The worker imports the AI client, the
 * pipeline, S3 and the policy; if `report.service.ts` imported the worker, every
 * script and test that touches reports would drag that whole graph in, and the
 * worker and the domain would import each other. This file imports nothing from
 * the application — only Node's `events` — so either side can depend on it.
 *
 * ── What a poke is, and is not ─────────────────────────────────────────────
 * A poke is a hint, never the work itself. The run row is already committed and
 * durable (D13); a poke that nobody hears (the worker is disabled on this
 * replica, or another replica wrote the row) costs nothing, because the poll and
 * the reconciler still find it. So `pokeModeration()` is synchronous, never
 * throws, and must be called only *after* the transaction resolved — a poke
 * inside the transaction would let the worker look before the row is visible.
 */

import { EventEmitter } from "events";

const POKE = "poke";

const bell = new EventEmitter();
// One listener per worker, plus tests. The default cap of 10 would only ever
// produce a misleading "possible memory leak" warning here.
bell.setMaxListeners(0);

/** Ring the bell. Synchronous, cheap, never throws. */
export function pokeModeration(): void {
  bell.emit(POKE);
}

/**
 * Listen for pokes. Returns the unsubscribe function (the worker calls it on
 * shutdown).
 *
 * A listener that throws must not turn a successful filing into a 500 — the
 * emitter calls listeners synchronously on the caller's stack — so each one is
 * wrapped, and a failure is surfaced as a process warning instead. (This module
 * cannot use the logger: the logger imports env config, and staying
 * dependency-free is the point of the module.)
 */
export function onPoke(listener: () => void): () => void {
  const guarded = (): void => {
    try {
      listener();
    } catch (err) {
      process.emitWarning(
        `[moderation] poke listener failed: ${err instanceof Error ? err.message : String(err)}`,
        "ModerationSignalWarning",
      );
    }
  };
  bell.on(POKE, guarded);
  return () => {
    bell.off(POKE, guarded);
  };
}
