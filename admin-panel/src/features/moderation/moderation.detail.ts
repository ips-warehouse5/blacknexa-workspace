/**
 * Rules that keep a decision tied to what the moderator actually saw.
 *
 * Kept out of `ModerationDetailPage` because they are the part of the page that
 * decides what a click *does* — which files an approval releases, which content
 * version it vouches for, when the page must keep asking for a result — and
 * that is easier to read, and to check, as plain functions than as JSX.
 *
 * Three problems, all found in review, all with the same shape: the page acted
 * on whatever the latest render held rather than on what was on screen when the
 * moderator committed to the decision.
 *
 *   • **Files** (review Q6). Approving a report releases its files still waiting
 *     for review in full. The server used to release every sealed pending file at
 *     the moment of the click, so a photo the owner added after the moderator
 *     opened the case — one nobody looked at — was published at full resolution.
 *     The approve body now names the files (`evidenceIds`, contract §2.5): the
 *     ones rendered in the case detail when the dialog opened. Anything else
 *     that is pending stays pending and gets its own automated check.
 *   • **Content version** (review Q10). `contentVersion` is the stale-edit
 *     guard: the server answers 409 when the report was edited after the
 *     version the moderator read. Read at submit time it guarded nothing — a
 *     background refetch while the dialog was open put the new version behind
 *     the modal and the console sent *that*. It is now captured when the
 *     dialog opens, together with the file ids.
 *   • **Checks in flight** (review Q13). After Re-run AI, or while an owner
 *     edit is being checked, the result lands in seconds and often closes the
 *     case — but the page never asked again, so it went on offering Approve and
 *     Reject on a case that was already decided. The detail is now polled
 *     while a check is running, with a ceiling so a stalled worker does not
 *     keep a tab polling for ever.
 */

import type {
  AdminEvidenceView,
  AdminReportView,
  CaseDetail,
  TargetModerationState,
} from "@/features/moderation/moderation.types";

/** The API's ceiling on `evidenceIds` (contract §2.5; a report carries at most 50 files). */
export const MAX_APPROVE_EVIDENCE_IDS = 50;

/**
 * Whether approving the report would release this file in full: a sealed file
 * still waiting for review, or one members see as a thumbnail only (§11a, R5).
 * Files still uploading are never released by a decision — each gets its own
 * automated check once sealed.
 */
export function isReleasedByApproval(file: AdminEvidenceView): boolean {
  if (file.uploadState !== "sealed") return false;
  return (
    file.moderationState === "pending" ||
    (file.moderationState === "approved" && file.approvedScope === "thumbnail")
  );
}

/** The ids of the files an approval would release, in display order (review Q6). */
export function releasableEvidenceIds(report: AdminReportView): string[] {
  return report.evidence
    .filter(isReleasedByApproval)
    .map((file) => file.id)
    .slice(0, MAX_APPROVE_EVIDENCE_IDS);
}

/**
 * What the moderator had in front of them when they opened the decision dialog.
 *
 * Sent with the decision instead of the latest render's values (reviews Q6,
 * Q10): the dialog can stay open across refetches, and whatever arrives behind
 * it is exactly what nobody has read.
 */
export interface DecisionSnapshot {
  contentVersion: number;
  /** Files an approval would release, as rendered when the dialog opened. */
  evidenceIds: string[];
}

export function takeDecisionSnapshot(report: AdminReportView): DecisionSnapshot {
  return {
    contentVersion: report.contentVersion,
    evidenceIds: releasableEvidenceIds(report),
  };
}

/** The target's publication state: the comment's on a comment case, else the report's. */
export function targetStateOf(detail: CaseDetail): TargetModerationState {
  return detail.target.comment
    ? detail.target.comment.moderationState
    : detail.target.report.moderationState;
}

/**
 * Say what changed behind an open decision dialog, if anything did.
 *
 * Nothing here blocks the moderator — the server has the final word (409 on a
 * stale version, and it releases only the files named) — but they should know
 * before pressing the button, not learn it from an error that also closes the
 * dialog and loses their notes.
 */
export function decisionDrift(
  snapshot: DecisionSnapshot,
  detail: CaseDetail,
  mode: "approve" | "reject",
): string | undefined {
  if (detail.case.state !== "open") {
    return "This case was closed while this dialog was open, so it can no longer be decided here. Cancel to see the outcome.";
  }
  const isComment = detail.case.targetType === "comment";
  const report = detail.target.report;
  if (!isComment && report.contentVersion !== snapshot.contentVersion) {
    return "The author edited this report after you opened this dialog. Your decision would be refused — cancel, read the new version, then decide again.";
  }
  if (!isComment && mode === "approve") {
    const seen = new Set(snapshot.evidenceIds);
    const arrived = releasableEvidenceIds(report).filter((id) => !seen.has(id)).length;
    if (arrived > 0) {
      return `${arrived} more file${arrived === 1 ? "" : "s"} arrived after you opened this dialog. ${
        arrived === 1 ? "It is" : "They are"
      } not released by this approval and get${arrived === 1 ? "s" : ""} an automated check of ${
        arrived === 1 ? "its" : "their"
      } own. Cancel and reopen the dialog to review ${arrived === 1 ? "it" : "them"} first.`;
    }
  }
  return undefined;
}

// ── Polling while a check runs (review Q13) ─────────────────────────────────

/** How often the detail is re-read while an automated check is in flight. */
export const CHECK_POLL_INTERVAL_MS = 3_000;

/**
 * How long the page keeps polling one check. A run normally answers in
 * seconds; one still queued after this is waiting on a stalled worker, and the
 * case stays decidable by hand, so the page stops asking and a focus refetch
 * (or Try again) picks the result up later.
 */
export const CHECK_POLL_LIMIT_MS = 2 * 60_000;

/**
 * Whether an automated check on this case's target is still to answer.
 *
 * Either signal counts: the latest run queued or running, or the target still
 * `pending` (the state a re-run or an owner edit leaves it in until the run
 * settles it). A closed case has nothing left to wait for.
 */
export function checkInFlight(detail: CaseDetail): boolean {
  if (detail.case.state !== "open") return false;
  const latest = detail.runs[0];
  if (latest && (latest.status === "queued" || latest.status === "running")) return true;
  return targetStateOf(detail) === "pending";
}

/**
 * The detail query's `refetchInterval`: poll while a check is in flight and
 * the ceiling has not been reached.
 *
 * @param pollingSince when the current stretch of polling began (epoch ms), or
 *   null when it has not begun.
 */
export function checkPollInterval(
  detail: CaseDetail | undefined,
  pollingSince: number | null,
  now: number,
): number | false {
  if (!detail || !checkInFlight(detail)) return false;
  if (pollingSince !== null && now - pollingSince >= CHECK_POLL_LIMIT_MS) return false;
  return CHECK_POLL_INTERVAL_MS;
}
