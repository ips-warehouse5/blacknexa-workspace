/**
 * Unit tests for account erasure's moderation redaction — `npm test`. Review R6.
 *
 * Erasure blanked a member's comments but left the AI's verbatim quotes and
 * summaries of them in `moderation_runs` for good. `redactModerationText` nulls
 * `ai_summary` and each verdict's `evidence` / `evidenceEnglish` on the runs of
 * the member's own comments and reports, keeping codes and scores.
 *
 * The statement itself runs in Postgres; this checks what is sent — its scope
 * and its no-op cases — with `sequelize.query` replaced, so nothing connects
 * (the database URL below points at a closed local port regardless).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "erase-test-access-secret-0123456789abcdef-01234";
process.env.JWT_REFRESH_SECRET = "erase-test-refresh-secret-0123456789abcdef-0123";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const { redactModerationText } = require("./account_deletion.service") as typeof import("./account_deletion.service");
const sequelize: any = (require("../config/database.config") as typeof import("../config/database.config")).sequelize;

const TX = { id: "fake-transaction" } as any;

function capture(): Array<{ sql: string; options: any }> {
  const sent: Array<{ sql: string; options: any }> = [];
  sequelize.query = async (sql: string, options: any) => {
    sent.push({ sql, options });
    return [[], { rowCount: 3 }];
  };
  return sent;
}

test("R6: the runs of the member's comments lose their summary and verbatim quotes", async () => {
  const sent = capture();
  const changed = await redactModerationText(TX, { commentIds: ["c1", "c2"] });
  assert.equal(changed, 3);
  assert.equal(sent.length, 1);
  const { sql, options } = sent[0];
  assert.match(sql, /UPDATE moderation_runs/);
  assert.match(sql, /ai_summary = NULL/);
  assert.match(sql, /"evidence": null, "evidenceEnglish": null/);
  // Only their own comments' runs — never a report's.
  assert.match(sql, /target_type = 'comment' AND comment_id IN \(:commentIds\)/);
  assert.doesNotMatch(sql, /target_type = 'report'/);
  assert.deepEqual(options.replacements, { commentIds: ["c1", "c2"] });
  assert.equal(options.transaction, TX, "inside the erasure transaction");
});

test("R6: their reports' runs (content and evidence runs) are redacted too", async () => {
  const sent = capture();
  await redactModerationText(TX, { reportIds: ["r1"] });
  const { sql, options } = sent[0];
  // Report-target runs only: another member's comment on the report is theirs.
  assert.match(sql, /target_type = 'report' AND target_id IN \(:reportIds\)/);
  assert.doesNotMatch(sql, /target_type = 'comment'/);
  assert.deepEqual(options.replacements, { reportIds: ["r1"] });
});

test("R6: codes, confidences and severities are kept — only the text fields change", async () => {
  const sent = capture();
  await redactModerationText(TX, { commentIds: ["c1"], reportIds: ["r1"] });
  const { sql } = sent[0];
  const set = sql.slice(sql.indexOf("SET"), sql.indexOf("WHERE ("));
  for (const column of ["ai_status", "ai_confidence", "ai_recommendation", "safety_risk", "reasons", "keyword_hits"]) {
    assert.ok(!set.includes(column), `${column} is not rewritten`);
  }
  assert.match(sql, /\(target_type = 'comment'[^)]*\)\) OR \(target_type = 'report'/);
});

test("R6: nothing to redact sends nothing", async () => {
  const sent = capture();
  assert.equal(await redactModerationText(TX, {}), 0);
  assert.equal(await redactModerationText(TX, { commentIds: [], reportIds: [] }), 0);
  assert.equal(sent.length, 0);
});

/*
 * The timing half of R6. A worker's apply locks the report row first and writes
 * its run's summary last. The erasure used to redact the report runs *before*
 * its `Report.update`: the in-flight run had no summary yet, the update then
 * waited for the worker's commit, and the worker's quotes outlived the erasure.
 * The redaction must come after the update that locks the report rows. Every
 * model call `deleteAccount` makes is replaced; only the order is observed.
 */
function stubDeleteAccount(order: string[]): void {
  const log = (name: string, value: unknown = [0]) => async () => {
    order.push(name);
    return value;
  };
  const models: any = {
    ...(require("../models/app_user.model") as object),
    ...(require("../models/report.model") as object),
    ...(require("../models/report_social.model") as object),
  };
  const user = { email: "member@example.test", destroy: log("AppUser.destroy") };
  models.AppUser.scope = () => ({ findByPk: async () => user });
  models.Report.findAll = async () => [{ id: "r1" }, { id: "r2" }];
  for (const name of ["ReportSupport", "ReportCorroboration", "ReportComment", "CommentLike"]) {
    models[name].findAll = async () => [];
  }
  for (const name of [
    "Report",
    "ReportEvidence",
    "ReportStatusEvent",
    "ReportFlag",
  ]) {
    models[name].update = log(`${name}.update`);
  }
  for (const name of [
    "ReportDraft",
    "ReportShareLink",
    "ReportHide",
    "Notification",
    "UserSession",
    "UserIdentity",
    "PasswordHistory",
    "UserConsent",
    "EmailOtp",
  ]) {
    models[name].destroy = log(`${name}.destroy`, 0);
  }
  models.AccountDeletion.create = log("AccountDeletion.create", {});

  const reportService: any = (require("./report.service") as any).default;
  reportService.closeModerationForRemovedReport = log("closeModerationForRemovedReport", []);
  (require("./audit.service") as any).default.nullMemberActor = log("nullMemberActor", 0);
  (require("./flag.service") as any).default.notifyReporters = () => {};
  (require("./mailer.service") as any).default.sendAccountDeleted = async () => {};

  sequelize.transaction = async (work: (tx: unknown) => Promise<unknown>) => work(TX);
  sequelize.query = async (sql: string) => {
    order.push(/UPDATE moderation_runs/.test(sql) ? "redact" : "query");
    return [[], { rowCount: 0 }];
  };
}

for (const disposition of ["sever", "erase"] as const) {
  test(`R6: ${disposition} redacts the report runs only after the report rows are updated (locked)`, async () => {
    const order: string[] = [];
    stubDeleteAccount(order);
    const service = (require("./account_deletion.service") as any).default;
    await service.deleteAccount("u1", disposition);

    const update = order.indexOf("Report.update");
    const redact = order.indexOf("redact");
    assert.ok(update >= 0, "the reports were updated");
    assert.ok(redact >= 0, "the report runs were redacted");
    assert.ok(
      redact > update,
      `redaction must follow the Report.update that waits for an in-flight worker (order: ${order.join(", ")})`,
    );
    if (disposition === "erase") {
      // And after the withdrawal of queued runs and open cases, still in the
      // same transaction.
      assert.ok(redact > order.lastIndexOf("closeModerationForRemovedReport"));
    }
  });
}
