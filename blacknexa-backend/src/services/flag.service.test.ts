/**
 * Unit tests for the comment-flag lock order — `npm test`. Review R3.
 *
 * A comment flag racing its report's deletion (or its author's erasure) used to
 * read the report unlocked, see it not yet deleted, and open a case and an open
 * flag the delete could not see to close. `flagComment` now locks the report
 * right after the comment (comment → report, the order `setCommentState` and
 * account deletion take) and 404s on a deleted report — and, since review Q8,
 * on a deactivated one (its comments are out of moderation until Reactivate).
 *
 * `flag.service.ts` reads the environment, so this file sets what `env.config`
 * requires (a database URL on a closed local port — nothing can connect) and
 * replaces the transaction and the model finders with stand-ins.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "flag-test-access-secret-0123456789abcdef-012345";
process.env.JWT_REFRESH_SECRET = "flag-test-refresh-secret-0123456789abcdef-01234";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const { flagService } = require("./flag.service") as typeof import("./flag.service");
const reportTx: any = require("./report_tx");
const reportModels: any = require("../models/report.model");
const socialModels: any = require("../models/report_social.model");
const sequelize: any = (require("../config/database.config") as typeof import("../config/database.config")).sequelize;

const FLAGGER = { id: "11111111-1111-4111-8111-111111111111", role: "member" };
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const COMMENT = "33333333-3333-4333-8333-333333333333";
const REPORT = "44444444-4444-4444-8444-444444444444";

const STOP = new Error("stop after the locks");

function wire(report: Record<string, unknown>): string[] {
  const calls: string[] = [];
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) =>
    work({ LOCK: { UPDATE: "UPDATE" } });
  socialModels.ReportComment.findByPk = async (_id: string, options: any) => {
    calls.push(`comment:${options?.lock ?? "none"}`);
    return {
      id: COMMENT,
      report_id: REPORT,
      user_id: AUTHOR,
      status: "visible",
      moderation_state: "approved",
    };
  };
  reportModels.Report.findByPk = async (_id: string, options: any) => {
    calls.push(`report:${options?.lock ?? "none"}`);
    return {
      id: REPORT,
      user_id: AUTHOR,
      deleted_at: null,
      moderation_state: "approved",
      visibility: "public",
      content_version: 1,
      ...report,
    };
  };
  // No query may leave the process: the one raw read (was a human's approval of
  // this comment on record?) answers "no".
  sequelize.query = async () => {
    calls.push("human-cleared check");
    return [];
  };
  // Past the locks and the read gate, the flag is recorded — stop there.
  socialModels.ReportFlag.findOne = async () => {
    calls.push("flag lookup");
    throw STOP;
  };
  return calls;
}

test("R3: a comment flag locks the comment, then its report, before anything else", async () => {
  const calls = wire({});
  await assert.rejects(flagService.flagComment(COMMENT, FLAGGER, { reason: "harassment" }), STOP);
  assert.deepEqual(calls, ["comment:UPDATE", "report:UPDATE", "human-cleared check", "flag lookup"]);
});

test("R3: a flag on a comment of a deleted report is a 404 and records nothing", async () => {
  const calls = wire({ deleted_at: "2026-09-23T10:00:00.000Z" });
  await assert.rejects(
    flagService.flagComment(COMMENT, FLAGGER, { reason: "harassment" }),
    (err: any) => err.status === 404,
  );
  assert.deepEqual(calls, ["comment:UPDATE", "report:UPDATE"]);
});

test("R3: the deleted report's own author gets the same 404 — the read gate alone let them through", async () => {
  wire({ deleted_at: "2026-09-23T10:00:00.000Z", user_id: FLAGGER.id });
  await assert.rejects(
    flagService.flagComment(COMMENT, FLAGGER, { reason: "harassment" }),
    (err: any) => err.status === 404,
  );
});

test("review Q8: the owner of a deactivated report cannot open a case on one of its comments (404)", async () => {
  // The owner can still read a report staff took down, but its comments are out
  // of moderation until Reactivate — a case here could never be decided.
  const calls = wire({ moderation_state: "deactivated", user_id: FLAGGER.id });
  await assert.rejects(
    flagService.flagComment(COMMENT, FLAGGER, { reason: "harassment" }),
    (err: any) => err.status === 404,
  );
  assert.deepEqual(calls, ["comment:UPDATE", "report:UPDATE"], "nothing past the read gate");
});
