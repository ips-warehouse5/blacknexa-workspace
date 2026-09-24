/**
 * Unit tests for the reconciler's evidence step — `npm test`, no database.
 *
 * Review R13: an evidence run that met an AI outage holds its photos
 * `ai_unavailable` in an open media-review case, and leaves the report
 * `approved` — so step 5 (`requestRerun`, held targets only) can never re-run
 * it. Step 3 must: when the engine is healthy, an open media case whose hold
 * reasons an outage left behind (no user flags, latest run not a permanent
 * `error`, review R20) no longer blocks a fresh evidence run. Review R2: that
 * run keeps an urgent report's priority and short attempt budget.
 *
 * The SQL itself is checked offline against the Postgres grammar; here the
 * statement is captured and its gating — the outage exception, and that it is
 * switched on only by a healthy engine — is pinned, along with what is queued.
 * Review Q8: the comment steps skip comments on a deactivated report.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "worker-test-access-secret-0123456789abcdef-0123";
process.env.JWT_REFRESH_SECRET = "worker-test-refresh-secret-0123456789abcdef-012";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.MODERATION_MAX_ATTEMPTS = "4";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const { ModerationWorker } = require("./moderation_worker") as typeof import("./moderation_worker");
const { RUN_PRIORITY } = require("../types/moderation.interface") as typeof import("../types/moderation.interface");
const env: any = (require("../config/env.config") as typeof import("../config/env.config")).default;
const sequelize: any = (require("../config/database.config") as typeof import("../config/database.config")).default;
const enqueueModule: any = require("./moderation_enqueue");
const aiEngineClient: any = (require("./ai_engine.client") as typeof import("./ai_engine.client")).aiEngineClient;

const REPORT = "33333333-3333-4333-8333-333333333333";

interface Captured {
  sql: Array<{ sql: string; replacements: any }>;
  enqueued: any[];
}

const EVIDENCE_STEP = /e\.moderation_state = 'pending' AND e\.upload_state = 'sealed'/;

function wire(evidenceRows: any[]): Captured {
  const captured: Captured = { sql: [], enqueued: [] };
  sequelize.transaction = async (a: any, b?: any) => (typeof a === "function" ? a({}) : b({}));
  sequelize.query = async (sql: string, options: any = {}) => {
    captured.sql.push({ sql, replacements: options.replacements });
    if (/pg_try_advisory_xact_lock/.test(sql)) return [{ locked: true }];
    if (EVIDENCE_STEP.test(sql)) return evidenceRows;
    return [];
  };
  enqueueModule.enqueueRun = async (_tx: unknown, input: any) => {
    captured.enqueued.push(input);
    return "run-id";
  };
  return captured;
}

test("R13: step 3 lets an outage-only media case through only when the engine is healthy", async () => {
  const worker: any = new ModerationWorker();
  for (const healthy of [true, false]) {
    const captured = wire([]);
    await worker.enqueueMissingEvidenceRuns({}, healthy);
    const statement = captured.sql.find((entry) => EVIDENCE_STEP.test(entry.sql));
    assert.ok(statement, "the evidence step ran its query");
    assert.equal(statement.replacements.engineHealthy, healthy);
    // An open media case blocks the run unless it is outage-only: healthy
    // engine, no user flags, only outage reasons (media_unassessed ignored),
    // and a latest run that did not fail permanently.
    const exception = statement.sql.slice(statement.sql.indexOf("AND NOT ("));
    assert.match(exception, /CAST\(:engineHealthy AS boolean\)/);
    assert.match(exception, /c\.user_flag_count = 0/);
    assert.match(exception, /h\.v IN \('ai_unavailable', 'system_error'\)/);
    assert.match(exception, /h\.v NOT IN \('ai_unavailable', 'system_error', 'media_unassessed'\)/);
    assert.match(exception, /COALESCE\(lr\.ai_status, ''\) <> 'error'/);
  }
});

test("R13/R2: the evidence run step 3 queues keeps an urgent report's priority and short budget", async () => {
  const worker: any = new ModerationWorker();
  const captured = wire([
    { id: REPORT, content_version: 3, urgent: true },
    { id: "44444444-4444-4444-8444-444444444444", content_version: 1, urgent: false },
  ]);
  const count = await worker.enqueueMissingEvidenceRuns({}, true);
  assert.equal(count, 2);
  assert.deepEqual(
    captured.enqueued.map((run) => [run.trigger, run.contentVersion, run.priority, run.maxAttempts]),
    [
      ["evidence", 3, RUN_PRIORITY.urgent, env.moderation.urgentMaxAttempts],
      ["evidence", 1, RUN_PRIORITY.normal, env.moderation.maxAttempts],
    ],
  );
  assert.equal(env.moderation.urgentMaxAttempts, 2);
});

test("R13: step 5 only considers cases whose target is still held — evidence outages cannot crowd it out", async () => {
  const worker: any = new ModerationWorker();
  const captured = wire([]);
  const rerun = await worker.rerunOutageHolds({});
  assert.equal(rerun, 0);
  const statement = captured.sql.find((entry) => /FROM moderation_cases c/.test(entry.sql));
  assert.ok(statement, "the step-5 candidate query ran");
  assert.match(statement.sql, /FROM reports tr\s+WHERE tr\.id = c\.target_id AND tr\.moderation_state = 'held'/);
  assert.match(statement.sql, /FROM report_comments tc\s+WHERE tc\.id = c\.target_id AND tc\.moderation_state = 'held'/);
  // …and the gate sits before the batch limit, where it can keep a slot free.
  assert.ok(statement.sql.indexOf("moderation_state = 'held'") < statement.sql.indexOf("LIMIT :limit"));
});

test("R13: the reconciler hands step 3 the engine's health, asked before the transaction", async () => {
  const captured = wire([]);
  env.moderation.enabled = true;
  Object.defineProperty(aiEngineClient, "isConfigured", { configurable: true, get: () => true });
  for (const ready of [true, false]) {
    captured.sql.length = 0;
    aiEngineClient.moderationReady = async () => ready;
    const worker: any = new ModerationWorker();
    const result = await worker.reconcile();
    assert.equal(result.engineHealthy, ready);
    const statement = captured.sql.find((entry) => EVIDENCE_STEP.test(entry.sql));
    assert.ok(statement);
    assert.equal(statement.replacements.engineHealthy, ready);
  }
});

test("review Q8: the comment steps never re-queue or re-open work on a deactivated report's comments", async () => {
  const worker: any = new ModerationWorker();
  const captured = wire([]);
  await worker.enqueueMissingCommentRuns({});
  await worker.openMissingCases({});
  await worker.approvePendingPrivate({}, []);

  const commentRuns = captured.sql.find((entry) => /c\.moderation_state = 'pending' AND c\.status = 'visible'\s+AND r\.deleted_at IS NULL AND r\.visibility <> 'private'/.test(entry.sql));
  assert.ok(commentRuns, "step 2b ran its query");
  assert.match(commentRuns.sql, /AND r\.moderation_state <> 'deactivated'/);

  const heldComments = captured.sql.find((entry) => /c\.moderation_state = 'held' AND c\.status = 'visible'/.test(entry.sql));
  assert.ok(heldComments, "step 4 ran its comment query");
  assert.match(heldComments.sql, /AND r\.moderation_state <> 'deactivated'/);
  // …and the filter sits before the batch limit, so a deactivated backlog cannot take the slots.
  assert.ok(heldComments.sql.indexOf("<> 'deactivated'") < heldComments.sql.indexOf("LIMIT :limit"));

  const privateComments = captured.sql.find((entry) => /AND r\.visibility = 'private' AND r\.deleted_at IS NULL/.test(entry.sql) && /FROM report_comments c/.test(entry.sql));
  assert.ok(privateComments, "step 1 ran its comment query");
  assert.match(privateComments.sql, /AND r\.moderation_state <> 'deactivated'/);
  assert.deepEqual(captured.enqueued, []);
});
