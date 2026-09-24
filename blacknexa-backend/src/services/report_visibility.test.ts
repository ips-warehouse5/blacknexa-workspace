/**
 * Unit tests for the one read gate — `npm test`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §3.2 and §7.3: a report is visible to anyone but
 * its author only when it is not deleted, is approved, and its visibility admits
 * the viewer; evidence additionally needs its own approval (D22), and a
 * non-owner is served only the bytes that approval covered (review R5). Also the
 * share rules: who gets a token, who gets the plain URL (review R11), and which
 * stored tokens still resolve (review R7).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";

import {
  ANONYMOUS_VIEWER,
  canReadReport,
  evidenceAccessFor,
  evidenceIsOpenable,
  isReportOwner,
  isVisibleToMember,
  readableVisibilities,
  shareLinkDecision,
  shareLinkResolves,
  visibleWhere,
  type ReportGateFields,
  type Viewer,
} from "./report_visibility";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const owner: Viewer = { id: OWNER_ID, role: "member" };
const member: Viewer = { id: OTHER_ID, role: "member" };
const advocate: Viewer = { id: OTHER_ID, role: "advocate" };

function report(overrides: Partial<ReportGateFields> = {}): ReportGateFields {
  return {
    user_id: OWNER_ID,
    deleted_at: null,
    moderation_state: "approved",
    visibility: "public",
    ...overrides,
  };
}

test("an approved public report is visible to everyone", () => {
  for (const viewer of [ANONYMOUS_VIEWER, member, advocate, owner]) {
    assert.equal(canReadReport(report(), viewer), true);
  }
});

test("anything but approved is visible to its author only", () => {
  for (const state of ["pending", "held", "rejected", "deactivated"]) {
    const row = report({ moderation_state: state });
    assert.equal(isVisibleToMember(row, member), false, state);
    assert.equal(isVisibleToMember(row, advocate), false, state);
    assert.equal(canReadReport(row, ANONYMOUS_VIEWER), false, state);
    assert.equal(canReadReport(row, owner), true, state);
  }
});

test("trusted is advocate-only, private is the author's alone", () => {
  assert.equal(canReadReport(report({ visibility: "trusted" }), member), false);
  assert.equal(canReadReport(report({ visibility: "trusted" }), advocate), true);
  assert.equal(canReadReport(report({ visibility: "private" }), advocate), false);
  assert.equal(canReadReport(report({ visibility: "private" }), owner), true);
});

test("a deleted report leaves every non-owner read path", () => {
  const row = report({ deleted_at: "2026-09-01T00:00:00.000Z" });
  assert.equal(canReadReport(row, member), false);
  assert.equal(canReadReport(row, owner), true);
});

test("a severed report has no owner — an anonymous caller is never mistaken for one", () => {
  const severed = report({ user_id: null, moderation_state: "pending" });
  assert.equal(isReportOwner(severed, ANONYMOUS_VIEWER), false);
  assert.equal(canReadReport(severed, ANONYMOUS_VIEWER), false);
});

test("visibleWhere is the same rule as a where clause", () => {
  assert.deepEqual(visibleWhere(member), {
    deleted_at: null,
    moderation_state: "approved",
    visibility: "public",
  });
  assert.deepEqual(visibleWhere(advocate), {
    deleted_at: null,
    moderation_state: "approved",
    visibility: { [Op.in]: ["public", "trusted"] },
  });
  assert.deepEqual(readableVisibilities(ANONYMOUS_VIEWER), ["public"]);
  assert.ok(!readableVisibilities(advocate).includes("private"));
});

test("evidence: owners see all, others see approved files and pending ones without URLs", () => {
  const sealed = (state: string, scope: string | null = null) => ({
    moderation_state: state,
    upload_state: "sealed",
    approved_scope: scope,
  });
  assert.equal(evidenceAccessFor(sealed("pending"), true), "full");
  assert.equal(evidenceAccessFor(sealed("rejected"), true), "full");
  assert.equal(evidenceAccessFor(sealed("approved", "full"), false), "full");
  assert.equal(evidenceAccessFor(sealed("pending"), false), "pending_review");
  assert.equal(evidenceAccessFor(sealed("rejected"), false), "hidden");
  assert.equal(evidenceAccessFor({ moderation_state: "approved", upload_state: "failed" }, false), "hidden");
});

test("R5: a file approved on its preview alone is served to non-owners as the preview only", () => {
  const approved = (scope: string | null | undefined) => ({
    moderation_state: "approved",
    upload_state: "sealed",
    approved_scope: scope,
  });
  // The AI assessed the sealed preview, not the original: no original for others.
  assert.equal(evidenceAccessFor(approved("thumbnail"), false), "thumbnail_only");
  // An approval with no recorded scope fails towards the preview, never the original.
  assert.equal(evidenceAccessFor(approved(null), false), "thumbnail_only");
  assert.equal(evidenceAccessFor(approved(undefined), false), "thumbnail_only");
  assert.equal(evidenceAccessFor(approved("anything-else"), false), "thumbnail_only");
  // Only an approval of the original itself serves the original.
  assert.equal(evidenceAccessFor(approved("full"), false), "full");
  // The owner (and staff) always get both, whatever the scope.
  assert.equal(evidenceAccessFor(approved("thumbnail"), true), "full");
  assert.equal(evidenceAccessFor(approved(null), true), "full");
});

test("R5: only full and preview-only access carry a URL of any kind", () => {
  assert.equal(evidenceIsOpenable("full"), true);
  assert.equal(evidenceIsOpenable("thumbnail_only"), true);
  assert.equal(evidenceIsOpenable("pending_review"), false);
  assert.equal(evidenceIsOpenable("hidden"), false);
});

test("R11: the author mints a token; any reader of a public report gets the plain URL", () => {
  assert.deepEqual(shareLinkDecision(report(), owner), { kind: "mint" });
  assert.deepEqual(shareLinkDecision(report({ visibility: "trusted" }), owner), { kind: "mint" });
  // The shipped D1 share sheet asks for a link as soon as a viewer opens it.
  for (const viewer of [member, advocate, ANONYMOUS_VIEWER]) {
    assert.deepEqual(shareLinkDecision(report(), viewer), { kind: "plain" }, String(viewer.role));
  }
});

test("R11: a Trusted-Circle report is the author's to share; private and unpublished are 409", () => {
  const trusted = shareLinkDecision(report({ visibility: "trusted" }), advocate);
  assert.equal(trusted.kind, "refuse");
  assert.equal(trusted.kind === "refuse" && trusted.status, 403);
  for (const viewer of [owner, member]) {
    const priv = shareLinkDecision(report({ visibility: "private" }), viewer);
    assert.equal(priv.kind === "refuse" && priv.status, 409);
  }
  for (const state of ["pending", "held", "rejected", "deactivated"]) {
    const unpublished = shareLinkDecision(report({ moderation_state: state }), owner);
    assert.equal(unpublished.kind === "refuse" && unpublished.status, 409, state);
  }
  const deleted = shareLinkDecision(report({ deleted_at: "2026-09-01T00:00:00.000Z" }), owner);
  assert.equal(deleted.kind === "refuse" && deleted.status, 404);
});

test("R7: only a live token minted by the report's current author resolves", () => {
  const live = { created_by: OWNER_ID, revoked_at: null };
  assert.equal(shareLinkResolves(live, { user_id: OWNER_ID }), true);
  // An advocate's pre-revision-2 link to a Trusted-Circle report.
  assert.equal(shareLinkResolves({ created_by: OTHER_ID, revoked_at: null }, { user_id: OWNER_ID }), false);
  assert.equal(shareLinkResolves({ ...live, revoked_at: "2026-09-01T00:00:00.000Z" }, { user_id: OWNER_ID }), false);
  // A severed report has no author, so no token can be its author's.
  assert.equal(shareLinkResolves(live, { user_id: null }), false);
  assert.equal(shareLinkResolves({ created_by: null, revoked_at: null }, { user_id: null }), false);
});
