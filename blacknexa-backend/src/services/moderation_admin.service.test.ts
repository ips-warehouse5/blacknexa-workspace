/**
 * Unit tests for the Content Moderation admin service — `npm test`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §8.1 (tabs, filters, sort), §5.4 (lock order,
 * double decisions), D8 (human approval pins the version), D16 (refusals).
 *
 * The queue's pure helpers are tested directly. The decision paths are tested
 * with the transaction, the case service, the model finders and the audit
 * writer replaced by stand-ins, which is enough to pin down the three things
 * that must never regress: the target row is locked before the case, a case
 * that is already resolved answers 409 before anything is written, and an
 * operator deciding on their own content is refused and audited.
 *
 * Review fixes pinned here: Q2 (a ban dismisses the member's open flags in
 * lock order and recounts their cases), Q3 (hiding a report's file through a
 * comment case checks the report's flaggers), Q5 (a ban's case link must be
 * about the member), Q6 (approve releases only the files the moderator was
 * shown; what is left pending gets its own evidence run), Q7 (a rejection
 * clears the approved version — the durable resubmission debt).
 *
 * The service reads the environment, so this file sets what `env.config`
 * requires (a database URL on a closed local port) before loading it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "modadmin-test-access-secret-0123456789abcdef-0123";
process.env.JWT_REFRESH_SECRET = "modadmin-test-refresh-secret-0123456789abcdef-012";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const mod = require("./moderation_admin.service") as typeof import("./moderation_admin.service");
const reportTx: any = require("./report_tx");
const caseModule: any = require("./moderation_case.service");
const auditModule: any = require("./audit.service");
const reportModels: any = require("../models/report.model");
const socialModels: any = require("../models/report_social.model");
const adminModels: any = require("../models/admin_user.model");
const appModels: any = require("../models/app_user.model");
const sequelize: any = (require("../config/database.config") as typeof import("../config/database.config")).sequelize;
const { MODERATION_QUEUE_TABS, POLICY_CATEGORIES } =
  require("../types/moderation.interface") as typeof import("../types/moderation.interface");

const {
  caseTabFilter,
  caseOrderSql,
  caseListWhere,
  caseSources,
  decisionNoticeBody,
  bannedFlagTargets,
  moderationAdminService,
} = mod;
const { recountedFlagSignal } = require("./moderation_case.service") as typeof import("./moderation_case.service");
const env: any = (require("../config/env.config") as typeof import("../config/env.config")).default;
// Kept before any test replaces it with a stand-in.
const realRecountFlagSignals = caseModule.moderationCaseService.recountFlagSignals;

// ── Tab → filter mapping (§8.1) ──────────────────────────────────────────────

test("caseTabFilter: all is no filter", () => {
  assert.equal(caseTabFilter("all"), null);
});

test("caseTabFilter: the four sources map to their case columns", () => {
  assert.deepEqual(caseTabFilter("ai"), { sql: "c.ai_flagged = true", replacements: {} });
  assert.deepEqual(caseTabFilter("keyword"), { sql: "c.keyword_flagged = true", replacements: {} });
  assert.deepEqual(caseTabFilter("user"), { sql: "c.user_flag_count > 0", replacements: {} });
  assert.deepEqual(caseTabFilter("media"), { sql: "c.media_review = true", replacements: {} });
});

test("caseTabFilter: each policy code is a JSONB containment on categories", () => {
  for (const code of POLICY_CATEGORIES) {
    const fragment = caseTabFilter(code);
    assert.ok(fragment, code);
    assert.equal(fragment.sql, "c.categories @> CAST(:tabCategory AS jsonb)");
    assert.deepEqual(fragment.replacements, { tabCategory: JSON.stringify([code]) });
  }
});

test("caseTabFilter: alias and parameter name are the caller's, so fragments can share a statement", () => {
  assert.deepEqual(caseTabFilter("threat", "mc", "tab5"), {
    sql: "mc.categories @> CAST(:tab5 AS jsonb)",
    replacements: { tab5: '["threat"]' },
  });
  assert.deepEqual(caseTabFilter("user", "mc", "ignored"), { sql: "mc.user_flag_count > 0", replacements: {} });
});

test("caseTabFilter: every advertised tab has a mapping, and nothing else does", () => {
  for (const tab of MODERATION_QUEUE_TABS) assert.doesNotThrow(() => caseTabFilter(tab), tab);
  assert.throws(() => caseTabFilter("violence" as never), (err: unknown) => (err as { status?: number }).status === 400);
});

test("caseListWhere: open by default, with every filter as a clause and a replacement", () => {
  const { clauses, replacements } = caseListWhere({
    tab: "private_info",
    state: "open",
    targetType: "comment",
    urgent: true,
    search: "  BNX-44%  ",
  });
  assert.deepEqual(clauses, [
    "c.state = :state",
    "c.categories @> CAST(:tabCategory AS jsonb)",
    "c.target_type = :targetType",
    "c.urgent = :urgent",
    "(r.case_ref ILIKE :search OR r.title ILIKE :search OR u.display_name ILIKE :search OR u.email ILIKE :search)",
  ]);
  assert.deepEqual(replacements, {
    state: "open",
    tabCategory: '["private_info"]',
    targetType: "comment",
    urgent: true,
    search: "%BNX-44\\%%",
  });
});

test("caseListWhere: urgent=false is a filter; a blank search is not", () => {
  const { clauses, replacements } = caseListWhere({ tab: "all", state: "resolved", urgent: false, search: "   " });
  assert.deepEqual(clauses, ["c.state = :state", "c.urgent = :urgent"]);
  assert.deepEqual(replacements, { state: "resolved", urgent: false });
});

test("caseOrderSql: priority first by default; newest/oldest by opening, or by resolution when resolved", () => {
  assert.equal(caseOrderSql("priority", "open"), "c.priority DESC, c.opened_at ASC, c.id ASC");
  assert.equal(caseOrderSql("newest", "open"), "c.opened_at DESC, c.id DESC");
  assert.equal(caseOrderSql("oldest", "open"), "c.opened_at ASC, c.id ASC");
  assert.equal(caseOrderSql("newest", "resolved"), "COALESCE(c.resolved_at, c.opened_at) DESC, c.id DESC");
  assert.equal(caseOrderSql("priority", "resolved"), "c.priority DESC, c.opened_at ASC, c.id ASC");
});

test("caseSources: one badge per signal", () => {
  assert.deepEqual(caseSources({ ai_flagged: true, keyword_flagged: false, user_flag_count: 0, media_review: true }), {
    ai: true,
    keyword: false,
    user: false,
    media: true,
  });
  assert.equal(caseSources({ ai_flagged: false, keyword_flagged: false, user_flag_count: 3, media_review: false }).user, true);
});

test("decisionNoticeBody: label, then the moderator's note, then the fixed copy", () => {
  assert.equal(
    decisionNoticeBody("Harassment", " Please remove the name. ", "Open it to see why."),
    "Reason: Harassment. Please remove the name. Open it to see why.",
  );
  assert.equal(decisionNoticeBody("Spam or advertising", null, "Open it."), "Reason: Spam or advertising. Open it.");
  assert.equal(decisionNoticeBody(null, "  ", "Fixed."), "Fixed.");
});

// ── Decisions through the seams ──────────────────────────────────────────────

const ADMIN = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "mod@blacknexa.org", role: "moderator", ip: null };
const CASE = "11111111-1111-4111-8111-111111111111";
const REPORT = "22222222-2222-4222-8222-222222222222";
const AUTHOR = "33333333-3333-4333-8333-333333333333";
const COMMENT = "44444444-4444-4444-8444-444444444444";

interface Wiring {
  calls: string[];
  audits: any[];
  writes: string[];
}

function wire(options: {
  caseRow: Record<string, unknown>;
  authorEmail: string;
  report?: Record<string, unknown>;
  comment?: Record<string, unknown>;
}): Wiring {
  const calls: string[] = [];
  const audits: any[] = [];
  const writes: string[] = [];
  const caseRow = {
    id: CASE,
    target_type: "report",
    target_id: REPORT,
    report_id: REPORT,
    comment_id: null,
    state: "open",
    ...options.caseRow,
  };

  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) =>
    work({ LOCK: { UPDATE: "UPDATE", NO_KEY_UPDATE: "NO KEY UPDATE" } });
  caseModule.moderationCaseService.findById = async (_tx: unknown, _id: string, opts: any = {}) => {
    calls.push(opts.lock ? "case:lock" : "case:peek");
    return caseRow;
  };
  caseModule.moderationCaseService.resolveCase = async () => {
    writes.push("resolveCase");
    return { ...caseRow, state: "resolved" };
  };
  reportModels.Report.findByPk = async (_id: string, opts: any = {}) => {
    calls.push(`report:${opts.lock ?? "none"}`);
    return {
      id: REPORT,
      user_id: AUTHOR,
      deleted_at: null,
      moderation_state: "held",
      status: "submitted",
      content_version: 3,
      published_at: null,
      case_ref: "BNX-4471",
      update: async () => {
        writes.push("report.update");
      },
      ...options.report,
    };
  };
  reportModels.Report.findOne = async (opts: any = {}) => {
    calls.push(`report:${opts.lock ?? "none"}`);
    return { id: REPORT, user_id: "someone-else", deleted_at: null, moderation_state: "approved", case_ref: "BNX-4471", ...options.report };
  };
  socialModels.ReportComment.findByPk = async (_id: string, opts: any = {}) => {
    calls.push(`comment:${opts.lock ?? "none"}`);
    return { id: COMMENT, report_id: REPORT, user_id: AUTHOR, status: "visible", moderation_state: "held", ...options.comment };
  };
  // The flagger lookup: nobody flagged it.
  sequelize.query = async () => {
    calls.push("flaggers");
    return [];
  };
  adminModels.AdminUser.findByPk = async () => ({ id: ADMIN.id, email: ADMIN.email });
  appModels.AppUser.findAll = async () => [{ id: AUTHOR, email: options.authorEmail }];
  auditModule.auditService.record = async (_tx: unknown, input: any) => {
    audits.push(input);
    return "audit-id";
  };
  return { calls, audits, writes };
}

test("approve: locks the report before the case, and a resolved case is 409 with nothing written", async () => {
  const { calls, writes, audits } = wire({ caseRow: { state: "resolved" }, authorEmail: "author@x.org" });
  await assert.rejects(
    moderationAdminService.approveCase(ADMIN, CASE, {}),
    (err: unknown) => (err as { status?: number }).status === 409,
  );
  assert.deepEqual(calls.slice(0, 3), ["case:peek", "report:UPDATE", "case:lock"]);
  assert.deepEqual(writes, []);
  assert.equal(audits.length, 0);
});

test("approve on a comment: comment, then its report (NO KEY UPDATE), then the case", async () => {
  const { calls } = wire({
    caseRow: { target_type: "comment", target_id: COMMENT, comment_id: COMMENT, state: "resolved" },
    authorEmail: "author@x.org",
  });
  await assert.rejects(moderationAdminService.approveCase(ADMIN, CASE, {}));
  assert.deepEqual(calls.slice(0, 4), ["case:peek", "comment:UPDATE", "report:NO KEY UPDATE", "case:lock"]);
});

test("approve: a deactivated report cannot be decided (409)", async () => {
  const { writes } = wire({ caseRow: {}, authorEmail: "author@x.org", report: { moderation_state: "deactivated" } });
  await assert.rejects(
    moderationAdminService.approveCase(ADMIN, CASE, {}),
    (err: unknown) => (err as { status?: number }).status === 409 && /deactivated/.test((err as Error).message),
  );
  assert.deepEqual(writes, []);
});

test("approve: a report edited since it was opened is 409 when the console sends the version it rendered", async () => {
  const { writes } = wire({ caseRow: {}, authorEmail: "author@x.org", report: { content_version: 4 } });
  await assert.rejects(
    moderationAdminService.approveCase(ADMIN, CASE, { contentVersion: 3 }),
    (err: unknown) => (err as { status?: number }).status === 409 && /edited/.test((err as Error).message),
  );
  assert.deepEqual(writes, []);
});

test("reject: the operator's own report is refused (403) and audited as self_action.refused", async () => {
  const { writes, audits } = wire({ caseRow: {}, authorEmail: "MOD+member@blacknexa.org" });
  await assert.rejects(
    moderationAdminService.rejectCase(ADMIN, CASE, { reasonCode: "spam" }),
    (err: unknown) => (err as { status?: number }).status === 403,
  );
  assert.deepEqual(writes, []);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "self_action.refused");
  assert.equal(audits[0].caseId, CASE);
  assert.equal(audits[0].metadata.attemptedAction, "moderation.reject");
});

test("reject: `other` without a note is refused before any transaction opens", async () => {
  const { calls } = wire({ caseRow: {}, authorEmail: "author@x.org" });
  await assert.rejects(
    moderationAdminService.rejectCase(ADMIN, CASE, { reasonCode: "other", publicNote: "  " }),
    (err: unknown) => (err as { status?: number }).status === 400,
  );
  assert.deepEqual(calls, []);
});

test("ban: an operator cannot ban their own member account", async () => {
  const audits: any[] = [];
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => work({ LOCK: { UPDATE: "UPDATE" } });
  appModels.AppUser.findByPk = async () => ({ id: AUTHOR, status: "active", email: "mod@blacknexa.org", update: async () => undefined });
  appModels.AppUser.findAll = async () => [{ id: AUTHOR, email: "mod@blacknexa.org" }];
  adminModels.AdminUser.findByPk = async () => ({ id: ADMIN.id, email: "mod@blacknexa.org" });
  auditModule.auditService.record = async (_tx: unknown, input: any) => {
    audits.push(input);
    return "audit-id";
  };
  await assert.rejects(
    moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "repeat" }),
    (err: unknown) => (err as { status?: number }).status === 403,
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "self_action.refused");
  assert.equal(audits[0].reasonCode, "member");
});

// ── Decision outcomes: what each one writes ──────────────────────────────────

const evidenceModule: any = require("./evidence.service");
const enqueueModule: any = require("./moderation_enqueue");
const pipelineModule: any = require("./moderation_pipeline.service");
const signalModule: any = require("./moderation_signal");
const commentStateModule: any = require("./comment_state");
const notificationModule: any = require("./notification.service");
const flagModule: any = require("./flag.service");
const { moderationSchemas } = require("../validations/moderation.validation") as typeof import("../validations/moderation.validation");

const COMMENTER = "55555555-5555-4555-8555-555555555555";

interface Outcome {
  order: string[];
  audits: any[];
  reportPatches: any[];
  notifications: any[];
  approvals: any[];
  flagOutcomes: any[];
  mailed: any[];
  commentStates: any[];
  enqueued: any[];
}

const { Op } = require("sequelize") as typeof import("sequelize");
/** The sealed files of the report in `wireOutcome`; anything else is not one. */
const SEALED_ON_REPORT = ["e-sealed-1", "e-sealed-2"];

/** Wire a decision end to end with stand-ins, recording what it writes and when. */
function wireOutcome(options: {
  caseRow?: Record<string, unknown>;
  report?: Record<string, unknown>;
  comment?: Record<string, unknown>;
  flags?: any[];
  /** Sealed files still pending once the approval has run. */
  pendingLeft?: number;
}): Outcome {
  const out: Outcome = {
    order: [],
    audits: [],
    reportPatches: [],
    notifications: [],
    approvals: [],
    flagOutcomes: [],
    mailed: [],
    commentStates: [],
    enqueued: [],
  };
  const caseRow = {
    id: CASE,
    target_type: "report",
    target_id: REPORT,
    report_id: REPORT,
    comment_id: null,
    state: "open",
    ...options.caseRow,
  };
  const report: any = {
    id: REPORT,
    case_ref: "BNX-4471",
    user_id: AUTHOR,
    deleted_at: null,
    moderation_state: "held",
    status: "submitted",
    content_version: 3,
    published_at: null,
    ...options.report,
  };
  report.update = async (patch: any) => {
    out.reportPatches.push(patch);
    Object.assign(report, patch);
    return report;
  };
  const comment = {
    id: COMMENT,
    report_id: REPORT,
    user_id: COMMENTER,
    status: "visible",
    moderation_state: "held",
    reply_notified: false,
    ...options.comment,
  };

  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => {
    out.order.push("tx:start");
    const result = await work({ LOCK: { UPDATE: "UPDATE", NO_KEY_UPDATE: "NO KEY UPDATE" } });
    out.order.push("tx:commit");
    return result;
  };
  caseModule.moderationCaseService.findById = async () => caseRow;
  caseModule.moderationCaseService.resolveCase = async (_tx: unknown, _id: string, input: any) => {
    out.order.push(`resolveCase:${input.resolution}`);
    return { ...caseRow, state: "resolved", resolution: input.resolution };
  };
  caseModule.moderationCaseService.resolveOpenFlags = async (
    _tx: unknown,
    targetType: string,
    _targetId: string,
    outcome: any,
  ) => {
    out.flagOutcomes.push({ targetType, ...outcome });
    return options.flags ?? [];
  };
  reportModels.Report.findByPk = async () => report;
  reportModels.Report.findOne = async () => report;
  socialModels.ReportComment.findByPk = async () => comment;
  // Only sealed files of this report come back, whatever ids were asked for.
  reportModels.ReportEvidence.findAll = async ({ where }: any) => {
    const asked: string[] = where.id?.[Op.in] ?? [];
    assert.equal(where.report_id, REPORT);
    assert.equal(where.upload_state, "sealed");
    return SEALED_ON_REPORT.filter((id) => asked.includes(id)).map((id) => ({ id }));
  };
  reportModels.ReportEvidence.count = async ({ where }: any) => {
    assert.deepEqual(where, { report_id: REPORT, upload_state: "sealed", moderation_state: "pending" });
    return options.pendingLeft ?? 0;
  };
  evidenceModule.approveEvidence = async (_tx: unknown, input: any) => {
    out.approvals.push(input);
    return [...input.ids];
  };
  enqueueModule.cancelQueuedRunsForTarget = async () => {
    out.order.push("cancelQueued");
    return 1;
  };
  enqueueModule.enqueueRun = async (_tx: unknown, input: any) => {
    out.order.push(`enqueue:${input.trigger}`);
    out.enqueued.push(input);
    return "run-evidence";
  };
  signalModule.pokeModeration = () => {
    out.order.push("poke");
  };
  commentStateModule.setCommentState = async (_tx: unknown, commentId: string, next: any) => {
    out.commentStates.push({ commentId, ...next });
    return { commentId, reportId: REPORT, before: {}, after: {}, delta: 0 };
  };
  pipelineModule.approveComment = async () => {
    out.order.push("approveComment");
  };
  sequelize.query = async () => [];
  adminModels.AdminUser.findByPk = async () => ({ id: ADMIN.id, email: ADMIN.email });
  appModels.AppUser.findAll = async () => [
    { id: AUTHOR, email: "author@x.org" },
    { id: COMMENTER, email: "commenter@x.org" },
  ];
  notificationModule.notificationService.createInTx = async (_tx: unknown, input: any, pending: unknown[]) => {
    out.notifications.push(input);
    pending.push({ title: input.title });
    return "notification-id";
  };
  pipelineModule.dispatchAfterCommit = (pending: unknown[]) => {
    out.order.push(`dispatch:${pending.length}`);
  };
  flagModule.flagService.notifyReporters = (flags: any[], mail: any) => {
    out.order.push("mail");
    out.mailed.push({ count: flags.length, mail });
  };
  auditModule.auditService.record = async (_tx: unknown, input: any) => {
    out.audits.push(input);
    return "audit-id";
  };
  return out;
}

test("approve: publishes, pins the human-reviewed version, approves the files shown in full, dismisses flags", async () => {
  const out = wireOutcome({ flags: [{ id: "f1", reporter_id: "m1" }] });
  const result = await moderationAdminService.approveCase(ADMIN, CASE, {
    internalNote: "Quoted threat, reported not made.",
    // The two sealed files the console rendered, plus an id that is not a
    // sealed file of this report (another report's, or still uploading).
    evidenceIds: ["e-sealed-1", "e-sealed-2", "e-elsewhere"],
  });

  assert.equal(result.resolution, "approved");
  assert.equal(result.targetState, "approved");
  assert.equal(result.firstPublish, true);
  assert.equal(result.evidenceApproved, 2);
  assert.equal(result.flagsResolved, 1);

  const patch = out.reportPatches[0];
  assert.equal(patch.moderation_state, "approved");
  assert.equal(patch.human_reviewed_version, 3, "D8: this version can never be auto-hidden again");
  assert.equal(patch.approved_content_version, 3);
  assert.equal(typeof patch.published_at, "string");
  assert.equal(typeof patch.moderated_at, "string");
  assert.equal(patch.moderation_reason, null);

  // Only the sealed files the moderator was shown are approved, at full scope (R5, Q6).
  assert.deepEqual(out.approvals, [{ reportId: REPORT, ids: ["e-sealed-1", "e-sealed-2"], scope: "full" }]);
  assert.deepEqual(out.enqueued, [], "nothing left pending, so no evidence run");
  assert.deepEqual(out.flagOutcomes, [
    { targetType: "report", status: "dismissed", resolution: "No action needed.", resolvedBy: ADMIN.id },
  ]);

  assert.equal(out.notifications.length, 1);
  assert.equal(out.notifications[0].title, "Your report is live");
  assert.equal(out.notifications[0].userId, AUTHOR);

  const audit = out.audits[0];
  assert.equal(audit.action, "moderation.approve");
  assert.equal(audit.note, "Quoted threat, reported not made.");
  assert.deepEqual(audit.metadata.before, { moderationState: "held", status: "submitted" });
  assert.deepEqual(audit.metadata.after, { moderationState: "approved", status: "submitted" });
  assert.equal(audit.metadata.firstPublish, true);

  // The case is resolved inside the transaction; the push and the emails leave after it.
  assert.deepEqual(out.order, ["tx:start", "resolveCase:approved", "cancelQueued", "tx:commit", "dispatch:1", "mail"]);
  assert.equal(out.mailed[0].mail.outcome, "No action needed");
});

test("approve: keeping a published report up tells the author nothing, and is not a first publish", async () => {
  const out = wireOutcome({ report: { moderation_state: "approved", published_at: "2026-09-01T10:00:00.000Z" } });
  const result = await moderationAdminService.approveCase(ADMIN, CASE, {});
  assert.equal(result.firstPublish, false);
  assert.equal(out.notifications.length, 0);
  assert.equal(out.reportPatches[0].published_at, "2026-09-01T10:00:00.000Z", "published_at is never moved (D11)");
  assert.deepEqual(out.audits[0].metadata.before, { moderationState: "approved", status: "submitted" });
});

test("approve: a report that had been live and was held comes back as 'live again'", async () => {
  const out = wireOutcome({ report: { moderation_state: "held", published_at: "2026-09-01T10:00:00.000Z" } });
  await moderationAdminService.approveCase(ADMIN, CASE, {});
  assert.equal(out.notifications[0].title, "Your report is live again");
});

test("approve on a comment: approveComment (counter + reply notice), no evidence, flags dismissed", async () => {
  const out = wireOutcome({ caseRow: { target_type: "comment", target_id: COMMENT, comment_id: COMMENT } });
  const result = await moderationAdminService.approveCase(ADMIN, CASE, {});
  assert.equal(result.targetType, "comment");
  assert.ok(out.order.includes("approveComment"));
  assert.deepEqual(out.approvals, []);
  assert.deepEqual(out.reportPatches, []);
  assert.equal(out.flagOutcomes[0].targetType, "comment");
  assert.equal(out.flagOutcomes[0].status, "dismissed");
});

test("reject: the report is not published, with the code and the note the author reads", async () => {
  const out = wireOutcome({
    flags: [
      { id: "f1", reporter_id: "m1" },
      { id: "f2", reporter_id: "m2" },
    ],
  });
  const result = await moderationAdminService.rejectCase(ADMIN, CASE, {
    reasonCode: "private_info",
    publicNote: "  Remove the officer's home street and resubmit.  ",
    internalNote: "Street name in paragraph 2.",
  });
  assert.equal(result.targetState, "rejected");
  const patch = out.reportPatches[0];
  assert.equal(patch.moderation_state, "rejected");
  assert.equal(patch.moderation_reason, "private_info");
  assert.equal(patch.moderation_note, "Remove the officer's home street and resubmit.");
  // Review Q7: no version stands approved after a human refused it — the
  // durable record that the next automated path must hold for a human.
  assert.equal(patch.approved_content_version, null);
  assert.equal(out.notifications[0].title, "Your report wasn't published");
  assert.equal(
    out.notifications[0].body,
    "Reason: Exposes private details. Remove the officer's home street and resubmit. Open it to see why and what you can do next.",
  );
  assert.deepEqual(out.flagOutcomes[0], {
    targetType: "report",
    status: "resolved",
    resolution: "Action taken.",
    resolvedBy: ADMIN.id,
  });
  assert.equal(out.audits[0].reasonCode, "private_info");
  assert.equal(out.audits[0].note, "Street name in paragraph 2.");
  assert.deepEqual(out.audits[0].metadata.after, { moderationState: "rejected", status: "submitted" });
  assert.equal(out.mailed[0].count, 2);
  assert.equal(out.mailed[0].mail.outcome, "Action taken");
});

test("reject on a comment: removed through setCommentState, and its author told why", async () => {
  const out = wireOutcome({ caseRow: { target_type: "comment", target_id: COMMENT, comment_id: COMMENT } });
  await moderationAdminService.rejectCase(ADMIN, CASE, {
    reasonCode: "harassment",
    publicNote: "Please keep it about the incident.",
  });
  assert.deepEqual(out.commentStates, [{ commentId: COMMENT, moderationState: "rejected", moderationReason: "harassment" }]);
  assert.equal(out.notifications.length, 1);
  const notice = out.notifications[0];
  assert.equal(notice.type, "moderation_notice");
  assert.equal(notice.title, "Your comment was removed");
  assert.equal(notice.userId, COMMENTER);
  assert.match(notice.body, /^Reason: Harassment\. Please keep it about the incident\. A moderator removed/);
  assert.equal(notice.link, "/r/BNX-4471/comments");
});

test("hide a file: rejected with no scope, the case left open for the rest", async () => {
  const out = wireOutcome({});
  const patches: any[] = [];
  reportModels.ReportEvidence.findOne = async () => ({
    id: "e1",
    kind: "photo",
    moderation_state: "approved",
    approved_scope: "thumbnail",
    update: async (patch: any) => {
      patches.push(patch);
    },
  });
  const result = await moderationAdminService.rejectEvidence(ADMIN, CASE, "e1", { reasonCode: "graphic" });
  assert.deepEqual(result, { caseId: CASE, evidenceId: "e1", moderationState: "rejected", approvedScope: null });
  assert.deepEqual(patches, [{ moderation_state: "rejected", approved_scope: null }]);
  assert.ok(!out.order.some((step) => step.startsWith("resolveCase")), "the case stays open");
  assert.equal(out.audits[0].action, "evidence.reject");
  assert.deepEqual(out.audits[0].metadata.before, { moderationState: "approved", approvedScope: "thumbnail" });
});

test("re-run: queued in the transaction, the worker woken only after the commit", async () => {
  const out = wireOutcome({});
  pipelineModule.requestRerun = async () => {
    out.order.push("requestRerun");
    return { ok: true, runId: "run-1" };
  };
  signalModule.pokeModeration = () => {
    out.order.push("poke");
  };
  const result = await moderationAdminService.rerunCase(ADMIN, CASE);
  assert.deepEqual(result, { caseId: CASE, runId: "run-1" });
  assert.deepEqual(out.order, ["tx:start", "requestRerun", "tx:commit", "poke"]);
});

test("re-run: a deactivated report, or something not held, is 409", async () => {
  wireOutcome({ report: { moderation_state: "deactivated" } });
  await assert.rejects(moderationAdminService.rerunCase(ADMIN, CASE), (err: unknown) => (err as { status?: number }).status === 409);
  wireOutcome({ report: { moderation_state: "approved" } });
  pipelineModule.requestRerun = async () => ({ ok: false, reason: "not_held" });
  await assert.rejects(
    moderationAdminService.rerunCase(ADMIN, CASE),
    (err: unknown) => (err as { status?: number }).status === 409 && /held/.test((err as Error).message),
  );
});

test("ban: banned, every session revoked, audited with before and after", async () => {
  const audits: any[] = [];
  const patches: any[] = [];
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => work({ LOCK: { UPDATE: "UPDATE" } });
  appModels.AppUser.findByPk = async () => ({
    id: AUTHOR,
    status: "active",
    update: async (patch: any) => {
      patches.push(patch);
    },
  });
  appModels.AppUser.findAll = async () => [{ id: AUTHOR, email: "author@x.org" }];
  adminModels.AdminUser.findByPk = async () => ({ id: ADMIN.id, email: ADMIN.email });
  const sessionUpdates: any[] = [];
  appModels.UserSession.update = async (values: any, options: any) => {
    sessionUpdates.push({ values, where: options.where });
    return [2];
  };
  auditModule.auditService.record = async (_tx: unknown, input: any) => {
    audits.push(input);
    return "audit-id";
  };

  const result = await moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "repeat" });
  assert.deepEqual(result, { memberId: AUTHOR, status: "banned", sessionsRevoked: 2 });
  assert.deepEqual(patches, [{ status: "banned" }]);
  assert.deepEqual(sessionUpdates[0].where, { user_id: AUTHOR, revoked_at: null });
  assert.equal(typeof sessionUpdates[0].values.revoked_at, "string");
  assert.equal(audits[0].action, "member.ban");
  assert.equal(audits[0].reasonCode, "repeat");
  assert.deepEqual(audits[0].metadata.before, { status: "active" });
  assert.deepEqual(audits[0].metadata.after, { status: "banned" });

  appModels.AppUser.findByPk = async () => ({ id: AUTHOR, status: "banned", update: async () => undefined });
  await assert.rejects(
    moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "repeat" }),
    (err: unknown) => (err as { status?: number }).status === 409,
  );
});

// ── Schemas: reasons at the edge (§3.3) ──────────────────────────────────────

const JOI_OPTIONS = { abortEarly: false, stripUnknown: true, convert: true, allowUnknown: false };
function modBody(name: string, value: unknown): { value: any; error?: { message: string } } {
  return (moderationSchemas as any)[name].body.validate(value, JOI_OPTIONS);
}

test("schemas: reject takes the eight policy codes, and `other` needs the note the author reads", () => {
  assert.equal(modBody("moderation.reject", { reasonCode: "spam" }).error, undefined);
  assert.match(modBody("moderation.reject", { reasonCode: "duplicate" }).error?.message ?? "", /rejection reasons/);
  assert.match(modBody("moderation.reject", {}).error?.message ?? "", /Choose a reason/);
  assert.match(modBody("moderation.reject", { reasonCode: "other", publicNote: "  " }).error?.message ?? "", /Other/);
  assert.equal(modBody("moderation.reject", { reasonCode: "other", publicNote: "Explained." }).error, undefined);
  assert.ok(modBody("moderation.reject", { reasonCode: "spam", publicNote: "x".repeat(513) }).error);
});

test("schemas: ban takes the ban catalogue, `other` needs a note; a case link is optional", () => {
  assert.equal(modBody("moderation.ban", { reasonCode: "repeat", caseId: CASE }).error, undefined);
  assert.match(modBody("moderation.ban", { reasonCode: "misleading" }).error?.message ?? "", /ban reasons/);
  assert.match(modBody("moderation.ban", { reasonCode: "other" }).error?.message ?? "", /Other/);
});

test("schemas: the queue defaults to open cases by priority, 25 a page", () => {
  const list = (moderationSchemas as any)["moderation.caseList"].query;
  const { value, error } = list.validate({}, JOI_OPTIONS);
  assert.equal(error, undefined);
  assert.deepEqual(value, { page: 1, limit: 25, tab: "all", state: "open", sort: "priority" });
  assert.ok(list.validate({ limit: 101 }, JOI_OPTIONS).error);
  assert.ok(list.validate({ tab: "violence" }, JOI_OPTIONS).error);
  assert.equal(list.validate({ tab: "graphic", urgent: "true" }, JOI_OPTIONS).value.urgent, true);
});

test("schemas: keyword-rule updates need at least one field; terms are 1–50 of 2–80 characters", () => {
  assert.match(modBody("moderation.ruleUpdate", {}).error?.message ?? "", /at least one field/);
  assert.equal(modBody("moderation.ruleCreate", { name: "Scam links", category: "spam", terms: ["buy now*"] }).error, undefined);
  assert.ok(modBody("moderation.ruleCreate", { name: "Scam links", category: "spam", terms: [] }).error);
  assert.ok(modBody("moderation.ruleCreate", { name: "Scam links", category: "spam", terms: ["x"] }).error);
  assert.ok(modBody("moderation.ruleCreate", { name: "Scam links", category: "violence", terms: ["buy now"] }).error);
});

// ── Review Q6: approve releases only the files the moderator was shown ───────

test("review Q6: without evidenceIds no file is approved, and what is still pending gets its own evidence run", async () => {
  const out = wireOutcome({ pendingLeft: 2 });
  const result = await moderationAdminService.approveCase(ADMIN, CASE, { contentVersion: 3 });
  assert.equal(result.evidenceApproved, 0);
  assert.deepEqual(out.approvals, [{ reportId: REPORT, ids: [], scope: "full" }], "no list, nothing released");
  assert.equal(out.enqueued.length, 1);
  const run = out.enqueued[0];
  assert.deepEqual(
    {
      targetType: run.targetType,
      targetId: run.targetId,
      reportId: run.reportId,
      contentVersion: run.contentVersion,
      trigger: run.trigger,
      priority: run.priority,
    },
    { targetType: "report", targetId: REPORT, reportId: REPORT, contentVersion: 3, trigger: "evidence", priority: 0 },
  );
  // Queued after the case's queued runs are withdrawn (so it is not withdrawn
  // with them), in the transaction; the worker is woken only after the commit.
  assert.deepEqual(out.order, [
    "tx:start",
    "resolveCase:approved",
    "cancelQueued",
    "enqueue:evidence",
    "tx:commit",
    "dispatch:1",
    "mail",
    "poke",
  ]);
  assert.equal(out.audits[0].metadata.evidenceShown, 0);
  assert.equal(out.audits[0].metadata.evidenceRecheckQueued, true);
});

test("review Q6: Keep Published re-queues the check for a file sealed after the render instead of approving it", async () => {
  // Live report, a flag case open; the owner sealed a second photo after the
  // moderator opened the case. The console sends only the file it rendered.
  const out = wireOutcome({
    report: { moderation_state: "approved", published_at: "2026-09-01T10:00:00.000Z", urgent: true },
    pendingLeft: 1,
  });
  const result = await moderationAdminService.approveCase(ADMIN, CASE, { contentVersion: 3, evidenceIds: ["e-sealed-1"] });
  assert.equal(result.evidenceApproved, 1);
  assert.deepEqual(out.approvals[0].ids, ["e-sealed-1"], "the unseen photo is not approved");
  assert.equal(out.enqueued.length, 1);
  assert.equal(out.enqueued[0].trigger, "evidence");
  // An urgent report keeps its priority and short budget (R2).
  assert.equal(out.enqueued[0].priority, 100);
  assert.equal(out.enqueued[0].maxAttempts, env.moderation.urgentMaxAttempts);
});

test("review Q6: a private report's leftover files are never queued for the AI (D3)", async () => {
  const out = wireOutcome({ report: { visibility: "private" }, pendingLeft: 1 });
  await moderationAdminService.approveCase(ADMIN, CASE, {});
  assert.deepEqual(out.enqueued, []);
  assert.ok(!out.order.includes("poke"));
});

test("schemas: approve takes up to 50 distinct file ids (review Q6)", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  assert.equal(modBody("moderation.approve", {}).error, undefined, "optional — absent means no file");
  assert.deepEqual(modBody("moderation.approve", { evidenceIds: [id(1), id(2)] }).value.evidenceIds, [id(1), id(2)]);
  assert.equal(modBody("moderation.approve", { evidenceIds: [] }).error, undefined);
  assert.match(
    modBody("moderation.approve", { evidenceIds: Array.from({ length: 51 }, (_, i) => id(i)) }).error?.message ?? "",
    /at most 50/,
  );
  assert.match(modBody("moderation.approve", { evidenceIds: [id(1), id(1)] }).error?.message ?? "", /listed twice/);
  assert.match(modBody("moderation.approve", { evidenceIds: ["e-sealed-1"] }).error?.message ?? "", /not a valid id/);
});

// ── Review Q3: a report's files are the report's, whichever case is used ─────

test("review Q3: hiding a report's file through a comment case is refused to a moderator who flagged the report", async () => {
  const out = wireOutcome({ caseRow: { target_type: "comment", target_id: COMMENT, comment_id: COMMENT } });
  const MOD_MEMBER = "66666666-6666-4666-8666-666666666666";
  const asked: string[] = [];
  sequelize.query = async (sql: string, options: any = {}) => {
    // The comment's own flaggers: nobody. The report's flaggers: the moderator's member account.
    if (/f\.comment_id IS NULL/.test(sql) && options.replacements?.reportId === REPORT) {
      asked.push("report-flaggers");
      return [{ reporter_id: MOD_MEMBER }];
    }
    asked.push("case-flaggers");
    return [];
  };
  appModels.AppUser.findAll = async () => [
    { id: AUTHOR, email: "author@x.org" },
    { id: MOD_MEMBER, email: "Mod+member@blacknexa.org" },
  ];
  const patches: any[] = [];
  reportModels.ReportEvidence.findOne = async () => ({
    id: "e1",
    kind: "photo",
    moderation_state: "approved",
    approved_scope: "full",
    update: async (patch: any) => patches.push(patch),
  });

  await assert.rejects(
    moderationAdminService.rejectEvidence(ADMIN, CASE, "e1", {}),
    (err: any) => err.status === 403 && /flagged this yourself/.test(err.message),
  );
  assert.deepEqual(asked, ["case-flaggers", "report-flaggers"]);
  assert.deepEqual(patches, [], "nothing hidden");
  assert.equal(out.audits.length, 1);
  assert.equal(out.audits[0].action, "self_action.refused");
  assert.equal(out.audits[0].reasonCode, "flagger");
  assert.equal(out.audits[0].metadata.attemptedAction, "evidence.reject");
});

// ── Review Q5 / Q2: member enforcement ───────────────────────────────────────

interface BanWorld {
  order: string[];
  audits: any[];
  memberPatches: any[];
  sql: Array<{ sql: string; replacements: any }>;
  enqueued: any[];
  recounts: string[];
}

function wireBan(options: {
  memberStatus?: string;
  caseRow?: Record<string, unknown>;
  reportAuthor?: string | null;
  answer?: (sql: string) => unknown[] | undefined;
}): BanWorld {
  const world: BanWorld = { order: [], audits: [], memberPatches: [], sql: [], enqueued: [], recounts: [] };
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => {
    world.order.push("tx:start");
    const result = await work({ LOCK: { UPDATE: "UPDATE", NO_KEY_UPDATE: "NO KEY UPDATE" } });
    world.order.push("tx:commit");
    return result;
  };
  caseModule.moderationCaseService.findById = async () => ({
    id: CASE,
    target_type: "report",
    target_id: REPORT,
    report_id: REPORT,
    comment_id: null,
    state: "resolved",
    ...options.caseRow,
  });
  const report = {
    id: REPORT,
    user_id: options.reportAuthor === undefined ? "someone-else" : options.reportAuthor,
    moderation_state: "approved",
    visibility: "public",
    urgent: false,
    content_version: 4,
  };
  reportModels.Report.findByPk = async (_id: string, opts: any = {}) => {
    if (opts.lock) world.order.push(`report:${opts.lock}`);
    return report;
  };
  appModels.AppUser.findByPk = async () => ({
    id: AUTHOR,
    status: options.memberStatus ?? "active",
    update: async (patch: any) => world.memberPatches.push(patch),
  });
  appModels.AppUser.findAll = async () => [{ id: AUTHOR, email: "author@x.org" }];
  appModels.UserSession.update = async () => [1];
  adminModels.AdminUser.findByPk = async () => ({ id: ADMIN.id, email: ADMIN.email });
  sequelize.query = async (sql: string, opts: any = {}) => {
    world.sql.push({ sql, replacements: opts.replacements });
    return options.answer?.(sql) ?? [];
  };
  caseModule.moderationCaseService.findOpenCase = async (_tx: unknown, _type: string, _id: string, opts: any = {}) => {
    world.order.push(`case:${opts.lock ? "lock" : "none"}`);
    return { id: "case-flags", target_type: "report", target_id: REPORT, report_id: REPORT };
  };
  caseModule.moderationCaseService.recountFlagSignals = async (_tx: unknown, row: any) => {
    world.order.push("recount");
    world.recounts.push(row.id);
    return row;
  };
  reportModels.ReportEvidence.count = async () => 1;
  enqueueModule.enqueueRun = async (_tx: unknown, input: any) => {
    world.enqueued.push(input);
    return "run-evidence";
  };
  signalModule.pokeModeration = () => {
    world.order.push("poke");
  };
  auditModule.auditService.record = async (_tx: unknown, input: any) => {
    world.audits.push(input);
    return "audit-id";
  };
  return world;
}

test("review Q5: a ban's caseId must be a case about that member, or it is 400 and nothing is written", async () => {
  const world = wireBan({ reportAuthor: "someone-else" });
  await assert.rejects(
    moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "spam", caseId: CASE }),
    (err: any) => err.status === 400 && /not about this member/.test(err.message),
  );
  assert.deepEqual(world.memberPatches, []);
  assert.equal(world.audits.length, 0);
});

test("review Q5: the case's author — or one of its flaggers — may be banned or unbanned from it, and the row links it", async () => {
  // The author of the case's report.
  let world = wireBan({ reportAuthor: AUTHOR });
  await moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "spam", caseId: CASE });
  const ban = world.audits.find((row) => row.action === "member.ban");
  assert.equal(ban.caseId, CASE);
  assert.equal(ban.reportId, REPORT);

  // A member who flagged on the case (the brigader), unbanned from it.
  world = wireBan({
    memberStatus: "banned",
    reportAuthor: "someone-else",
    answer: (sql) => (/f\.case_id = :caseId/.test(sql) ? [{ reporter_id: AUTHOR }] : undefined),
  });
  await moderationAdminService.unbanMember(ADMIN, AUTHOR, { caseId: CASE });
  assert.equal(world.audits.find((row) => row.action === "member.unban").caseId, CASE);

  // A comment case is about the comment's author.
  world = wireBan({ caseRow: { target_type: "comment", target_id: COMMENT, comment_id: COMMENT } });
  socialModels.ReportComment.findByPk = async () => ({ id: COMMENT, user_id: AUTHOR });
  await moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "harassment", caseId: CASE });
  assert.equal(world.audits.find((row) => row.action === "member.ban").caseId, CASE);
});

const openFlagAnswer =
  (activeLeft: number) =>
  (sql: string): unknown[] | undefined => {
    if (/SELECT DISTINCT report_id, comment_id/.test(sql)) return [{ report_id: REPORT, comment_id: null }];
    if (/UPDATE report_flags/.test(sql)) return [{ id: "flag-1", report_id: REPORT, case_id: "case-flags" }];
    if (/COUNT\(\*\)/.test(sql) && /app_users/.test(sql)) return [{ n: activeLeft }];
    if (/UPDATE moderation_runs/.test(sql)) return [{ id: "run-flagged" }];
    return undefined;
  };

test("review Q2: a ban dismisses the member's open flags in lock order, recounts the case, withdraws the orphaned re-check", async () => {
  const world = wireBan({ answer: openFlagAnswer(0) });
  await moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "spam" });

  const step = (pattern: RegExp) => world.sql.findIndex((entry) => pattern.test(entry.sql));
  // Target row → case → flags, the module's order; then the recount and the re-check.
  assert.deepEqual(world.order.slice(0, 4), ["tx:start", "report:UPDATE", "case:lock", "recount"]);
  assert.ok(step(/UPDATE report_flags/) >= 0);
  assert.ok(step(/UPDATE report_flags/) < step(/UPDATE moderation_runs/));
  const dismiss = world.sql[step(/UPDATE report_flags/)];
  assert.match(dismiss.sql, /SET status = 'dismissed'/);
  assert.match(
    dismiss.sql,
    /reporter_id = :memberId AND status = 'open' AND report_flags\.report_id = :targetId AND report_flags\.comment_id IS NULL/,
  );
  assert.equal(dismiss.replacements.memberId, AUTHOR);
  assert.equal(dismiss.replacements.targetId, REPORT);
  assert.equal(dismiss.replacements.resolvedBy, ADMIN.id);
  assert.deepEqual(world.recounts, ["case-flags"]);
  assert.match(world.sql[step(/UPDATE moderation_runs/)].sql, /"trigger" = 'flagged'/);
  // The withdrawn re-check would have read the report's pending file: it gets its own run.
  assert.equal(world.enqueued.length, 1);
  assert.equal(world.enqueued[0].trigger, "evidence");
  assert.deepEqual(world.order.slice(-2), ["tx:commit", "poke"]);

  const ban = world.audits.find((row) => row.action === "member.ban");
  assert.equal(ban.metadata.flagsDismissed, 1);
  assert.equal(ban.metadata.recheckRunsCancelled, 1);
  const dismissed = world.audits.find((row) => row.action === "flag.dismiss");
  assert.equal(dismissed.targetId, "flag-1");
  assert.equal(dismissed.caseId, "case-flags", "the case History says why its flag count dropped");
  assert.equal(dismissed.reasonCode, "reporter_banned");
});

test("review Q2: a re-check another active member's flag still stands behind is left alone", async () => {
  const world = wireBan({ answer: openFlagAnswer(1) });
  await moderationAdminService.banMember(ADMIN, AUTHOR, { reasonCode: "spam" });
  assert.ok(!world.sql.some((entry) => /UPDATE moderation_runs/.test(entry.sql)));
  assert.deepEqual(world.enqueued, []);
  assert.ok(!world.order.includes("poke"));
  assert.equal(world.audits.find((row) => row.action === "member.ban").metadata.flagsDismissed, 1);
});

test("review Q2: bannedFlagTargets — one entry per target, comment flags on the comment, in a fixed order", () => {
  assert.deepEqual(
    bannedFlagTargets([
      { report_id: "r2", comment_id: "c1" },
      { report_id: "r2", comment_id: null },
      { report_id: null, comment_id: "c0" },
      { report_id: "r1", comment_id: null },
      { report_id: "r2", comment_id: null },
      { report_id: null, comment_id: null },
    ]),
    [
      { targetType: "report", targetId: "r1" },
      { targetType: "report", targetId: "r2" },
      { targetType: "comment", targetId: "c0" },
      { targetType: "comment", targetId: "c1" },
    ],
  );
});

test("review Q2: recountedFlagSignal — count and `user_flags` from what is left; categories rebuilt only on a flag-only case", () => {
  const flagOnly = { ai_flagged: false, keyword_flagged: false, categories: ["threat", "spam"], hold_reasons: ["user_flags"] } as any;
  assert.deepEqual(recountedFlagSignal(flagOnly, ["spam"]), { userFlagCount: 1, categories: ["spam"], holdReasons: ["user_flags"] });
  assert.deepEqual(recountedFlagSignal(flagOnly, []), { userFlagCount: 0, categories: [], holdReasons: [] });
  assert.deepEqual(recountedFlagSignal(flagOnly, ["untrue", "nonsense", "untrue"]).categories, ["misleading", "other"]);
  // An AI or keyword category is never dropped by a flag recount.
  const aiCase = { ai_flagged: true, keyword_flagged: false, categories: ["threat"], hold_reasons: ["ai_violation", "user_flags"] } as any;
  assert.deepEqual(recountedFlagSignal(aiCase, []), { userFlagCount: 0, categories: ["threat"], holdReasons: ["ai_violation"] });
});

test("review Q2: recountFlagSignals takes a brigader's 'threat' off a flag-only case's priority", async () => {
  const writes: any[] = [];
  sequelize.query = async (sql: string, options: any = {}) => {
    if (/SELECT reason FROM report_flags/.test(sql)) return []; // the banned member's flag was the only one
    if (/SELECT EXISTS/.test(sql)) return [{ high: false }];
    if (/UPDATE moderation_cases/.test(sql)) writes.push(options.replacements);
    return [];
  };
  const row: any = {
    id: "case-flags",
    target_type: "report",
    target_id: REPORT,
    ai_flagged: false,
    keyword_flagged: false,
    media_review: false,
    user_flag_count: 1,
    categories: ["threat"],
    hold_reasons: ["user_flags"],
    urgent: false,
    safety_risk: null,
    latest_run_id: "run-1",
    priority: 45,
  };
  const next = await realRecountFlagSignals.call(caseModule.moderationCaseService, {} as any, row);
  assert.equal(next.priority, 0, "40 for the safety category and 5 for the flag, both gone");
  assert.deepEqual(writes, [{ id: "case-flags", userFlagCount: 0, categories: "[]", holdReasons: "[]", priority: 0 }]);
});
