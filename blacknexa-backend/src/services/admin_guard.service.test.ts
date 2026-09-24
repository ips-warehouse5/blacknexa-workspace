/**
 * Unit tests for the admin guards — `npm test`.
 *
 * docs/INCIDENT_MODULE_PLAN.md D16 (self-dealing), D17 / §9.1 (incident access
 * tiers), §3.3 (reason catalogues). The pure helpers are tested directly; the
 * D16 check and its audit trail are tested through `assertNotSelf` and
 * `adminTransaction` with the model finders, the transaction and the audit
 * writer replaced by stand-ins.
 *
 * `admin_guard.service.ts` reads the environment (through the models), so this
 * file sets what `env.config` requires — a database URL on a closed local port
 * that nothing can connect to — before loading it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_ACCESS_SECRET = "guard-test-access-secret-0123456789abcdef-0123456";
process.env.JWT_REFRESH_SECRET = "guard-test-refresh-secret-0123456789abcdef-012345";
process.env.DATABASE_URL = "postgres://unit:unit@127.0.0.1:1/unit_tests_never_connect";
process.env.LOG_LEVEL = "error";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Loaded after the environment above — static imports would be hoisted above it.
const guard = require("./admin_guard.service") as typeof import("./admin_guard.service");
const reportTx: any = require("./report_tx");
const auditModule: any = require("./audit.service");
const adminModels: any = require("../models/admin_user.model");
const appModels: any = require("../models/app_user.model");

const {
  normaliseEmail,
  findSelfRelation,
  incidentAccessFor,
  canOpenIncident,
  reasonProblem,
  assertReason,
  likePattern,
  isoOf,
  assertNotSelf,
  adminTransaction,
  SelfActionRefused,
} = guard;

// ── Email normalisation (D16) ────────────────────────────────────────────────

test("normaliseEmail: lower-cases and trims", () => {
  assert.equal(normaliseEmail("  Jane.Doe@Example.ORG "), "jane.doe@example.org");
});

test("normaliseEmail: strips a +tag on any domain", () => {
  assert.equal(normaliseEmail("jane+moderation@example.org"), "jane@example.org");
  assert.equal(normaliseEmail("jane+a+b@example.org"), "jane@example.org");
});

test("normaliseEmail: Gmail ignores dots, and googlemail.com is gmail.com", () => {
  assert.equal(normaliseEmail("J.Doe+mod@gmail.com"), "jdoe@gmail.com");
  assert.equal(normaliseEmail("jdoe@googlemail.com"), "jdoe@gmail.com");
  assert.equal(normaliseEmail("j.d.o.e@GoogleMail.com"), "jdoe@gmail.com");
});

test("normaliseEmail: dots are kept for every other domain", () => {
  assert.equal(normaliseEmail("j.doe@outlook.com"), "j.doe@outlook.com");
  assert.notEqual(normaliseEmail("j.doe@outlook.com"), normaliseEmail("jdoe@outlook.com"));
});

test("normaliseEmail: anything that is not an address is null, never a match", () => {
  for (const raw of [null, undefined, "", "   ", "no-at-sign", "@example.org", "jane@", "+tag@example.org"]) {
    assert.equal(normaliseEmail(raw as string | null | undefined), null, String(raw));
  }
});

test("findSelfRelation: the author's address in another spelling is still the operator", () => {
  const relation = findSelfRelation("J.Doe@gmail.com", [
    { relation: "author", email: "jdoe+member@googlemail.com" },
  ]);
  assert.equal(relation, "author");
});

test("findSelfRelation: a flagger match is reported when the author is someone else", () => {
  const relation = findSelfRelation("mod@blacknexa.org", [
    { relation: "author", email: "someone@else.org" },
    { relation: "flagger", email: "MOD+flags@blacknexa.org" },
  ]);
  assert.equal(relation, "flagger");
});

test("findSelfRelation: the first matching relation wins (author before flagger)", () => {
  const relation = findSelfRelation("me@x.org", [
    { relation: "author", email: "me@x.org" },
    { relation: "flagger", email: "me@x.org" },
  ]);
  assert.equal(relation, "author");
});

test("findSelfRelation: no match, a missing candidate email, or a missing operator email is null", () => {
  assert.equal(findSelfRelation("mod@x.org", [{ relation: "author", email: "other@x.org" }]), null);
  assert.equal(findSelfRelation("mod@x.org", [{ relation: "author", email: null }]), null);
  assert.equal(findSelfRelation("", [{ relation: "author", email: "" }]), null);
  assert.equal(findSelfRelation(null, [{ relation: "author", email: "mod@x.org" }]), null);
});

// ── Access tiers (D17, §9.1) ─────────────────────────────────────────────────

test("incidentAccessFor: superadmin and moderator see everything, anonymous identity included", () => {
  for (const role of ["superadmin", "moderator"]) {
    assert.deepEqual(incidentAccessFor(role), {
      tier: "full",
      assignedOnly: false,
      seesContent: true,
      seesAuthorEmail: true,
      seesAnonymousIdentity: true,
    });
  }
});

test("incidentAccessFor: an advocate sees content, only on assigned incidents, never who filed anonymously", () => {
  assert.deepEqual(incidentAccessFor("advocate"), {
    tier: "assigned",
    assignedOnly: true,
    seesContent: true,
    seesAuthorEmail: true,
    seesAnonymousIdentity: false,
  });
});

test("incidentAccessFor: staff see every incident's metadata and no content", () => {
  assert.deepEqual(incidentAccessFor("staff"), {
    tier: "metadata",
    assignedOnly: false,
    seesContent: false,
    seesAuthorEmail: false,
    seesAnonymousIdentity: false,
  });
});

test("incidentAccessFor: an unknown role gets the narrowest tier there is", () => {
  const access = incidentAccessFor("auditor");
  assert.equal(access.assignedOnly, true);
  assert.equal(access.seesContent, false);
  assert.equal(access.seesAuthorEmail, false);
  assert.equal(access.seesAnonymousIdentity, false);
});

test("canOpenIncident: advocates only through their own assignment", () => {
  const advocate = incidentAccessFor("advocate");
  assert.equal(canOpenIncident(advocate, "a1", "a1"), true);
  assert.equal(canOpenIncident(advocate, "a1", "a2"), false);
  assert.equal(canOpenIncident(advocate, "a1", null), false);
  assert.equal(canOpenIncident(incidentAccessFor("staff"), "s1", null), true);
  assert.equal(canOpenIncident(incidentAccessFor("moderator"), "m1", "a2"), true);
});

// ── Reason catalogues (§3.3) ─────────────────────────────────────────────────

test("reasonProblem: each decision accepts only its own catalogue", () => {
  assert.equal(reasonProblem("reject", "threat", null), null);
  assert.equal(reasonProblem("dismiss", "duplicate", null), null);
  assert.equal(reasonProblem("deactivate", "legal", null), null);
  assert.equal(reasonProblem("ban", "repeat", null), null);
  // A code from the wrong catalogue is refused.
  assert.match(reasonProblem("reject", "duplicate", null) ?? "", /rejection reasons/);
  assert.match(reasonProblem("dismiss", "threat", null) ?? "", /dismissal reasons/);
  assert.match(reasonProblem("deactivate", "spam", null) ?? "", /deactivation reasons/);
  assert.match(reasonProblem("ban", "misleading", null) ?? "", /ban reasons/);
  assert.match(reasonProblem("reject", "", null) ?? "", /rejection reasons/);
  assert.match(reasonProblem("reject", undefined, null) ?? "", /rejection reasons/);
});

test("reasonProblem: `other` always needs a non-blank note", () => {
  for (const kind of ["reject", "dismiss", "deactivate", "ban"] as const) {
    assert.match(reasonProblem(kind, "other", null) ?? "", /Other/, kind);
    assert.match(reasonProblem(kind, "other", "   ") ?? "", /Other/, kind);
    assert.equal(reasonProblem(kind, "other", "Explained here."), null, kind);
  }
});

test("assertReason: a problem is a 400", () => {
  assert.throws(
    () => assertReason("reject", "other", ""),
    (err: unknown) => (err as { status?: number }).status === 400,
  );
  assert.doesNotThrow(() => assertReason("reject", "spam", null));
});

// ── Small helpers ────────────────────────────────────────────────────────────

test("likePattern: escapes LIKE wildcards and the escape character", () => {
  assert.equal(likePattern("BNX-44"), "%BNX-44%");
  assert.equal(likePattern("50%_off\\"), "%50\\%\\_off\\\\%");
});

test("isoOf: Dates and parseable strings become ISO; anything else is null", () => {
  assert.equal(isoOf(new Date("2026-09-01T10:00:00Z")), "2026-09-01T10:00:00.000Z");
  assert.equal(isoOf("2026-09-01T10:00:00+02:00"), "2026-09-01T08:00:00.000Z");
  assert.equal(isoOf("not a date"), null);
  assert.equal(isoOf(null), null);
  assert.equal(isoOf(new Date(Number.NaN)), null);
});

// ── D16 through the database seams ───────────────────────────────────────────

const ADMIN = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "token@blacknexa.org", role: "moderator", ip: "10.0.0.1" };
const AUTHOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FLAGGER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function stubDirectory(adminEmail: string | null, members: Record<string, string>): void {
  adminModels.AdminUser.findByPk = async () => (adminEmail === null ? null : { id: ADMIN.id, email: adminEmail });
  appModels.AppUser.findAll = async (options: any) => {
    const ids: string[] = options?.where?.id?.[Object.getOwnPropertySymbols(options.where.id)[0]] ?? [];
    return ids.filter((id) => members[id]).map((id) => ({ id, email: members[id] }));
  };
}

test("assertNotSelf: refuses an operator whose admin address is the author's, however it is spelled", async () => {
  stubDirectory("J.Doe@gmail.com", { [AUTHOR]: "jdoe+member@googlemail.com" });
  await assert.rejects(
    assertNotSelf(null, ADMIN, { action: "moderation.approve", targetType: "report", targetId: AUTHOR, authorIds: [AUTHOR] }),
    (err: unknown) => err instanceof SelfActionRefused && err.relation === "author" && err.status === 403,
  );
});

test("assertNotSelf: refuses the member who flagged the item", async () => {
  stubDirectory("mod@blacknexa.org", { [AUTHOR]: "author@x.org", [FLAGGER]: "mod+flags@blacknexa.org" });
  await assert.rejects(
    assertNotSelf(null, ADMIN, {
      action: "moderation.reject",
      targetType: "comment",
      targetId: FLAGGER,
      authorIds: [AUTHOR],
      flaggerIds: [FLAGGER],
    }),
    (err: unknown) => err instanceof SelfActionRefused && err.relation === "flagger",
  );
});

test("assertNotSelf: the admin row's current email is what counts, not the token's", async () => {
  // The token was issued for token@blacknexa.org, since changed to the author's address.
  stubDirectory("author@x.org", { [AUTHOR]: "author@x.org" });
  await assert.rejects(
    assertNotSelf(null, ADMIN, { action: "incident.verify", targetType: "report", targetId: AUTHOR, authorIds: [AUTHOR] }),
    SelfActionRefused,
  );
  // With the row gone, the token's address is the fallback.
  stubDirectory(null, { [AUTHOR]: "token@blacknexa.org" });
  await assert.rejects(
    assertNotSelf(null, ADMIN, { action: "incident.verify", targetType: "report", targetId: AUTHOR, authorIds: [AUTHOR] }),
    SelfActionRefused,
  );
});

test("assertNotSelf: someone else's content passes, and a severed author (no id) never matches", async () => {
  stubDirectory("mod@blacknexa.org", { [AUTHOR]: "author@x.org" });
  await assertNotSelf(null, ADMIN, { action: "moderation.approve", targetType: "report", targetId: AUTHOR, authorIds: [AUTHOR] });
  await assertNotSelf(null, ADMIN, { action: "moderation.approve", targetType: "report", targetId: AUTHOR, authorIds: [null] });
});

test("adminTransaction: a refusal is audited as self_action.refused after the transaction, then rethrown", async () => {
  stubDirectory("mod@blacknexa.org", { [AUTHOR]: "mod@blacknexa.org" });
  const audits: any[] = [];
  const order: string[] = [];
  auditModule.auditService.record = async (tx: unknown, input: any) => {
    order.push(tx === null ? "audit:outside-tx" : "audit:inside-tx");
    audits.push(input);
    return "audit-id";
  };
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => {
    order.push("tx:start");
    try {
      return await work({ LOCK: { UPDATE: "UPDATE" } });
    } finally {
      order.push("tx:end");
    }
  };

  await assert.rejects(
    adminTransaction(async (tx) => {
      await assertNotSelf(tx, ADMIN, {
        action: "incident.deactivate",
        targetType: "report",
        targetId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        reportId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        authorIds: [AUTHOR],
      });
      order.push("write");
    }),
    SelfActionRefused,
  );

  assert.deepEqual(order, ["tx:start", "tx:end", "audit:outside-tx"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "self_action.refused");
  assert.equal(audits[0].actorKind, "admin");
  assert.equal(audits[0].actorId, ADMIN.id);
  assert.equal(audits[0].reasonCode, "author");
  assert.equal(audits[0].reportId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  assert.deepEqual(audits[0].metadata, { attemptedAction: "incident.deactivate", relation: "author" });
  assert.equal(audits[0].ip, ADMIN.ip);
});

test("adminTransaction: other errors pass through without an audit row", async () => {
  const audits: unknown[] = [];
  auditModule.auditService.record = async (_tx: unknown, input: unknown) => {
    audits.push(input);
    return "audit-id";
  };
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => work({});
  const boom = new Error("boom");
  await assert.rejects(adminTransaction(async () => { throw boom; }), boom);
  assert.equal(audits.length, 0);
});

test("adminTransaction: a failing audit write still answers the 403", async () => {
  stubDirectory("mod@blacknexa.org", { [AUTHOR]: "mod@blacknexa.org" });
  auditModule.auditService.record = async () => {
    throw new Error("audit table unavailable");
  };
  reportTx.lockedTransaction = async (work: (tx: unknown) => Promise<unknown>) => work({});
  await assert.rejects(
    adminTransaction((tx) =>
      assertNotSelf(tx, ADMIN, { action: "member.ban", targetType: "member", targetId: AUTHOR, memberId: AUTHOR }),
    ),
    (err: unknown) => err instanceof SelfActionRefused && err.relation === "member",
  );
});
