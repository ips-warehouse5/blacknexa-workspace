/**
 * Unit tests for the owner's D2 timeline — `npm test`.
 *
 * docs/INCIDENT_MODULE_PLAN.md §7.4: owner-safe moderation events (published,
 * with a moderator, not published, taken down, live again) derived from the
 * audit log, next to the case-status events — without ever carrying an
 * internal note or a staff-only hold reason.
 *
 * Review R14: the two are separate lists. `timeline` is the case-status events
 * only, because the shipped D2 renders `STATUS_LABEL[event.status]` and would
 * print every merged moderation node as another "Submitted" row; the moderation
 * nodes are the additive `moderationTimeline`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildOwnerTimeline,
  statusEventView,
  type TimelineAuditRow,
  type TimelineStatusRow,
} from "./report_timeline";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const t = (minute: number): string => `2026-09-23T10:${String(minute).padStart(2, "0")}:00.000Z`;

function status(
  minute: number,
  value: TimelineStatusRow["status"],
  extra: Partial<TimelineStatusRow> = {},
): TimelineStatusRow {
  return { status: value, at: t(minute), actor_kind: "system", actor_id: null, note: null, reason_code: null, ...extra };
}

function audit(minute: number, action: string, extra: Partial<TimelineAuditRow> = {}): TimelineAuditRow {
  return { action, actor_kind: "system", actor_id: null, reason_code: null, metadata: null, at: t(minute), ...extra };
}

const filed = status(0, "submitted", { actor_kind: "owner", actor_id: OWNER });
const fileRow = audit(0, "report.file", { actor_kind: "member", actor_id: OWNER });

test("R14: the shipped D2's list stays case-status events only — no duplicate Submitted row", () => {
  const { timeline, moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [
      fileRow,
      audit(1, "moderation.hold", { actor_kind: "system", reason_code: "ai_unavailable" }),
      audit(5, "moderation.approve", { actor_kind: "admin", actor_id: ADMIN }),
    ],
  });
  // What owner.tsx renders: one node per status event, and nothing else.
  assert.deepEqual(
    timeline.map((node) => node.status),
    ["submitted"],
  );
  for (const node of timeline) assert.equal(node.moderationEvent, undefined);
  // The moderation story is still there, in its own field.
  assert.deepEqual(
    moderationTimeline.map((node) => node.moderationEvent),
    ["with_moderator", "published"],
  );
});

test("an automatic approval publishes the report once", () => {
  const { timeline, moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [fileRow, audit(1, "moderation.auto_approve", { actor_kind: "ai" })],
  });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].status, "submitted");
  assert.equal(moderationTimeline.length, 1);
  assert.equal(moderationTimeline[0].moderationEvent, "published");
  assert.equal(moderationTimeline[0].status, "submitted");
  assert.equal(moderationTimeline[0].actorLabel, null);
  assert.equal(moderationTimeline[0].at, t(1));
});

test("a hold, then a human approval, then an edit and re-approval", () => {
  const { moderationTimeline, moderatorIds } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [
      fileRow,
      audit(1, "moderation.hold", { actor_kind: "system", reason_code: "ai_unavailable" }),
      audit(5, "moderation.approve", { actor_kind: "admin", actor_id: ADMIN }),
      audit(8, "report.edit", { actor_kind: "member", actor_id: OWNER }),
      audit(9, "moderation.auto_approve", { actor_kind: "ai" }),
    ],
  });
  assert.deepEqual(
    moderationTimeline.map((node) => node.moderationEvent),
    ["with_moderator", "published", "live_again"],
  );
  // Hold reasons are staff-only: never a label on the owner's node.
  assert.equal(moderationTimeline[0].reasonLabel, undefined);
  assert.equal(moderationTimeline[1].actorLabel, "by a moderator");
  assert.deepEqual([...moderatorIds], [ADMIN]);
});

test("approving already-published content (a kept flag, an evidence run) adds nothing", () => {
  const { moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [
      fileRow,
      audit(1, "moderation.auto_approve", { actor_kind: "ai" }),
      audit(3, "moderation.approve", { actor_kind: "admin", actor_id: ADMIN }),
      audit(4, "moderation.auto_approve", { actor_kind: "ai" }),
    ],
  });
  assert.deepEqual(
    moderationTimeline.map((node) => node.moderationEvent),
    ["published"],
  );
});

test("the recorded outcome wins over the action: an evidence-only hold leaves the report live", () => {
  const live = { before: { moderationState: "approved" }, after: { moderationState: "approved" } };
  const { moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [
      fileRow,
      audit(1, "moderation.auto_approve", {
        actor_kind: "ai",
        metadata: { before: { moderationState: "pending" }, after: { moderationState: "approved" } },
      }),
      // A late photo the AI could not see: the file waits, the report stays up.
      audit(4, "moderation.hold", { actor_kind: "system", reason_code: "media_unassessed", metadata: live }),
      audit(6, "moderation.auto_hide", {
        actor_kind: "ai",
        metadata: { before: { moderationState: "approved" }, after: { moderationState: "held" } },
      }),
    ],
  });
  assert.deepEqual(
    moderationTimeline.map((node) => node.moderationEvent),
    ["published", "with_moderator"],
  );
  assert.equal(moderationTimeline[1].at, t(6));
});

test("a rejection and a take-down carry the author-visible reason label, never the internal note", () => {
  const { timeline, moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [
      fileRow,
      audit(2, "moderation.reject", { actor_kind: "admin", actor_id: ADMIN, reason_code: "spam" }),
      audit(4, "report.resubmit", { actor_kind: "member", actor_id: OWNER }),
      audit(6, "moderation.approve", { actor_kind: "admin", actor_id: ADMIN }),
      audit(9, "incident.deactivate", { actor_kind: "admin", actor_id: ADMIN, reason_code: "legal" }),
      audit(12, "incident.reactivate", {
        actor_kind: "admin",
        actor_id: ADMIN,
        metadata: { before: { moderationState: "deactivated" }, after: "approved" },
      }),
    ],
  });
  assert.deepEqual(
    moderationTimeline.map((node) => node.moderationEvent),
    ["not_published", "published", "taken_down", "live_again"],
  );
  assert.equal(moderationTimeline[0].reasonLabel, "Spam or advertising");
  assert.equal(moderationTimeline[2].reasonLabel, "Legal or safeguarding instruction");
  for (const node of [...timeline, ...moderationTimeline]) {
    if (node.moderationEvent) assert.equal(node.note, null);
  }
});

test("status events keep their order and their notes; moderation nodes carry the status in force", () => {
  const { timeline, moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [
      filed,
      status(5, "under_review", { actor_kind: "moderator", actor_id: ADMIN }),
      status(7, "dismissed", { actor_kind: "moderator", actor_id: ADMIN, note: "Thanks for filing.", reason_code: "duplicate" }),
    ],
    auditEvents: [
      fileRow,
      audit(2, "moderation.auto_approve", { actor_kind: "ai" }),
      audit(9, "incident.deactivate", { actor_kind: "admin", actor_id: ADMIN, reason_code: "reporter_request" }),
    ],
  });
  assert.deepEqual(
    timeline.map((node) => node.status),
    ["submitted", "under_review", "dismissed"],
  );
  const dismissed = timeline[2];
  assert.equal(dismissed.note, "Thanks for filing.");
  assert.equal(dismissed.reasonLabel, "Duplicate of an existing incident");

  assert.deepEqual(
    moderationTimeline.map((node) => [node.moderationEvent, node.status]),
    [
      ["published", "submitted"],
      ["taken_down", "dismissed"],
    ],
  );
});

test("a moderation node at the same instant as a status event sees that status in force", () => {
  const { moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed, status(3, "under_review", { actor_kind: "moderator", actor_id: ADMIN })],
    auditEvents: [fileRow, audit(3, "moderation.approve", { actor_kind: "admin", actor_id: ADMIN })],
  });
  assert.equal(moderationTimeline[0].status, "under_review");
});

test("a report filed before revision 2 counts as already published", () => {
  const { moderationTimeline } = buildOwnerTimeline({
    moderated: true,
    statusEvents: [filed],
    auditEvents: [
      audit(3, "moderation.auto_hide", { actor_kind: "ai" }),
      audit(6, "moderation.approve", { actor_kind: "admin", actor_id: ADMIN }),
    ],
  });
  assert.deepEqual(
    moderationTimeline.map((node) => node.moderationEvent),
    ["with_moderator", "live_again"],
  );
});

test("a private report is never 'published'", () => {
  const { timeline, moderationTimeline } = buildOwnerTimeline({
    moderated: false,
    statusEvents: [filed],
    auditEvents: [fileRow, audit(1, "report.edit", { actor_kind: "member", actor_id: OWNER })],
  });
  assert.deepEqual(timeline.map((node) => node.status), ["submitted"]);
  assert.deepEqual(moderationTimeline, []);
});

test("the trust-sheet projection drops notes and reason labels", () => {
  const row = status(7, "dismissed", { actor_kind: "moderator", note: "Internal-ish words", reason_code: "duplicate" });
  const view = statusEventView(row, { withNote: false });
  assert.equal(view.note, null);
  assert.equal(view.reasonLabel, undefined);
  assert.equal(view.actorLabel, "by a moderator");
});
