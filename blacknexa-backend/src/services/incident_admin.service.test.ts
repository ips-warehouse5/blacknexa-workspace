/**
 * Unit tests for the Incident Management admin service — `npm test`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §9.1 (list filters, access tiers, decisions),
 * D10 (deactivate / reactivate), D16 (self-dealing), D17 (advocate scope,
 * assignment), D19 (a rejection is never undone by the AI), §3.3 (reasons).
 *
 * The pure helpers — the date window, the list's WHERE clauses with the access
 * tier applied, the SLA rule, author redaction, the workflow buttons, the
 * reactivation plan and the per-tier cut of a detail — are tested directly,
 * because they are where a scope or a redaction would silently regress. The
 * decision paths are tested through their seams (the transaction, the model
 * finders, the case service, the audit and notification writers replaced by
 * stand-ins): what each writes, in what order, and what it refuses.
 *
 * The Joi schemas are checked here too — the reason rules (`other` needs a
 * note) exist at the edge and in the service, and both must hold.
 *
 * Review fixes pinned here: Q4 (deactivation's D16 check covers the flaggers
 * and comment authors of every case it closes), Q7 (a rejection Reactivate
 * sends back stays owed a human check through the next edit and *Re-run AI* —
 * run end to end through the real `awaitsResubmissionCheck`), Q20 (verify
 * assigns an unassigned incident to a moderator/advocate verifier).
 *
 * The service reads the environment, so this file sets what `env.config`
 * requires (a database URL on a closed local port) before loading it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "incadmin-test-access-secret-0123456789abcdef-0123";
process.env.JWT_REFRESH_SECRET = "incadmin-test-refresh-secret-0123456789abcdef-012";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const inc = require("./incident_admin.service") as typeof import("./incident_admin.service");
const guard = require("./admin_guard.service") as typeof import("./admin_guard.service");
const reportTx: any = require("./report_tx");
const caseModule: any = require("./moderation_case.service");
const enqueueModule: any = require("./moderation_enqueue");
const signalModule: any = require("./moderation_signal");
const auditModule: any = require("./audit.service");
const notificationModule: any = require("./notification.service");
const flagModule: any = require("./flag.service");
const reportServiceModule: any = require("./report.service");
const pipelineModule: any = require("./moderation_pipeline.service");
const reportModels: any = require("../models/report.model");
const moderationModels: any = require("../models/moderation.model");
const adminModels: any = require("../models/admin_user.model");
const appModels: any = require("../models/app_user.model");
const sequelize: any = (require("../config/database.config") as typeof import("../config/database.config")).sequelize;
const { incidentSchemas } = require("../validations/incident.validation") as typeof import("../validations/incident.validation");

const {
  incidentDateWindow,
  incidentListWhere,
  isSlaBreached,
  incidentAuthorRef,
  incidentActionsFor,
  reactivationPlan,
  redactIncidentDetail,
  timelineLabel,
  metricsWindow,
  incidentMetricsScope,
  foldActivity,
  foldCategoryStatus,
  incidentAdminService,
} = inc;
const { incidentAccessFor } = guard;

const MODERATOR = incidentAccessFor("moderator");
const ADVOCATE = incidentAccessFor("advocate");
const STAFF = incidentAccessFor("staff");
const NOW = new Date("2026-09-24T15:30:00.000Z");

// ── Date window ──────────────────────────────────────────────────────────────

test("incidentDateWindow: today, week and month are UTC windows ending now", () => {
  assert.deepEqual(incidentDateWindow({ range: "today" }, NOW), { fromIso: "2026-09-24T00:00:00.000Z", toIso: null });
  assert.deepEqual(incidentDateWindow({ range: "week" }, NOW), { fromIso: "2026-09-17T15:30:00.000Z", toIso: null });
  assert.deepEqual(incidentDateWindow({ range: "month" }, NOW), { fromIso: "2026-09-01T00:00:00.000Z", toIso: null });
});

test("incidentDateWindow: a bare date covers that whole UTC day; a date-time is taken as given", () => {
  assert.deepEqual(incidentDateWindow({ from: "2026-09-01", to: "2026-09-02" }, NOW), {
    fromIso: "2026-09-01T00:00:00.000Z",
    toIso: "2026-09-02T23:59:59.999Z",
  });
  assert.deepEqual(incidentDateWindow({ from: "2026-09-01T10:00:00+02:00" }, NOW), {
    fromIso: "2026-09-01T08:00:00.000Z",
    toIso: null,
  });
});

test("incidentDateWindow: range wins over from/to, and nonsense is no bound", () => {
  assert.deepEqual(incidentDateWindow({ range: "today", from: "2020-01-01" }, NOW).fromIso, "2026-09-24T00:00:00.000Z");
  assert.deepEqual(incidentDateWindow({ from: "yesterday" }, NOW), { fromIso: null, toIso: null });
  assert.deepEqual(incidentDateWindow({}, NOW), { fromIso: null, toIso: null });
});

// ── List filters with the access tier applied (§9.1, D17) ────────────────────

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ADMIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("incidentListWhere: every tab but Deactivated excludes deactivated incidents", () => {
  const all = incidentListWhere({ status: "all" }, { access: MODERATOR, adminId: ME, now: NOW });
  assert.deepEqual(all.clauses, ["r.deleted_at IS NULL", "r.moderation_state <> 'deactivated'"]);
  assert.deepEqual(all.replacements, {});

  const verified = incidentListWhere({ status: "verified" }, { access: MODERATOR, adminId: ME, now: NOW });
  assert.deepEqual(verified.clauses, ["r.deleted_at IS NULL", "r.moderation_state <> 'deactivated'", "r.status = :status"]);
  assert.equal(verified.replacements.status, "verified");

  const deactivated = incidentListWhere({ status: "deactivated" }, { access: MODERATOR, adminId: ME, now: NOW });
  assert.deepEqual(deactivated.clauses, ["r.deleted_at IS NULL", "r.moderation_state = 'deactivated'"]);
});

test("incidentListWhere: an advocate is scoped to their own assignments whatever they ask for", () => {
  for (const assignee of [undefined, "unassigned", OTHER_ADMIN, "me"]) {
    const { clauses, replacements } = incidentListWhere(
      { status: "all", assignee },
      { access: ADVOCATE, adminId: ME, now: NOW },
    );
    assert.ok(clauses.includes("r.assigned_admin_id = :adminId"), String(assignee));
    assert.ok(!clauses.includes("r.assigned_admin_id IS NULL"), String(assignee));
    assert.ok(!clauses.includes("r.assigned_admin_id = :assigneeId"), String(assignee));
    assert.equal(replacements.adminId, ME);
  }
});

test("incidentListWhere: other tiers may ask for me, unassigned or one admin", () => {
  const ctx = { access: MODERATOR, adminId: ME, now: NOW };
  assert.ok(incidentListWhere({ status: "all", assignee: "me" }, ctx).clauses.includes("r.assigned_admin_id = :adminId"));
  assert.ok(incidentListWhere({ status: "all", assignee: "unassigned" }, ctx).clauses.includes("r.assigned_admin_id IS NULL"));
  const one = incidentListWhere({ status: "all", assignee: OTHER_ADMIN }, ctx);
  assert.ok(one.clauses.includes("r.assigned_admin_id = :assigneeId"));
  assert.equal(one.replacements.assigneeId, OTHER_ADMIN);
  assert.ok(!incidentListWhere({ status: "all" }, ctx).clauses.some((c) => c.includes("assigned_admin_id")));
});

test("incidentListWhere: category, dates, publication chip and urgent become clauses", () => {
  const { clauses, replacements } = incidentListWhere(
    { status: "all", category: "other", range: "today", moderation: "held", urgent: false },
    { access: MODERATOR, adminId: ME, now: NOW },
  );
  assert.ok(clauses.includes("r.category = :category"));
  assert.ok(clauses.includes("r.filed_at >= :fromIso"));
  assert.ok(!clauses.includes("r.filed_at <= :toIso"));
  assert.ok(clauses.includes("r.moderation_state = :moderation"));
  assert.ok(clauses.includes("r.urgent = :urgent"));
  assert.deepEqual(
    { category: replacements.category, fromIso: replacements.fromIso, moderation: replacements.moderation, urgent: replacements.urgent },
    { category: "other", fromIso: "2026-09-24T00:00:00.000Z", moderation: "held", urgent: false },
  );
});

test("incidentListWhere: search reaches anonymous authors only for tiers that may know who filed", () => {
  const search = (access: typeof MODERATOR) =>
    incidentListWhere({ status: "all", search: "  Jane_D  " }, { access, adminId: ME, now: NOW });

  const moderator = search(MODERATOR);
  assert.equal(
    moderator.clauses[moderator.clauses.length - 1],
    "(r.case_ref ILIKE :search OR r.title ILIKE :search OR r.location_label ILIKE :search OR (u.display_name ILIKE :search) OR (u.email ILIKE :search))",
  );
  assert.equal(moderator.replacements.search, "%Jane\\_D%");

  // An advocate sees emails of named authors, but never matches an anonymous one.
  const advocate = search(ADVOCATE);
  assert.match(advocate.clauses[advocate.clauses.length - 1], /\(r\.anonymous = false AND u\.display_name ILIKE :search\)/);
  assert.match(advocate.clauses[advocate.clauses.length - 1], /\(r\.anonymous = false AND u\.email ILIKE :search\)/);

  // Staff never search by email at all.
  const staff = search(STAFF);
  assert.doesNotMatch(staff.clauses[staff.clauses.length - 1], /u\.email/);
  assert.match(staff.clauses[staff.clauses.length - 1], /r\.anonymous = false AND u\.display_name/);

  const blank = incidentListWhere({ status: "all", search: "   " }, { access: MODERATOR, adminId: ME, now: NOW });
  assert.equal(blank.replacements.search, undefined);
});

// ── SLA, author, actions ─────────────────────────────────────────────────────

test("isSlaBreached: urgent, still submitted, unassigned and older than the SLA — nothing less", () => {
  const base = { urgent: true, status: "submitted", assignedAdminId: null, filedAt: "2026-09-24T14:00:00.000Z" };
  assert.equal(isSlaBreached(base, NOW, 60), true);
  assert.equal(isSlaBreached({ ...base, urgent: false }, NOW, 60), false);
  assert.equal(isSlaBreached({ ...base, status: "under_review" }, NOW, 60), false);
  assert.equal(isSlaBreached({ ...base, assignedAdminId: OTHER_ADMIN }, NOW, 60), false);
  assert.equal(isSlaBreached({ ...base, filedAt: "2026-09-24T15:00:00.000Z" }, NOW, 60), false);
  assert.equal(isSlaBreached({ ...base, filedAt: "not a date" }, NOW, 60), false);
});

test("incidentAuthorRef: anonymous authors are named only for tiers with anonymous identity", () => {
  const row = { userId: "u1", displayName: "Jane Doe", anonymous: true };
  assert.deepEqual(incidentAuthorRef(row, MODERATOR), { id: "u1", displayName: "Jane Doe", anonymous: true, identityHidden: false });
  for (const access of [ADVOCATE, STAFF]) {
    assert.deepEqual(incidentAuthorRef(row, access), { id: null, displayName: "Anonymous", anonymous: true, identityHidden: true });
  }
  assert.deepEqual(incidentAuthorRef({ ...row, anonymous: false }, STAFF), {
    id: "u1",
    displayName: "Jane Doe",
    anonymous: false,
    identityHidden: false,
  });
  assert.equal(incidentAuthorRef({ userId: null, displayName: null, anonymous: false }, MODERATOR), null);
});

test("incidentActionsFor: the case verdict moves only on published incidents", () => {
  assert.deepEqual(incidentActionsFor({ status: "submitted", moderationState: "approved" }), {
    verify: true,
    dismiss: true,
    reopen: false,
    deactivate: true,
    reactivate: false,
    assign: true,
    resolveModerationFirst: false,
  });
  assert.deepEqual(incidentActionsFor({ status: "dismissed", moderationState: "approved" }), {
    verify: false,
    dismiss: false,
    reopen: true,
    deactivate: true,
    reactivate: false,
    assign: true,
    resolveModerationFirst: false,
  });
  for (const moderationState of ["pending", "held", "rejected"]) {
    const actions = incidentActionsFor({ status: "submitted", moderationState });
    assert.equal(actions.verify, false, moderationState);
    assert.equal(actions.dismiss, false, moderationState);
    assert.equal(actions.resolveModerationFirst, true, moderationState);
    assert.equal(actions.deactivate, true, moderationState);
  }
  const deactivated = incidentActionsFor({ status: "verified", moderationState: "deactivated" });
  assert.equal(deactivated.deactivate, false);
  assert.equal(deactivated.reactivate, true);
  assert.equal(deactivated.resolveModerationFirst, false);
});

// ── Reactivation (D10, D19, D3) ──────────────────────────────────────────────

test("reactivationPlan: approved only when it was approved and the content is unchanged", () => {
  assert.deepEqual(reactivationPlan({ preState: "approved", preVersion: 2, contentVersion: 2, moderated: true }), { state: "approved" });
  assert.deepEqual(reactivationPlan({ preState: "approved", preVersion: 2, contentVersion: 3, moderated: true }), {
    state: "pending",
    trigger: "manual",
  });
  for (const preState of ["pending", "held", null, undefined]) {
    assert.deepEqual(reactivationPlan({ preState, preVersion: 2, contentVersion: 2, moderated: true }), {
      state: "pending",
      trigger: "manual",
    });
  }
});

test("reactivationPlan: a human rejection goes back as a resubmission, never to the AI alone (D19)", () => {
  assert.deepEqual(reactivationPlan({ preState: "rejected", preVersion: 2, contentVersion: 2, moderated: true }), {
    state: "pending",
    trigger: "resubmitted",
  });
});

test("reactivationPlan: a private report is approved outright and never queued (D3)", () => {
  assert.deepEqual(reactivationPlan({ preState: "rejected", preVersion: 1, contentVersion: 4, moderated: false }), {
    state: "approved",
  });
});

// ── Per-tier redaction of the detail (§9.1) ──────────────────────────────────

function fullDetail(overrides: { anonymous?: boolean } = {}): any {
  return {
    access: MODERATOR,
    report: {
      id: "r1",
      body: "The full account.",
      bodyUnreadable: false,
      contentRedacted: false,
      location: { label: "Brownsville", precision: "approximate", lat: 40.66, lng: -73.91, exactLat: 40.6636, exactLng: -73.9107 },
      evidence: [{ id: "e1", sha256: "abc" }],
    },
    author: {
      id: "u1",
      displayName: "Jane Doe",
      anonymous: Boolean(overrides.anonymous),
      identityHidden: false,
      email: "jane@x.org",
      status: "active",
      memberSince: "2026-01-01T00:00:00.000Z",
    },
    notes: [],
  };
}

test("redactIncidentDetail: superadmin and moderator see everything", () => {
  const detail = fullDetail({ anonymous: true });
  const cut = redactIncidentDetail(detail, MODERATOR);
  assert.equal(cut.report.body, "The full account.");
  assert.equal(cut.report.location.exactLat, 40.6636);
  assert.equal(cut.author?.email, "jane@x.org");
  assert.equal(cut.author?.id, "u1");
  assert.equal(cut.report.contentRedacted, false);
});

test("redactIncidentDetail: staff get metadata only — no body, no exact location, no author email", () => {
  const detail = fullDetail();
  const cut = redactIncidentDetail(detail, STAFF);
  assert.equal(cut.report.body, null);
  assert.equal(cut.report.bodyUnreadable, false);
  assert.equal(cut.report.contentRedacted, true);
  assert.equal(cut.report.location.exactLat, null);
  assert.equal(cut.report.location.exactLng, null);
  assert.equal(cut.report.location.lat, 40.66, "the rounded, servable point stays");
  assert.equal(cut.author?.email, null);
  assert.equal(cut.author?.displayName, "Jane Doe");
  assert.equal(cut.access.tier, "metadata");
  // The input is not mutated — the full detail could be reused.
  assert.equal(detail.report.body, "The full account.");
  assert.equal(detail.report.location.exactLat, 40.6636);
  assert.equal(detail.author.email, "jane@x.org");
});

test("redactIncidentDetail: an anonymous author is 'Anonymous' for tiers without anonymous identity", () => {
  for (const access of [ADVOCATE, STAFF]) {
    const cut = redactIncidentDetail(fullDetail({ anonymous: true }), access);
    assert.deepEqual(cut.author, {
      id: null,
      displayName: "Anonymous",
      anonymous: true,
      identityHidden: true,
      email: null,
      status: null,
      memberSince: null,
    });
  }
  // An advocate keeps the body and a named author's email.
  const advocate = redactIncidentDetail(fullDetail(), ADVOCATE);
  assert.equal(advocate.report.body, "The full account.");
  assert.equal(advocate.author?.email, "jane@x.org");
});

test("timelineLabel: reads the before/after publication state the writers record", () => {
  assert.equal(timelineLabel("moderation.approve", { before: { moderationState: "held" }, after: { moderationState: "approved" } }), "Approved and published by a moderator");
  assert.equal(timelineLabel("moderation.approve", { before: { moderationState: "approved" }, after: { moderationState: "approved" } }), "Kept published by a moderator");
  assert.equal(timelineLabel("moderation.reject", { before: { moderationState: "approved" } }), "Rejected and taken down by a moderator");
  assert.equal(timelineLabel("incident.reactivate", { after: { moderationState: "approved" } }), "Reactivated and published again");
  assert.equal(timelineLabel("incident.reactivate", { after: { moderationState: "pending" } }), "Reactivated and sent back for a check");
  assert.equal(timelineLabel("status.verified", null), "Marked verified");
  assert.equal(timelineLabel("something.new", null), "something.new");
});

// ── Schemas: reasons and inputs at the edge (§3.3) ───────────────────────────

const JOI_OPTIONS = { abortEarly: false, stripUnknown: true, convert: true, allowUnknown: false };
function body(name: string, value: unknown): { value: any; error?: { message: string } } {
  return (incidentSchemas as any)[name].body.validate(value, JOI_OPTIONS);
}

test("schemas: dismiss and deactivate take their own catalogue, and `other` needs the public note", () => {
  assert.equal(body("incident.dismiss", { reasonCode: "duplicate" }).error, undefined);
  assert.match(body("incident.dismiss", { reasonCode: "legal" }).error?.message ?? "", /dismissal reasons/);
  assert.match(body("incident.dismiss", { reasonCode: "other" }).error?.message ?? "", /Other/);
  assert.match(body("incident.dismiss", { reasonCode: "other", publicNote: "   " }).error?.message ?? "", /Other/);
  assert.equal(body("incident.dismiss", { reasonCode: "other", publicNote: " Explained. " }).value.publicNote, "Explained.");

  assert.equal(body("incident.deactivate", { reasonCode: "legal" }).error, undefined);
  assert.match(body("incident.deactivate", { reasonCode: "duplicate" }).error?.message ?? "", /deactivation reasons/);
  assert.match(body("incident.deactivate", { reasonCode: "other", publicNote: "" }).error?.message ?? "", /Other/);
});

test("schemas: reopen needs a note; assign takes an admin id or null; notes are 1–2000 characters", () => {
  assert.match(body("incident.reopen", { note: "   " }).error?.message ?? "", /reopened/);
  assert.equal(body("incident.reopen", { note: "New evidence arrived." }).error, undefined);
  assert.equal(body("incident.assign", { adminId: null }).error, undefined);
  assert.equal(body("incident.assign", { adminId: OTHER_ADMIN }).error, undefined);
  assert.match(body("incident.assign", {}).error?.message ?? "", /unassign/);
  assert.match(body("incident.note", { body: "  " }).error?.message ?? "", /Write the note/);
  assert.match(body("incident.note", { body: "x".repeat(2001) }).error?.message ?? "", /2,000/);
});

test("schemas: the list keeps bare dates as sent and refuses an unknown assignee", () => {
  const list = (incidentSchemas as any)["incident.list"].query;
  const ok = list.validate({ from: "2026-09-01", to: "2026-09-02", assignee: "me", category: "other" }, JOI_OPTIONS);
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.to, "2026-09-02", "not rewritten to midnight");
  assert.equal(ok.value.status, "all");
  assert.equal(ok.value.sort, "newest");
  assert.ok(list.validate({ from: "yesterday" }, JOI_OPTIONS).error);
  assert.ok(list.validate({ assignee: "bob" }, JOI_OPTIONS).error);
  assert.ok(list.validate({ status: "published" }, JOI_OPTIONS).error);
});

// ── Decisions through the seams ──────────────────────────────────────────────

const REPORT = "22222222-2222-4222-8222-222222222222";
const AUTHOR = "33333333-3333-4333-8333-333333333333";
const ACTOR = { id: ME, email: "mod@blacknexa.org", role: "moderator", ip: "10.0.0.9" };
const SUPER = { id: OTHER_ADMIN, email: "super@blacknexa.org", role: "superadmin", ip: null };

interface Seams {
  audits: any[];
  updates: any[];
  notifications: any[];
  dispatched: number[];
}

function reportRow(overrides: Record<string, unknown>, seams: Seams): any {
  const row: any = {
    id: REPORT,
    case_ref: "BNX-4471",
    user_id: AUTHOR,
    deleted_at: null,
    visibility: "public",
    status: "submitted",
    moderation_state: "approved",
    moderation_reason: null,
    moderation_note: null,
    content_version: 2,
    published_at: "2026-09-01T10:00:00.000Z",
    resubmission_count: 0,
    urgent: false,
    assigned_admin_id: null,
    assigned_at: null,
    verified_at: null,
    pre_deactivation_state: null,
    pre_deactivation_version: null,
    ...overrides,
  };
  row.update = async (patch: Record<string, unknown>) => {
    seams.updates.push(patch);
    Object.assign(row, patch);
    return row;
  };
  return row;
}

function wireIncident(report: any, seams: Seams, authorEmail = "author@x.org"): void {
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => work({ LOCK: { UPDATE: "UPDATE" } });
  reportModels.Report.findByPk = async () => report;
  adminModels.AdminUser.findByPk = async (id: string) => ({ id, email: id === SUPER.id ? SUPER.email : ACTOR.email });
  adminModels.AdminUser.findAll = async () => [];
  // Verify's auto-assignment looks the verifier up (review Q20); no eligible row by default.
  adminModels.AdminUser.findOne = async () => null;
  appModels.AppUser.findAll = async () => [{ id: AUTHOR, email: authorEmail }];
  auditModule.auditService.record = async (_tx: unknown, input: any) => {
    seams.audits.push(input);
    return "audit-id";
  };
  notificationModule.notificationService.createInTx = async (_tx: unknown, input: any, pending: unknown[]) => {
    seams.notifications.push(input);
    pending.push({ marker: input.title });
    return "notification-id";
  };
  notificationModule.notificationService.dispatchPushes = (pending: unknown[]) => {
    seams.dispatched.push(pending.length);
  };
  moderationModels.ReportNote.create = async (values: any) => ({ id: "note-1", ...values });
  flagModule.flagService.notifyReporters = () => undefined;
}

function freshSeams(): Seams {
  return { audits: [], updates: [], notifications: [], dispatched: [] };
}

test("loadIncidentFor: an advocate reaches only an incident assigned to them (404 otherwise)", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({ assigned_admin_id: OTHER_ADMIN }, seams), seams);
  const advocate = { id: ME, email: "adv@x.org", role: "advocate", ip: null };
  await assert.rejects(guard.loadIncidentFor(advocate, REPORT), (err: unknown) => (err as { status?: number }).status === 404);

  wireIncident(reportRow({ assigned_admin_id: ME }, seams), seams);
  const loaded = await guard.loadIncidentFor(advocate, REPORT);
  assert.equal(loaded.report.id, REPORT);
  assert.equal(loaded.access.tier, "assigned");
});

test("loadIncidentFor: staff cannot open evidence (403); a deleted incident is a 404 for everyone", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({}, seams), seams);
  const staff = { id: ME, email: "staff@x.org", role: "staff", ip: null };
  await assert.rejects(
    guard.loadIncidentFor(staff, REPORT, { requireContent: true }),
    (err: unknown) => (err as { status?: number }).status === 403,
  );
  await guard.loadIncidentFor(staff, REPORT);

  wireIncident(reportRow({ deleted_at: "2026-09-20T00:00:00.000Z" }, seams), seams);
  await assert.rejects(guard.loadIncidentFor(SUPER, REPORT), (err: unknown) => (err as { status?: number }).status === 404);
});

test("verify: 409 until the incident is published, worded for what to do first", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({ moderation_state: "held" }, seams), seams);
  await assert.rejects(
    incidentAdminService.verify(ACTOR, REPORT, {}),
    (err: unknown) => (err as { status?: number }).status === 409 && /moderation case/.test((err as Error).message),
  );
  wireIncident(reportRow({ moderation_state: "deactivated" }, seams), seams);
  await assert.rejects(
    incidentAdminService.verify(ACTOR, REPORT, {}),
    (err: unknown) => (err as { status?: number }).status === 409 && /Reactivate/.test((err as Error).message),
  );
  wireIncident(reportRow({ status: "verified" }, seams), seams);
  await assert.rejects(incidentAdminService.verify(ACTOR, REPORT, {}), (err: unknown) => (err as { status?: number }).status === 409);
  assert.deepEqual(seams.updates, []);
  assert.equal(seams.audits.length, 0);
});

test("verify: the operator's own incident is refused and audited (D16)", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({}, seams), seams, "MOD+member@blacknexa.org");
  await assert.rejects(incidentAdminService.verify(ACTOR, REPORT, {}), (err: unknown) => (err as { status?: number }).status === 403);
  assert.equal(seams.audits.length, 1);
  assert.equal(seams.audits[0].action, "self_action.refused");
  assert.equal(seams.audits[0].metadata.attemptedAction, "incident.verify");
});

test("verify: transition in the same transaction, the note stored as an internal note, before/after audited", async () => {
  const seams = freshSeams();
  const report = reportRow({ status: "under_review" }, seams);
  wireIncident(report, seams);
  const transitions: any[] = [];
  reportServiceModule.reportService.transition = async (row: any, next: string, actor: any, options: any) => {
    transitions.push({ next, actor, options });
    return { ...row, status: next, verified_at: "2026-09-24T15:30:00.000Z" };
  };
  const notes: any[] = [];
  moderationModels.ReportNote.create = async (values: any) => {
    notes.push(values);
    return { id: "note-7", ...values };
  };

  const result = await incidentAdminService.verify(ACTOR, REPORT, { note: "  Matches the CCTV request.  " });
  assert.equal(result.status, "verified");
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].next, "verified");
  assert.deepEqual(transitions[0].actor, { kind: "moderator", id: ME });
  assert.deepEqual(transitions[0].options.requireModerationStates, ["approved"]);
  assert.ok(transitions[0].options.transaction, "runs inside the decision's transaction");
  assert.equal(transitions[0].options.note, undefined, "the verify note never reaches the author's timeline");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, "Matches the CCTV request.");
  assert.equal(notes[0].admin_id, ME);
  const audit = seams.audits[0];
  assert.equal(audit.action, "incident.verify");
  assert.deepEqual(audit.metadata.before, { moderationState: "approved", status: "under_review" });
  assert.deepEqual(audit.metadata.after, { moderationState: "approved", status: "verified" });
  assert.equal(audit.metadata.noteId, "note-7");
});

test("deactivate: remembers where it came from, supersedes every open case, notifies with the label", async () => {
  const seams = freshSeams();
  const report = reportRow({ moderation_state: "held", content_version: 5 }, seams);
  wireIncident(report, seams);
  sequelize.query = async () => [{ target_id: "comment-1" }];
  const closes: any[] = [];
  caseModule.moderationCaseService.closeForTarget = async (_tx: unknown, input: any) => {
    closes.push(input);
    return input.targetType === "comment"
      ? { closedCase: { id: "case-c" }, flags: [{ id: "f1", comment_id: "comment-1", reporter_id: "m1" }], runsCancelled: 0 }
      : { closedCase: { id: "case-r" }, flags: [{ id: "f2", comment_id: null, reporter_id: "m2" }], runsCancelled: 1 };
  };
  enqueueModule.cancelRunsForReport = async () => 2;
  const mailed: any[] = [];
  flagModule.flagService.notifyReporters = (flags: any[], mail: any) => mailed.push({ ids: flags.map((f) => f.id), mail });

  const result = await incidentAdminService.deactivate(SUPER, REPORT, { reasonCode: "legal", publicNote: " Court order. " });
  assert.equal(result.moderationState, "deactivated");
  assert.equal(result.moderationReasonLabel, "Legal or safeguarding instruction");

  assert.deepEqual(closes.map((c) => [c.targetType, c.targetId, c.resolution]), [
    ["comment", "comment-1", "superseded"],
    ["report", REPORT, "superseded"],
  ]);
  const update = seams.updates.find((patch) => patch.moderation_state === "deactivated");
  assert.ok(update);
  assert.equal(update.pre_deactivation_state, "held");
  assert.equal(update.pre_deactivation_version, 5);
  assert.equal(update.moderation_reason, "legal");
  assert.equal(update.moderation_note, "Court order.");

  assert.equal(seams.notifications.length, 1);
  assert.equal(seams.notifications[0].title, "Your report was taken down");
  assert.match(seams.notifications[0].body, /^Reason: Legal or safeguarding instruction\./);
  assert.deepEqual(seams.dispatched, [1], "the push leaves after the transaction");

  const audit = seams.audits.find((row) => row.action === "incident.deactivate");
  assert.deepEqual(audit.metadata.before, { moderationState: "held", status: "submitted" });
  assert.deepEqual(audit.metadata.after, { moderationState: "deactivated", status: "submitted" });
  assert.equal(audit.metadata.casesSuperseded, 2);
  assert.equal(audit.metadata.runsCancelled, 2);
  assert.equal(seams.audits.filter((row) => row.action === "moderation.supersede").length, 2);
  // Reporters on the report and on its comments are each emailed once, after the commit.
  assert.deepEqual(mailed.map((m) => m.ids), [["f2"], ["f1"]]);
});

test("deactivate: an incident that is already deactivated is 409, and `other` needs a note", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({ moderation_state: "deactivated" }, seams), seams);
  await assert.rejects(
    incidentAdminService.deactivate(SUPER, REPORT, { reasonCode: "legal" }),
    (err: unknown) => (err as { status?: number }).status === 409,
  );
  await assert.rejects(
    incidentAdminService.deactivate(SUPER, REPORT, { reasonCode: "other", publicNote: " " }),
    (err: unknown) => (err as { status?: number }).status === 400,
  );
});

test("reactivate: approved and unchanged comes back live, and the author hears it", async () => {
  const seams = freshSeams();
  const report = reportRow(
    { moderation_state: "deactivated", pre_deactivation_state: "approved", pre_deactivation_version: 2, content_version: 2 },
    seams,
  );
  wireIncident(report, seams);
  let queued = 0;
  enqueueModule.enqueueRun = async () => {
    queued += 1;
    return "run-x";
  };
  let pokes = 0;
  signalModule.pokeModeration = () => {
    pokes += 1;
  };

  const result = await incidentAdminService.reactivate(SUPER, REPORT, {});
  assert.equal(result.moderationState, "approved");
  assert.equal(result.runId, null);
  assert.equal(queued, 0);
  assert.equal(pokes, 0);
  assert.equal(report.pre_deactivation_state, null);
  assert.equal(seams.notifications[0].title, "Your report is live again");
  const audit = seams.audits.find((row) => row.action === "incident.reactivate");
  assert.deepEqual(audit.metadata.after, { moderationState: "approved", status: "submitted" });
});

test("reactivate: edited since, or rejected before, goes back to a check — as a resubmission after a rejection", async () => {
  for (const [preState, expected] of [
    ["approved", "manual"],
    ["rejected", "resubmitted"],
  ] as const) {
    const seams = freshSeams();
    const report = reportRow(
      { moderation_state: "deactivated", pre_deactivation_state: preState, pre_deactivation_version: 2, content_version: 3 },
      seams,
    );
    wireIncident(report, seams);
    // No `resubmitted` run on record (the resubmission-debt lookup, review Q7).
    sequelize.query = async () => [];
    const runs: any[] = [];
    enqueueModule.enqueueRun = async (_tx: unknown, input: any) => {
      runs.push(input);
      return "run-9";
    };
    let pokes = 0;
    signalModule.pokeModeration = () => {
      pokes += 1;
    };

    const result = await incidentAdminService.reactivate(SUPER, REPORT, { note: "Order lifted." });
    assert.equal(result.moderationState, "pending", preState);
    assert.equal(result.runId, "run-9", preState);
    assert.equal(runs.length, 1, preState);
    assert.equal(runs[0].trigger, expected, preState);
    assert.equal(runs[0].contentVersion, 3, preState);
    assert.equal(pokes, 1, `${preState}: the worker is woken after the commit`);
    assert.equal(seams.notifications.length, 0, preState);
    const audit = seams.audits.find((row) => row.action === "incident.reactivate");
    assert.equal(audit.metadata.after.moderationState, "pending", preState);
    assert.equal(audit.metadata.trigger, expected, preState);
  }
});

test("assign: an approved submitted incident moves to under review; anything else is assignment only", async () => {
  for (const [moderationState, moves] of [
    ["approved", true],
    ["held", false],
  ] as const) {
    const seams = freshSeams();
    const report = reportRow({ moderation_state: moderationState }, seams);
    wireIncident(report, seams);
    adminModels.AdminUser.findOne = async () => ({ id: ME, name: "R. Idris", email: "advocate@blacknexa.com", role: "advocate" });
    appModels.AppUser.findByPk = async () => ({ id: AUTHOR, email: "author@x.org" });
    const transitions: string[] = [];
    reportServiceModule.reportService.transition = async (row: any, next: string) => {
      transitions.push(next);
      return { ...row, status: next };
    };

    const result = await incidentAdminService.assign(SUPER, REPORT, { adminId: ME });
    assert.deepEqual(transitions, moves ? ["under_review"] : [], moderationState);
    assert.equal(result.status, moves ? "under_review" : "submitted", moderationState);
    const assignment = seams.updates.find((patch) => "assigned_admin_id" in patch);
    assert.equal(assignment.assigned_admin_id, ME);
    assert.equal(assignment.assigned_by, SUPER.id);
    const audit = seams.audits.find((row) => row.action === "incident.assign");
    assert.equal(audit.metadata.before.assigneeId, null);
    assert.equal(audit.metadata.after.assigneeId, ME);
    assert.equal(audit.metadata.assigneeRole, "advocate");
  }
});

test("assign: only an active moderator or advocate, never the incident's own author", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({}, seams), seams);
  adminModels.AdminUser.findOne = async () => null;
  await assert.rejects(
    incidentAdminService.assign(SUPER, REPORT, { adminId: ME }),
    (err: unknown) => (err as { status?: number }).status === 400 && /active moderator or advocate/.test((err as Error).message),
  );

  adminModels.AdminUser.findOne = async () => ({ id: ME, name: "R. Idris", email: "J.Doe@gmail.com", role: "advocate" });
  appModels.AppUser.findByPk = async () => ({ id: AUTHOR, email: "jdoe+member@googlemail.com" });
  await assert.rejects(
    incidentAdminService.assign(SUPER, REPORT, { adminId: ME }),
    (err: unknown) => (err as { status?: number }).status === 400 && /filed this incident/.test((err as Error).message),
  );
  assert.equal(seams.updates.length, 0);
});

test("assign: re-assigning the same person changes nothing and writes nothing", async () => {
  const seams = freshSeams();
  wireIncident(reportRow({ assigned_admin_id: ME }, seams), seams);
  adminModels.AdminUser.findOne = async () => ({ id: ME, name: "R. Idris", email: "advocate@blacknexa.com", role: "advocate" });
  appModels.AppUser.findByPk = async () => ({ id: AUTHOR, email: "author@x.org" });
  const result = await incidentAdminService.assign(SUPER, REPORT, { adminId: ME });
  assert.equal(result.changed, false);
  assert.equal(seams.updates.length, 0);
  assert.equal(seams.audits.length, 0);
});

// ── Review Q20: verify assigns an unassigned incident to the verifier ───────

function wireVerify(report: any, seams: Seams, verifierRow: any): { transitions: any[]; lookups: any[] } {
  wireIncident(report, seams);
  const lookups: any[] = [];
  adminModels.AdminUser.findOne = async (options: any) => {
    lookups.push(options);
    return verifierRow;
  };
  const transitions: any[] = [];
  reportServiceModule.reportService.transition = async (row: any, next: string, actor: any, options: any) => {
    transitions.push({ next, actor, assignedAtTransition: row.assigned_admin_id, options });
    return { ...row, status: next, verified_at: "2026-09-24T15:30:00.000Z" };
  };
  return { transitions, lookups };
}

test("review Q20: a moderator verifying an unassigned incident is assigned it first, audited, in the same transaction", async () => {
  const seams = freshSeams();
  const report = reportRow({ status: "submitted" }, seams);
  const { transitions, lookups } = wireVerify(report, seams, { id: ME, role: "moderator" });

  const result = await incidentAdminService.verify(ACTOR, REPORT, {});
  assert.equal(result.status, "verified");
  // The role is read from the admin row, as `assign` checks an assignee.
  assert.deepEqual(lookups[0].where.id, ME);
  assert.equal(lookups[0].where.is_active, true);
  const assignment = seams.updates.find((patch) => "assigned_admin_id" in patch);
  assert.ok(assignment);
  assert.equal(assignment.assigned_admin_id, ME);
  assert.equal(assignment.assigned_by, ME);
  assert.equal(typeof assignment.assigned_at, "string");
  // Assigned before the status moved — straight to verified, not via under_review.
  assert.deepEqual(transitions.map((t) => [t.next, t.assignedAtTransition]), [["verified", ME]]);
  const assign = seams.audits.find((row) => row.action === "incident.assign");
  assert.deepEqual(assign.metadata.before.assigneeId, null);
  assert.deepEqual(assign.metadata.after.assigneeId, ME);
  assert.equal(assign.metadata.assigneeRole, "moderator");
  assert.equal(assign.metadata.by, "incident.verify");
  const verify = seams.audits.find((row) => row.action === "incident.verify");
  assert.equal(verify.metadata.assignedToVerifier, true);
  assert.ok(seams.audits.indexOf(assign) < seams.audits.indexOf(verify));
});

test("review Q20: a superadmin verifier leaves it unassigned; an incident already assigned keeps its assignee", async () => {
  // Superadmin: not an assignee role, so the lookup finds no eligible row.
  let seams = freshSeams();
  wireVerify(reportRow({ status: "under_review" }, seams), seams, null);
  await incidentAdminService.verify(SUPER, REPORT, {});
  assert.ok(!seams.updates.some((patch) => "assigned_admin_id" in patch));
  assert.ok(!seams.audits.some((row) => row.action === "incident.assign"));
  assert.equal(seams.audits.find((row) => row.action === "incident.verify").metadata.assignedToVerifier, false);

  // Already assigned to someone else: untouched, and the role is not even looked up.
  seams = freshSeams();
  const { lookups } = wireVerify(reportRow({ status: "under_review", assigned_admin_id: OTHER_ADMIN }, seams), seams, {
    id: ME,
    role: "moderator",
  });
  await incidentAdminService.verify(ACTOR, REPORT, {});
  assert.equal(lookups.length, 0);
  assert.ok(!seams.updates.some((patch) => "assigned_admin_id" in patch));
});

// ── Review Q4: deactivation's D16 covers everyone its closures touch ─────────

const OPERATOR_MEMBER = "44444444-4444-4444-8444-444444444444";

function wireDeactivate(seams: Seams, answer: (sql: string) => unknown[]): { closes: any[] } {
  wireIncident(reportRow({ moderation_state: "approved" }, seams), seams);
  sequelize.query = async (sql: string) => answer(sql);
  // The superadmin's own member account shares their inbox.
  appModels.AppUser.findAll = async () => [
    { id: AUTHOR, email: "author@x.org" },
    { id: OPERATOR_MEMBER, email: "Super+member@blacknexa.org" },
  ];
  const closes: any[] = [];
  caseModule.moderationCaseService.closeForTarget = async (_tx: unknown, input: any) => {
    closes.push(input);
    return { closedCase: null, flags: [], runsCancelled: 0 };
  };
  enqueueModule.cancelRunsForReport = async () => 0;
  return { closes };
}

test("review Q4: an operator who flagged the report cannot take it down instead (403, audited, nothing closed)", async () => {
  const seams = freshSeams();
  const { closes } = wireDeactivate(seams, (sql) => {
    if (/SELECT target_id FROM moderation_cases/.test(sql)) return [];
    if (/SELECT DISTINCT f\.reporter_id/.test(sql)) return [{ reporter_id: OPERATOR_MEMBER }];
    return [];
  });
  await assert.rejects(
    incidentAdminService.deactivate(SUPER, REPORT, { reasonCode: "legal" }),
    (err: any) => err.status === 403 && /flagged this yourself/.test(err.message),
  );
  assert.deepEqual(closes, [], "no case superseded, no flag resolved");
  assert.ok(!seams.updates.some((patch) => patch.moderation_state === "deactivated"));
  assert.equal(seams.audits.length, 1);
  assert.equal(seams.audits[0].action, "self_action.refused");
  assert.equal(seams.audits[0].reasonCode, "flagger");
  assert.equal(seams.audits[0].metadata.attemptedAction, "incident.deactivate");
});

test("review Q4: nor can the author of a held or flagged comment on it (their comment's case would close)", async () => {
  const seams = freshSeams();
  const { closes } = wireDeactivate(seams, (sql) => {
    if (/SELECT target_id FROM moderation_cases/.test(sql)) return [{ target_id: "comment-1" }];
    if (/SELECT DISTINCT user_id FROM report_comments/.test(sql)) return [{ user_id: OPERATOR_MEMBER }];
    return [];
  });
  await assert.rejects(
    incidentAdminService.deactivate(SUPER, REPORT, { reasonCode: "legal" }),
    (err: any) => err.status === 403 && /posted yourself/.test(err.message),
  );
  assert.deepEqual(closes, []);
  assert.equal(seams.audits[0].reasonCode, "author");
});

test("review Q4: the flagger query covers the report's flags and the flags of every comment deactivation closes", async () => {
  const seams = freshSeams();
  const statements: string[] = [];
  wireDeactivate(seams, (sql) => {
    statements.push(sql);
    if (/SELECT target_id FROM moderation_cases/.test(sql)) return [{ target_id: "comment-1" }];
    return [];
  });
  await incidentAdminService.deactivate(SUPER, REPORT, { reasonCode: "legal" });
  const flaggers = statements.find((sql) => /SELECT DISTINCT f\.reporter_id/.test(sql)) ?? "";
  assert.match(flaggers, /f\.report_id = :reportId AND f\.comment_id IS NULL/);
  assert.match(flaggers, /f\.comment_id IN \(:commentIds\)/);
  assert.match(flaggers, /mc\.state = 'open'/);
});

// ── Review Q7: the resubmission debt outlives the reactivation run ───────────

/**
 * An in-memory run log: `enqueueRun` appends, and the one query
 * `awaitsResubmissionCheck` makes (the newest `resubmitted` run's version) is
 * answered from it — so the real rule runs end to end.
 */
function wireRunLog(): { runs: any[] } {
  const runs: any[] = [];
  enqueueModule.enqueueRun = async (_tx: unknown, input: any) => {
    runs.push(input);
    return `run-${runs.length}`;
  };
  sequelize.query = async (sql: string) => {
    if (/SELECT content_version FROM moderation_runs/.test(sql) && /"trigger" = 'resubmitted'/.test(sql)) {
      const last = [...runs].reverse().find((run) => run.trigger === "resubmitted");
      return last ? [{ content_version: last.contentVersion }] : [];
    }
    if (/UPDATE reports SET content_version = content_version \+ 1/.test(sql)) return [{ content_version: 3 }];
    return [];
  };
  signalModule.pokeModeration = () => undefined;
  return { runs };
}

/** Rejected while live at v2 (so it still carried v2 as approved), never resubmitted, then taken down. */
function rejectedThenDeactivated(seams: Seams): any {
  return reportRow(
    {
      moderation_state: "deactivated",
      pre_deactivation_state: "rejected",
      pre_deactivation_version: 2,
      content_version: 2,
      approved_content_version: 2,
      resubmission_count: 0,
    },
    seams,
  );
}

test("review Q7: reactivate → edit — the owner's edit of the held report is still a resubmission, never an AI-approvable edit", async () => {
  const seams = freshSeams();
  const report = rejectedThenDeactivated(seams);
  wireIncident(report, seams);
  const { runs } = wireRunLog();

  await incidentAdminService.reactivate(SUPER, REPORT, {});
  assert.equal(runs[0].trigger, "resubmitted");
  assert.equal(report.approved_content_version, null, "the approved version no longer stands");
  // The reactivation run holds it for a human (the pipeline's part).
  report.moderation_state = "held";

  // The owner edits the held report.
  const reportService = reportServiceModule.reportService;
  const edited = await reportService.updateReport(report, AUTHOR, { title: "What happened on Main St" });
  assert.equal(edited.moderation_state, "pending");
  assert.equal(runs.length, 2);
  assert.equal(runs[1].trigger, "resubmitted", "an `edited` run could be approved by the AI alone");
  assert.equal(runs[1].contentVersion, 3);
  assert.equal(report.resubmission_count, 0, "an edit while the check is owed is not a new resubmission");
});

test("review Q7: reactivate → Re-run AI — the moderator's re-run of the held report is queued resubmitted", async () => {
  const seams = freshSeams();
  const report = rejectedThenDeactivated(seams);
  wireIncident(report, seams);
  const { runs } = wireRunLog();

  await incidentAdminService.reactivate(SUPER, REPORT, {});
  // The reactivation run exhausted on an outage: held `ai_unavailable` + `resubmission`.
  report.moderation_state = "held";
  const caseRow = {
    id: "case-held",
    target_type: "report",
    target_id: REPORT,
    report_id: REPORT,
    comment_id: null,
    state: "open",
    hold_reasons: ["ai_unavailable", "resubmission"],
    user_flag_count: 0,
  };
  caseModule.moderationCaseService.findById = async () => caseRow;
  reportModels.Report.findOne = async () => report;

  const rerun = await pipelineModule.requestRerun({ LOCK: { UPDATE: "UPDATE", NO_KEY_UPDATE: "NO KEY UPDATE" } } as any, {
    caseId: "case-held",
    actor: { kind: "admin", id: ME, ip: null },
  });
  assert.deepEqual(rerun, { ok: true, runId: "run-2" });
  assert.equal(runs[1].trigger, "resubmitted", "a `manual` run could be approved by the AI alone");
  assert.equal(report.moderation_state, "pending");
  assert.equal(seams.audits.find((row) => row.action === "moderation.rerun").metadata.trigger, "resubmitted");
});

test("review Q7: once a human approves the reactivated version, later edits are ordinary again", async () => {
  const seams = freshSeams();
  const report = rejectedThenDeactivated(seams);
  wireIncident(report, seams);
  const { runs } = wireRunLog();
  await incidentAdminService.reactivate(SUPER, REPORT, {});
  // A moderator's Approve & Publish set the approved version to the current
  // one; a flag re-check later held it again, and the owner edits it.
  Object.assign(report, { moderation_state: "held", approved_content_version: 2 });

  await reportServiceModule.reportService.updateReport(report, AUTHOR, { title: "Corrected the street name" });
  assert.equal(runs[1].trigger, "edited");
});

// ── Dashboard metrics (`GET /metrics`, plan §11 Phase 3C) ────────────────────

test("metricsWindow: day ranges are whole UTC days ending with today, oldest first", () => {
  const week = metricsWindow("7d", NOW);
  assert.equal(week.bucket, "day");
  assert.equal(week.fromIso, "2026-09-18T00:00:00.000Z");
  assert.deepEqual(week.keys, [
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
    "2026-09-21",
    "2026-09-22",
    "2026-09-23",
    "2026-09-24",
  ]);
  const month = metricsWindow("30d", NOW);
  assert.equal(month.keys.length, 30);
  assert.equal(month.keys[0], "2026-08-26");
  assert.equal(month.keys[29], "2026-09-24");
  const quarter = metricsWindow("90d", NOW);
  assert.equal(quarter.keys.length, 90);
  assert.equal(quarter.fromIso, "2026-06-27T00:00:00.000Z");
  assert.equal(new Set(quarter.keys).size, 90, "no day twice, none skipped");
});

test("metricsWindow: 12m is twelve calendar months ending with this one, across a year boundary", () => {
  const year = metricsWindow("12m", NOW);
  assert.equal(year.bucket, "month");
  assert.equal(year.fromIso, "2025-10-01T00:00:00.000Z");
  assert.equal(year.keys.length, 12);
  assert.equal(year.keys[0], "2025-10-01");
  assert.equal(year.keys[11], "2026-09-01");
  const january = metricsWindow("12m", new Date("2026-01-15T08:00:00.000Z"));
  assert.equal(january.keys[0], "2025-02-01");
  assert.equal(january.keys[11], "2026-01-01");
});

test("incidentMetricsScope: the list's tier — advocates count their assignments, everyone else every incident", () => {
  const advocate = incidentMetricsScope({ access: ADVOCATE, adminId: ME });
  assert.deepEqual(advocate.clauses, ["r.deleted_at IS NULL", "r.assigned_admin_id = :adminId"]);
  assert.equal(advocate.replacements.adminId, ME);
  for (const access of [MODERATOR, STAFF, incidentAccessFor("superadmin")]) {
    const scope = incidentMetricsScope({ access, adminId: ME });
    assert.deepEqual(scope.clauses, ["r.deleted_at IS NULL"]);
    assert.deepEqual(scope.replacements, {});
  }
  // Deactivated incidents stay in: they were filed, published and held when they were.
  assert.ok(!advocate.clauses.some((clause) => clause.includes("moderation_state")));
});

test("foldActivity: rows land on their buckets, gaps are zeros, strays are dropped, totals match the bars", () => {
  const keys = ["2026-09-22", "2026-09-23", "2026-09-24"];
  const { activity, totals } = foldActivity(keys, "day", {
    filed: [
      { bucket: "2026-09-22", n: 3 },
      { bucket: "2026-09-24", n: "2" },
      { bucket: "2026-09-25", n: 9 },
      { bucket: null, n: 4 },
    ],
    published: [{ bucket: "2026-09-23", n: 1 }],
    held: [{ bucket: "2026-09-24", n: 1 }],
  });
  assert.deepEqual(activity, [
    { date: "2026-09-22", filed: 3, published: 0, held: 0 },
    { date: "2026-09-23", filed: 0, published: 1, held: 0 },
    { date: "2026-09-24", filed: 2, published: 0, held: 1 },
  ]);
  assert.deepEqual(totals, { filed: 5, published: 1, held: 1 }, "a stray future bucket is not counted");
});

test("foldActivity: a month row (YYYY-MM) becomes that month's first-day key", () => {
  const { activity } = foldActivity(["2026-08-01", "2026-09-01"], "month", {
    filed: [
      { bucket: "2026-08", n: 4 },
      { bucket: "2026-09", n: 6 },
    ],
    published: [{ bucket: "2026-09", n: 5 }],
    held: [],
  });
  assert.deepEqual(activity, [
    { date: "2026-08-01", filed: 4, published: 0, held: 0 },
    { date: "2026-09-01", filed: 6, published: 5, held: 0 },
  ]);
});

test("foldCategoryStatus: all nine categories with labels, most first; deactivated in its own bucket", () => {
  const { categories, byStatus } = foldCategoryStatus([
    { category: "housing", status: "submitted", deactivated: false, n: 2 },
    { category: "policing", status: "verified", deactivated: false, n: 3 },
    { category: "policing", status: "under_review", deactivated: true, n: 1 },
    { category: "workplace", status: "dismissed", deactivated: false, n: "2" },
    { category: "retired_code", status: "under_review", deactivated: false, n: 1 },
  ]);
  assert.equal(categories.length, 9);
  assert.deepEqual(categories.slice(0, 4), [
    { category: "policing", label: "Policing", count: 4 },
    { category: "housing", label: "Housing", count: 2 },
    { category: "workplace", label: "Workplace", count: 2 },
    { category: "other", label: "Other", count: 1 },
  ]);
  assert.deepEqual(
    categories.slice(4).map((row) => row.category),
    ["profiling", "education", "medical", "digital", "harassment"],
    "zero-count categories keep the C1 order",
  );
  assert.deepEqual(byStatus, { submitted: 2, under_review: 1, verified: 3, dismissed: 2, deactivated: 1 });
  const filed = categories.reduce((sum, row) => sum + row.count, 0);
  const split = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  assert.equal(filed, 9);
  assert.equal(split, filed, "the status split adds up to what was filed");
});

test("schemas: metrics defaults to 7d and refuses a range it does not bucket", () => {
  const metrics = (incidentSchemas as any)["incident.metrics"].query;
  const empty = metrics.validate({}, JOI_OPTIONS);
  assert.equal(empty.error, undefined);
  assert.equal(empty.value.range, "7d");
  for (const range of ["7d", "30d", "90d", "12m"]) {
    assert.equal(metrics.validate({ range }, JOI_OPTIONS).error, undefined, range);
  }
  assert.match(metrics.validate({ range: "1y" }, JOI_OPTIONS).error?.message ?? "", /7d, 30d, 90d or 12m/);
});

test("metrics: four scoped queries — advocates on their assignments, holds read from state changes, private never published", async () => {
  const calls: { sql: string; replacements: any }[] = [];
  sequelize.query = async (sql: string, options: any) => {
    calls.push({ sql, replacements: options?.replacements ?? {} });
    if (sql.includes("GROUP BY 1, 2, 3")) {
      return [{ category: "policing", status: "submitted", deactivated: false, n: 2 }];
    }
    if (sql.includes("FROM audit_events")) return [];
    if (sql.includes("LEFT(r.published_at")) return [];
    return [{ bucket: new Date().toISOString().slice(0, 10), n: 2 }];
  };
  const advocate = { id: ME, email: "adv@x.org", role: "advocate", ip: null };
  const result = await incidentAdminService.metrics(advocate, { range: "7d" });

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.match(call.sql, /r\.deleted_at IS NULL/);
    assert.match(call.sql, /r\.assigned_admin_id = :adminId/, "every figure is in the advocate's scope");
    assert.equal(call.replacements.adminId, ME);
    assert.equal(call.replacements.fromIso, result.from);
    assert.match(call.sql, /LEFT\([a-z_.]+, 10\)|GROUP BY 1, 2, 3/, "day buckets are the date prefix");
  }
  const published = calls.find((call) => call.sql.includes("LEFT(r.published_at"));
  assert.ok(published);
  assert.match(published.sql, /r\.visibility <> 'private'/);
  const held = calls.find((call) => call.sql.includes("FROM audit_events"));
  assert.ok(held);
  assert.match(held.sql, /'moderation\.hold', 'moderation\.auto_hide'/);
  assert.match(held.sql, /'after' ->> 'moderationState' = 'held'/);
  assert.match(held.sql, /IS DISTINCT FROM 'held'/, "a row that did not change the state is not a hold");

  assert.equal(result.range, "7d");
  assert.equal(result.bucket, "day");
  assert.equal(result.activity.length, 7);
  assert.deepEqual(result.totals, { filed: 2, published: 0, held: 0 });
  assert.equal(result.activity[6]?.filed, 2, "today's bucket is last");
  assert.equal(result.categories[0]?.category, "policing");
  assert.equal(result.byStatus.submitted, 2);
  assert.ok(!Number.isNaN(Date.parse(result.generatedAt)));

  calls.length = 0;
  const year = await incidentAdminService.metrics(ACTOR, { range: "12m" });
  assert.equal(year.bucket, "month");
  assert.equal(year.activity.length, 12);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.ok(!call.sql.includes("assigned_admin_id"), "a moderator counts every incident");
    assert.match(call.sql, /LEFT\([a-z_.]+, 7\)|GROUP BY 1, 2, 3/, "month buckets are the YYYY-MM prefix");
  }
});
