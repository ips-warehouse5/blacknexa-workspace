/**
 * Content Moderation — one case, everything needed to decide it once
 * (plan §8.2; prototype `section_details` + `openDetails` in scripts.js).
 *
 * The route param is the **case id** (`/moderation/:caseId`), not a report
 * reference: a report can have had several cases over its life, and a comment
 * has no reference of its own. Everything on the page comes from one call,
 * `GET /admin/moderation/cases/:id`, which works for open and resolved cases.
 *
 * Layout follows the prototype — top bar, content on the left, decisions on the
 * right — with the cards the real pipeline makes possible, in the order a
 * moderator reads them: what it is (Content Details, the incident, the flagged
 * comment), why it is here (AI Assessment, Keyword Matches, User Reports), what
 * is attached (Evidence), and what has happened before (previous rejection,
 * History). The author and enforcement sit beside the decision.
 *
 * Rules the page enforces on the console side (the API enforces them again):
 *
 *   • **Approving publishes; it never verifies** (D1). Buttons read *Approve &
 *     Publish* or *Keep Published*, and the approve copy says verification
 *     happens in Incident Management. Nothing on this page says "verified".
 *   • **Decisions need an open case on a live incident.** A resolved case
 *     renders read-only with its resolution; a deactivated incident points to
 *     Incident Management, where only *Reactivate* leaves that state (D10).
 *   • **Re-run AI** is offered only for held content whose hold is an AI outage
 *     (§5.1 `manual`), since re-running a verdict the AI gave gets the same one.
 *   • **Every action is RBAC-gated** and shown disabled with a reason rather
 *     than hidden, so an operator can see the action exists and is not theirs.
 *   • **A decision carries what was on screen when the dialog opened**, not
 *     what the latest render holds (reviews Q6, Q10; `moderation.detail.ts`):
 *     the report's `contentVersion`, so an owner edit that lands behind the
 *     open dialog answers 409 instead of publishing a version nobody read, and
 *     on approve the ids of the files it releases, so a file sealed after the
 *     moderator looked stays pending for its own check. An edit that arrives
 *     while the moderator is reading (before any dialog) is announced, and
 *     Approve/Reject wait until they say they have read the new version.
 *   • **Enforcement is not a content decision.** Ban and Lift Ban stay on the
 *     page after the case is decided (review Q9): the prototype keeps Ban User
 *     beside the decision, the API does not depend on the case state, and this
 *     is the only screen that bans — hiding it on a decided case left a
 *     mistaken ban on an author with no open case impossible to lift.
 *   • **A failed background refresh keeps the loaded case** (review Q11) — and
 *     any open dialog with the notes typed into it — and says so; only a first
 *     load that fails, or a 404, replaces the page.
 *
 * Previous/next walk the whole filtered queue the case was opened from,
 * fetching the neighbouring page at either end of the snapshot (review Q12,
 * see `moderation.queue.ts`); a case opened from a pasted link has no queue,
 * and the controls are not shown.
 */

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { useToast } from "@/app/providers/ToastProvider";
import { EvidenceGrid } from "@/components/evidence/EvidenceGrid";
import { useDeniedReason } from "@/components/rbac/Can";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/Page";
import env from "@/config/env";
import { AiAssessmentCard } from "@/features/moderation/components/AiAssessmentCard";
import { AuthorCard } from "@/features/moderation/components/AuthorCard";
import { BanMemberDialog } from "@/features/moderation/components/BanMemberDialog";
import {
  FlagByBadges,
  ResolutionBadge,
  RiskPills,
  TargetStateBadge,
} from "@/features/moderation/components/CaseBadges";
import {
  CaseDecisionDialog,
  type DecisionMode,
  type DecisionValues,
} from "@/features/moderation/components/CaseDecisionDialog";
import {
  CaseHistoryCard,
  PreviousRejectionCard,
} from "@/features/moderation/components/CaseRecordCards";
import {
  KeywordMatchesCard,
  UserReportsCard,
} from "@/features/moderation/components/CaseSignalCards";
import { HideEvidenceDialog } from "@/features/moderation/components/HideEvidenceDialog";
import {
  decisionDrift,
  isReleasedByApproval,
  takeDecisionSnapshot,
  targetStateOf,
  type DecisionSnapshot,
} from "@/features/moderation/moderation.detail";
import { formatDateTime, formatTime, initials } from "@/features/moderation/moderation.format";
import {
  isStaleCaseError,
  useApproveCase,
  useBanMember,
  useCaseDetail,
  useEvidenceLink,
  useFetchCasePage,
  useRejectCase,
  useRejectEvidence,
  useRerunCase,
  useUnbanMember,
} from "@/features/moderation/moderation.hooks";
import {
  backwardPages,
  continueBackward,
  continueForward,
  forwardPages,
  isCaseId,
  queueNavParams,
  queueNavState,
  queuePosition,
  readQueueNav,
  type QueueNavState,
} from "@/features/moderation/moderation.queue";
import {
  REPORT_CATEGORY_LABELS,
  VISIBILITY_LABELS,
  type AdminReportView,
  type BanReasonCode,
  type CaseSources,
  type EvidenceKind,
  type RejectReasonCode,
  type TargetModerationState,
} from "@/features/moderation/moderation.types";
import { ApiError } from "@/types/api";

/**
 * Which dialog, if any, is open. One value beats five booleans that can lie.
 *
 * A decision dialog carries the snapshot taken when it opened (reviews Q6,
 * Q10): the content version and the files the moderator saw, which is what
 * the decision is sent with however many refetches land behind the modal.
 */
type DialogState =
  | { kind: "none" }
  | { kind: "decision"; mode: DecisionMode; snapshot: DecisionSnapshot }
  | { kind: "ban" }
  | { kind: "unban" }
  | { kind: "hide"; evidenceId: string };

/** The tile name the shared evidence grid prints ("Image 2"), reused in the hide dialog. */
const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  photo: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
};

/** The Flag Source cell: every source that raised the case, or the pipeline itself. */
function flagSourceLabel(sources: CaseSources): string {
  const parts = [
    sources.ai ? "AI" : null,
    sources.keyword ? "Keyword Filter" : null,
    sources.user ? "User Flags" : null,
    sources.media ? "Media Review" : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Automated hold";
}

/** One label/value pair in the Content Details grid. */
function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  );
}

/** The report's text, keeping the author's paragraphs — or saying why it cannot be shown. */
function ReportBody({ report }: { report: AdminReportView }) {
  if (report.body === null || report.bodyUnreadable) {
    return (
      <div className="content-body-text" style={{ color: "var(--danger)" }}>
        The report's sealed text could not be opened on this server, so it cannot be shown. The
        automated check held it for the same reason. Decide on what is visible, or ask an
        engineer to check the encryption keys.
      </div>
    );
  }
  return (
    <div className="content-body-text">
      {report.body.split(/\n{2,}/).map((paragraph, index) => (
        // Single line breaks inside a paragraph are the author's too.
        <p key={index} style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** The top-left back button, shared by every state of the page. */
function BackButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="back-btn-pill"
      title="Back to queue"
      aria-label="Back to the moderation queue"
      onClick={() => navigate(to)}
    >
      ←
    </button>
  );
}

function ModerationDetailView({ caseId }: { caseId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const nav = readQueueNav(location.state);
  const backTo = `/moderation${nav?.search ?? ""}`;

  // A param that cannot be a case id (an old `CMT-…` link) is answered as not
  // found here rather than sent to the API to be refused with a 400.
  const validId = isCaseId(caseId);
  const detail = useCaseDetail(validId ? caseId : undefined);
  const approve = useApproveCase();
  const reject = useRejectCase();
  const rejectEvidence = useRejectEvidence();
  const rerun = useRerunCase();
  const ban = useBanMember();
  const unban = useUnbanMember();
  const evidenceLink = useEvidenceLink();
  const fetchCasePage = useFetchCasePage();

  const decideDenied = useDeniedReason("moderation.decide");
  const banDenied = useDeniedReason("moderation.ban");

  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [viewingId, setViewingId] = useState<string | null>(null);
  /** Which way previous/next is fetching a neighbouring queue page, if it is. */
  const [paging, setPaging] = useState<"previous" | "next" | null>(null);

  /*
   * The report version the moderator has read on this visit (review Q10).
   * Seeded from the first copy that renders; when a refetch brings a newer
   * one — the author edited while the page was open — the page says so and
   * holds Approve/Reject until the moderator acknowledges it, which moves this
   * forward. Set during render (React's pattern for state derived from new
   * data) so the first paint already has it.
   */
  const [readVersion, setReadVersion] = useState<number | null>(null);
  const renderedVersion = detail.data?.target.report.contentVersion;
  if (readVersion === null && renderedVersion !== undefined) setReadVersion(renderedVersion);

  const caseRef = detail.data?.target.report.caseRef;
  useEffect(() => {
    document.title = caseRef
      ? `${caseRef} · Content Moderation · ${env.appName} Admin`
      : `Content Moderation · ${env.appName} Admin`;
  }, [caseRef]);

  if (detail.isLoading) {
    return (
      <div className="details-page">
        <div className="details-top-bar">
          <BackButton to={backTo} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Loading the case…</span>
        </div>
        <div className="detail-card" aria-busy="true">
          <span className="skeleton-line" style={{ width: "40%", marginBottom: 14 }} />
          <span className="skeleton-line" style={{ marginBottom: 10 }} />
          <span className="skeleton-line" style={{ width: "64%" }} />
        </div>
      </div>
    );
  }

  /*
   * Only a failure with nothing to show replaces the page (review Q11). React
   * Query keeps the last good data when a background refetch fails — a 429
   * from the rate limiter on returning to the tab, a 5xx that outlasted its
   * retries — and replacing the page then would unmount an open decision
   * dialog and lose the notes typed into it. A 404 is different: the case or
   * its report is gone, and there is nothing left to decide.
   */
  const goneNow = detail.error instanceof ApiError && detail.error.status === 404;
  if (!validId || goneNow || !detail.data) {
    const notFound = !validId || goneNow;
    return (
      <div className="details-page">
        <div className="details-top-bar">
          <BackButton to={backTo} />
        </div>
        <EmptyState
          title={notFound ? "Case not found" : "Could not load this case"}
          message={
            notFound
              ? "This moderation case does not exist, or the report it was about has been deleted."
              : detail.error instanceof ApiError
                ? detail.error.message
                : "Something went wrong while loading the case."
          }
          action={
            notFound ? (
              <Link className="btn primary" to={backTo}>
                Back to the queue
              </Link>
            ) : (
              <Button variant="outline" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const data = detail.data;
  const kase = data.case;
  const report = data.target.report;
  const comment = data.target.comment;
  const isComment = kase.targetType === "comment";

  const targetState: TargetModerationState = targetStateOf(data);
  const live = targetState === "approved";
  const open = kase.state === "open";
  const deactivated = report.moderationState === "deactivated";
  const decidable = open && !deactivated;
  const subject = isComment ? `The comment on ${report.caseRef}` : report.caseRef;

  const latestRun = data.runs[0];
  const checkRunning = latestRun?.status === "queued" || latestRun?.status === "running";
  // "The AI was unavailable": the hold says so, or the latest run ended
  // without an answer. A verdict the AI did give is not re-run — it would
  // return the same one.
  const aiWasUnavailable =
    kase.holdReasons.some(
      (reason) => reason.code === "ai_unavailable" || reason.code === "system_error",
    ) ||
    latestRun?.aiStatus === "unavailable" ||
    latestRun?.aiStatus === "error" ||
    latestRun?.aiStatus === "skipped";
  const canRerun =
    decidable && targetState === "held" && aiWasUnavailable && report.visibility !== "private";

  const author = data.author;
  const authorName = author?.displayName ?? "the author";
  const flagsOpen = data.userFlags.filter((flag) => flag.status === "open").length;

  // An edit the moderator has not acknowledged yet (review Q10). Report cases
  // only: a comment case's decision is about the comment, not the report text.
  const unreadEdit = !isComment && readVersion !== null && report.contentVersion !== readVersion;

  const position = nav ? queuePosition(nav, caseId) : null;

  // Replace, not push: Back and the back pill both mean "the queue", not "the
  // case before this one".
  const goTo = (id: string, queue: QueueNavState) =>
    navigate(`/moderation/${id}`, { state: queueNavState(queue), replace: true });

  /*
   * Previous/next off either end of the snapshot (review Q12): read the live
   * neighbouring page(s) with the queue's filters and continue from the case
   * next to the snapshot's surviving ones — see `moderation.queue.ts` for why
   * it anchors on ids rather than page numbers.
   */
  const walk = async (direction: "previous" | "next") => {
    if (!nav || paging) return;
    const params = queueNavParams(nav);
    const pages =
      direction === "next" ? forwardPages(nav, params.limit) : backwardPages(nav, params.limit);
    if (pages.length === 0) return;
    setPaging(direction);
    try {
      const slices = await Promise.all(
        pages.map(async (page) => {
          const result = await fetchCasePage({ ...params, page });
          return {
            page,
            ids: result.items.map((item) => item.id),
            total: result.pagination.total,
          };
        }),
      );
      const next =
        direction === "next"
          ? continueForward(nav, params.limit, slices)
          : continueBackward(nav, params.limit, slices);
      const target = next
        ? direction === "next"
          ? next.ids[0]
          : next.ids[next.ids.length - 1]
        : undefined;
      if (!next || !target) {
        toast.warning(
          direction === "next" ? "End of the queue" : "Start of the queue",
          direction === "next"
            ? "There are no more cases in this view."
            : "There are no earlier cases in this view.",
        );
        // The snapshot's count was stale (cases were decided meanwhile). Record
        // what was just learned so the button that led here disables, instead
        // of asking again: nothing after the window, or nothing before it —
        // which also makes the window's first case position 1.
        goTo(
          caseId,
          direction === "next"
            ? { ...nav, total: nav.offset + nav.ids.length }
            : { ...nav, offset: 0, total: Math.max(0, nav.total - nav.offset) },
        );
        return;
      }
      goTo(target, next);
    } catch (error) {
      toast.error(
        "Could not load the next cases",
        error instanceof ApiError ? error.message : "Please try again.",
      );
    } finally {
      // The page remounts on a successful move (keyed on the case id); this
      // matters for the paths that stay.
      setPaging(null);
    }
  };

  const goPrevious = () => {
    if (!nav || !position) return;
    if (position.previousId) goTo(position.previousId, nav);
    else if (position.previousNeedsFetch) void walk("previous");
  };
  const goNext = () => {
    if (!nav || !position) return;
    if (position.nextId) goTo(position.nextId, nav);
    else if (position.nextNeedsFetch) void walk("next");
  };

  const closeDialog = () => setDialog({ kind: "none" });
  const openDecision = (mode: DecisionMode) =>
    setDialog({ kind: "decision", mode, snapshot: takeDecisionSnapshot(report) });

  /*
   * A failed write either can be fixed in the dialog (a validation message) or
   * means the dialog no longer applies: the case was decided by someone else,
   * the report changed or went away (409/404), or the operator may not decide
   * content they are involved in (403, D16). The hook has already shown the
   * server's message; the second kind also closes the dialog so the refreshed
   * page is what the moderator sees next.
   */
  const settleFailure = (error: unknown) => {
    if (isStaleCaseError(error) || (error instanceof ApiError && error.status === 403)) {
      closeDialog();
    }
  };

  const onDecision = async (values: DecisionValues) => {
    if (dialog.kind !== "decision") return;
    // From the snapshot taken when the dialog opened, never from this render
    // (reviews Q6, Q10) — see `DialogState`.
    const { snapshot } = dialog;
    const version = isComment ? {} : { contentVersion: snapshot.contentVersion };
    try {
      if (dialog.mode === "approve") {
        await approve.mutateAsync({
          caseId,
          subject,
          input: {
            internalNote: values.internalNote,
            ...version,
            // Only the files the moderator saw are released; a comment
            // decision touches no files (contract §2.5).
            ...(isComment ? {} : { evidenceIds: snapshot.evidenceIds }),
          },
        });
      } else {
        const reasonCode: RejectReasonCode | null = values.reasonCode;
        if (!reasonCode) return;
        await reject.mutateAsync({
          caseId,
          subject,
          input: {
            reasonCode,
            publicNote: values.publicNote,
            internalNote: values.internalNote,
            ...version,
          },
        });
      }
      closeDialog();
    } catch (error) {
      settleFailure(error);
    }
  };

  const onBan = async (values: { reasonCode: BanReasonCode; note: string }) => {
    if (!author) return;
    try {
      await ban.mutateAsync({
        memberId: author.id,
        name: author.displayName,
        input: { reasonCode: values.reasonCode, note: values.note, caseId },
      });
      closeDialog();
    } catch (error) {
      settleFailure(error);
    }
  };

  const onUnban = async () => {
    if (!author) return;
    try {
      await unban.mutateAsync({ memberId: author.id, name: author.displayName, input: { caseId } });
      closeDialog();
    } catch (error) {
      settleFailure(error);
    }
  };

  const onHide = async (values: { reasonCode: RejectReasonCode | null; internalNote: string }) => {
    if (dialog.kind !== "hide") return;
    try {
      await rejectEvidence.mutateAsync({
        caseId,
        evidenceId: dialog.evidenceId,
        input: {
          ...(values.reasonCode ? { reasonCode: values.reasonCode } : {}),
          internalNote: values.internalNote,
        },
      });
      closeDialog();
    } catch (error) {
      settleFailure(error);
    }
  };

  /*
   * Open a file in a new tab.
   *
   * The link has to be fetched first (it is presigned for a few minutes), and a
   * `window.open` made after an `await` is no longer a direct response to the
   * click — popup blockers refuse it. So the tab is opened synchronously on the
   * click, shows a holding line, and is pointed at the file once the link
   * arrives; it is closed again if the request fails. `opener` is cut before
   * the tab ever leaves this origin.
   *
   * When even the synchronous tab was blocked (strict pop-up settings), the
   * late `window.open` is tried once more and, if the browser refuses it too,
   * the moderator is told (review Q18). It is opened without the `noopener`
   * feature and the opener cut by hand instead: with `noopener` the call
   * returns null even when it works, so a block could not be told apart from
   * success and the click did nothing, silently. Same handling as the
   * incident page's `viewEvidence`.
   */
  const openEvidence = (evidenceId: string) => {
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      try {
        tab.document.title = "Opening file…";
        tab.document.body.textContent = "Opening the evidence file…";
      } catch {
        // A browser that isolates the new tab still navigates it below; the
        // holding line is a courtesy, not a requirement.
      }
    }
    setViewingId(evidenceId);
    evidenceLink.mutate(
      { caseId, evidenceId },
      {
        onSuccess: (link) => {
          if (tab && !tab.closed) {
            tab.location.replace(link.url);
            return;
          }
          const opened = window.open(link.url, "_blank");
          if (opened) opened.opener = null;
          else toast.warning("Pop-up blocked", "Allow pop-ups for the console to open evidence files.");
        },
        onError: () => tab?.close(),
        onSettled: () => setViewingId(null),
      },
    );
  };

  const hideIndex =
    dialog.kind === "hide"
      ? report.evidence.findIndex((file) => file.id === dialog.evidenceId)
      : -1;
  const hideFile = hideIndex >= 0 ? report.evidence[hideIndex] : undefined;
  const hideLabel = hideFile
    ? `${EVIDENCE_KIND_LABELS[hideFile.kind]} ${hideIndex + 1}`
    : "this file";

  // Hiding a file belongs to the report's own case. On a comment case the
  // evidence is the parent incident's context, shown for reference only.
  const canHideEvidence = decidable && !isComment;

  /*
   * What approving does to the files (contract §2.5): the *sealed* files still
   * waiting — or shown to members only as a thumbnail — that were on screen
   * when the dialog opened are released in full (review Q6); anything sealed
   * after that, and files still uploading, are left to their own automated
   * check. Both are said out loud, because a moderator deciding on flagged
   * text can forget that the same click publishes the photos. The count in the
   * dialog is the snapshot's, so it is the number the click actually sends.
   */
  const thumbnailOnly = report.evidence.filter(
    (file) => file.moderationState === "approved" && file.approvedScope === "thumbnail",
  ).length;
  const stillUploading = report.evidence.filter((file) => file.uploadState !== "sealed").length;
  const filesToRelease =
    dialog.kind === "decision"
      ? dialog.snapshot.evidenceIds.length
      : report.evidence.filter(isReleasedByApproval).length;
  const approveNotice =
    !isComment && filesToRelease > 0
      ? `Approving also shows ${filesToRelease} file${filesToRelease === 1 ? "" : "s"} waiting for review to members in full. Hide any that should stay private before you approve.`
      : undefined;
  // What changed behind the open dialog, if anything (reviews Q6, Q10, Q13).
  const dialogWarning =
    dialog.kind === "decision" ? decisionDrift(dialog.snapshot, data, dialog.mode) : undefined;

  const approveLabel = isComment ? "Keep Comment" : live ? "Keep Published" : "Approve & Publish";
  const rejectLabel = isComment ? "Remove Comment" : live ? "Reject & Take Down" : "Reject";
  const decisionBusy = approve.isPending || reject.isPending || rerun.isPending;

  // An unacknowledged edit locks Approve/Reject like a missing permission
  // does, with the reason as the tooltip (review Q10).
  const unreadEditReason = unreadEdit
    ? "The author edited this report while you had it open. Read the new version, then confirm below."
    : undefined;
  const lockedProps = (denied: string | undefined) => {
    const reason = denied ?? unreadEditReason;
    return {
      disabled: Boolean(reason) || decisionBusy,
      ...(reason ? { title: reason } : {}),
    };
  };

  return (
    <div className="details-page">
      <div
        className="details-top-bar"
        style={{ justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <BackButton to={backTo} />
          <div className="meta-chip-wrap" style={{ flexWrap: "wrap" }}>
            <span>{isComment ? "COMMENT" : "INCIDENT"}</span>
            <span>·</span>
            <strong>{isComment ? `On ${report.caseRef}` : report.caseRef}</strong>
            <TargetStateBadge targetType={kase.targetType} state={targetState} />
            {kase.state === "resolved" && kase.resolution ? (
              <ResolutionBadge resolution={kase.resolution} />
            ) : null}
            <FlagByBadges sources={kase.sources} prefix />
            <RiskPills urgent={kase.urgent} safetyRisk={kase.safetyRisk} />
          </div>
        </div>

        {position ? (
          <div className="details-nav-controls">
            <span
              style={{ fontSize: 12.5, color: "var(--muted)", marginRight: 4 }}
              title="Position in the queue view this case was opened from"
              aria-live="polite"
            >
              {paging ? "Loading…" : `${position.position} of ${position.total}`}
            </span>
            <button
              type="button"
              className="back-btn-pill details-nav-btn"
              title="Previous item"
              aria-label="Previous item"
              disabled={
                Boolean(paging) || (!position.previousId && !position.previousNeedsFetch)
              }
              onClick={goPrevious}
            >
              ←
            </button>
            <button
              type="button"
              className="back-btn-pill details-nav-btn"
              title="Next item"
              aria-label="Next item"
              disabled={Boolean(paging) || (!position.nextId && !position.nextNeedsFetch)}
              onClick={goNext}
            >
              →
            </button>
          </div>
        ) : null}
      </div>

      {detail.isError ? (
        // A background refresh failed; the last good copy stays up (review Q11).
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            border: "1px solid var(--line)",
            background: "var(--accent-soft)",
            borderRadius: 8,
            padding: "10px 14px",
            margin: "0 0 14px",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          <span>
            Couldn't refresh this case
            {detail.error instanceof ApiError ? ` (${detail.error.message})` : ""} — showing the
            version loaded at {formatTime(new Date(detail.dataUpdatedAt).toISOString())}.
          </span>
          <Button
            variant="outline"
            loading={detail.isFetching}
            onClick={() => void detail.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      <h1 className="details-main-title">
        {isComment ? `Comment on “${report.title}”` : report.title}
      </h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Content Details</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label={isComment ? "Comment On" : "Incident ID"} value={report.caseRef} />
              <InfoCell label="Content Type" value={isComment ? "Comment" : "Incident"} />
              <InfoCell
                label="User / Author"
                value={
                  author
                    ? author.anonymousOnThisItem
                      ? `${author.displayName} (posted anonymously)`
                      : author.displayName
                    : "Deleted account"
                }
              />
              <InfoCell label="Flag Source" value={flagSourceLabel(kase.sources)} />
              <InfoCell
                label="User Reports"
                value={
                  data.userFlags.length === flagsOpen
                    ? data.userFlags.length
                    : `${data.userFlags.length} (${flagsOpen} open)`
                }
              />
              <InfoCell
                label="Category"
                value={REPORT_CATEGORY_LABELS[report.category] ?? report.category}
              />
              <InfoCell
                label="Who Can See It"
                value={VISIBILITY_LABELS[report.visibility] ?? report.visibility}
              />
              <InfoCell label="Area" value={report.location.label ?? "Not given"} />
              <InfoCell
                label="Submitted At"
                value={formatDateTime(comment ? comment.createdAt : report.filedAt)}
              />
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">
                {isComment ? "Parent Original Incident" : "Full Original Incident"}
              </div>
              {isComment ? (
                <TargetStateBadge targetType="report" state={report.moderationState} />
              ) : null}
            </div>
            <div className="content-block">
              <div className="content-sub-label">Title</div>
              <div className="content-title-text">{report.title}</div>
            </div>
            <div className="content-block" style={{ marginBottom: 0 }}>
              <div className="content-sub-label">Summary</div>
              <ReportBody report={report} />
            </div>
            <div className="action-help-text" style={{ marginTop: 4 }}>
              Filed {formatDateTime(report.filedAt)}
              {report.lastEditedAt ? ` · Edited ${formatDateTime(report.lastEditedAt)}` : ""}
              {report.resubmissionCount > 0
                ? ` · Resubmitted ${report.resubmissionCount} of 3 times`
                : ""}
              {report.urgent ? " · Marked urgent by the author" : ""}
            </div>
          </div>

          {comment ? (
            <div className="detail-card">
              <div className="detail-card-head">
                <div className="card-section-label">Flagged Comment</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
                Posted under discussion thread:{" "}
                <strong style={{ color: "var(--accent)", fontWeight: 700 }}>
                  {report.caseRef} · {report.title}
                </strong>
              </div>
              <div className="flagged-comment-box">
                <div className="flagged-comment-head">
                  <div className="flagged-comment-avatar" aria-hidden="true">
                    {initials(comment.author?.displayName ?? "?")}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: "var(--text)" }}>
                      {comment.author?.displayName ?? "Deleted account"}
                      {comment.anonymous ? " (posted anonymously)" : ""}
                    </strong>
                    <span style={{ color: "var(--muted)", fontSize: 11.5, marginLeft: 6 }}>
                      · {formatDateTime(comment.createdAt)}
                    </span>
                  </div>
                </div>
                <div
                  className="content-body-text flagged-comment-body"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  “{comment.body}”
                </div>
              </div>
              {comment.parentId ? (
                <div className="action-help-text">A reply to another comment on the thread.</div>
              ) : null}
              {comment.status !== "visible" ? (
                <div className="action-help-text">
                  {comment.status === "removed"
                    ? "The author has since removed this comment."
                    : "This comment is currently hidden from the thread."}
                </div>
              ) : null}
            </div>
          ) : null}

          <AiAssessmentCard
            ai={data.ai}
            holdReasons={kase.holdReasons}
            caseSafetyRisk={kase.safetyRisk}
            runs={data.runs}
          />

          <KeywordMatchesCard hits={data.keywordHits} />

          <UserReportsCard flags={data.userFlags} caseId={kase.id} />

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Evidences ({report.evidence.length})</div>
              {isComment && report.evidence.length > 0 ? (
                <span className="readonly-hint">From the parent incident</span>
              ) : null}
            </div>
            <EvidenceGrid
              files={report.evidence}
              onView={openEvidence}
              viewingId={viewingId}
              {...(canHideEvidence
                ? {
                    onHide: (evidenceId: string) => setDialog({ kind: "hide", evidenceId }),
                    hideDeniedReason: decideDenied ?? null,
                  }
                : {})}
            />
            {thumbnailOnly > 0 ? (
              <div className="action-help-text">
                {thumbnailOnly} photo{thumbnailOnly === 1 ? " is" : "s are"} shown to members as a
                thumbnail only; a moderator's approval releases the full file.
              </div>
            ) : null}
            {stillUploading > 0 ? (
              <div className="action-help-text" style={{ marginTop: thumbnailOnly > 0 ? 4 : 12 }}>
                {stillUploading} file{stillUploading === 1 ? " is" : "s are"} not sealed yet and
                cannot be opened. Each gets its own automated check once it is.
              </div>
            ) : null}
          </div>

          {data.previousRejection ? (
            <PreviousRejectionCard
              rejection={data.previousRejection}
              resubmissionCount={report.resubmissionCount}
            />
          ) : null}

          <CaseHistoryCard items={data.history} targetType={kase.targetType} />
        </div>

        <div className="details-right">
          <div className="action-card">
            <div className="action-card-title">Content Decision</div>

            {!open ? (
              <>
                {kase.resolution ? <ResolutionBadge resolution={kase.resolution} /> : null}
                <dl style={{ margin: "14px 0 0", display: "grid", gap: 10 }}>
                  <ResolutionRow
                    label="Decided by"
                    value={kase.resolvedBy ? kase.resolvedBy.name : "The automated pipeline"}
                  />
                  <ResolutionRow label="Decided at" value={formatDateTime(kase.resolvedAt)} />
                  {kase.resolutionReasonLabel || kase.resolutionReason ? (
                    <ResolutionRow
                      label="Reason"
                      value={kase.resolutionReasonLabel ?? kase.resolutionReason ?? ""}
                    />
                  ) : null}
                  {kase.resolutionNote ? (
                    <ResolutionRow label="Note shown to the author" value={kase.resolutionNote} />
                  ) : null}
                  {kase.internalNote ? (
                    <ResolutionRow label="Internal note" value={kase.internalNote} />
                  ) : null}
                </dl>
                <div className="action-help-text">
                  This case is closed and shown read-only. New flags or an edit open a new case.
                </div>
              </>
            ) : deactivated ? (
              <>
                <div className="action-help-text" style={{ marginTop: 0 }}>
                  This incident was deactivated in Incident Management, so its moderation case
                  can't be decided. Reactivate it there first.
                </div>
                <Link
                  className="btn outline"
                  to={`/incidents/${report.id}`}
                  style={{ marginTop: 12, width: "100%" }}
                >
                  Open in Incident Management
                </Link>
              </>
            ) : (
              <>
                {unreadEdit ? (
                  // Review Q10: the version on screen is not the one the
                  // moderator started reading. Deciding waits until they say
                  // they have read it; the button moves `readVersion` forward.
                  <div
                    role="alert"
                    style={{
                      border: "1px solid var(--warning)",
                      background: "color-mix(in srgb, var(--warning) 9%, transparent)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      marginBottom: 12,
                      fontSize: 12.5,
                      color: "var(--text)",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>This report was edited since you opened it.</strong> The content on the
                    left is the new version. Review it before you decide.
                    <Button
                      variant="outline"
                      style={{ marginTop: 10, width: "100%" }}
                      onClick={() => setReadVersion(report.contentVersion)}
                    >
                      I've reviewed the new version
                    </Button>
                  </div>
                ) : null}
                <div className="action-btn-stack">
                  <button
                    type="button"
                    className={`approve-full-btn${decideDenied ? " perm-locked" : ""}`}
                    {...lockedProps(decideDenied)}
                    onClick={() => openDecision("approve")}
                  >
                    ✓ {approveLabel}
                  </button>
                  <button
                    type="button"
                    className={`reject-outline-btn${decideDenied ? " perm-locked" : ""}`}
                    {...lockedProps(decideDenied)}
                    onClick={() => openDecision("reject")}
                  >
                    ✕ {rejectLabel}
                  </button>
                  {canRerun ? (
                    <button
                      type="button"
                      className={`warn-outline-btn${decideDenied ? " perm-locked" : ""}`}
                      disabled={Boolean(decideDenied) || decisionBusy || checkRunning}
                      {...(decideDenied
                        ? { title: decideDenied }
                        : checkRunning
                          ? { title: "An automated check is already running." }
                          : {})}
                      onClick={() => rerun.mutate({ caseId, subject })}
                    >
                      {rerun.isPending ? "Sending…" : "↻ Re-run AI"}
                    </button>
                  ) : null}
                </div>
                <div className="action-help-text">
                  {isComment
                    ? "Keeping the comment publishes it (or keeps it live) and dismisses its user reports. Removing it takes it down and tells the commenter the reason."
                    : "Publishing makes it visible in the community feed. It does not verify it — verification happens in Incident Management. Rejecting requires a reason, which is shown to the author."}
                </div>
                {canRerun ? (
                  <div className="action-help-text" style={{ marginTop: 8 }}>
                    The AI could not assess this. Re-run sends it back through the automated
                    check; the case stays open until the result is in.
                  </div>
                ) : null}
                {targetState === "pending" ? (
                  <div className="action-help-text" style={{ marginTop: 8 }}>
                    An automated check is running on this content; this page updates when it
                    finishes. Deciding now overrides it.
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Whatever the case state (review Q9): enforcement is not a content
              decision, and this is the only screen that bans or lifts a ban. */}
          <div className="action-card">
            <div className="action-card-title">User Enforcement</div>
            {!author ? (
              <div className="action-help-text" style={{ marginTop: 0 }}>
                The author's account no longer exists, so there is nobody to ban.
              </div>
            ) : author.status === "banned" ? (
              <>
                <div className="action-btn-stack">
                  <button
                    type="button"
                    className={`warn-outline-btn${banDenied ? " perm-locked" : ""}`}
                    disabled={Boolean(banDenied) || unban.isPending}
                    {...(banDenied ? { title: banDenied } : {})}
                    onClick={() => setDialog({ kind: "unban" })}
                  >
                    Lift Ban
                  </button>
                </div>
                <div className="action-help-text">
                  {author.displayName} is banned. Lifting the ban lets them sign in again;
                  content decisions are unchanged.
                </div>
              </>
            ) : (
              <>
                <div className="action-btn-stack">
                  <button
                    type="button"
                    className={`ban-full-btn${banDenied ? " perm-locked" : ""}`}
                    disabled={Boolean(banDenied) || ban.isPending || author.status === "deleted"}
                    {...(banDenied ? { title: banDenied } : {})}
                    onClick={() => setDialog({ kind: "ban" })}
                  >
                    ⊝ Ban User
                  </button>
                </div>
                <div className="action-help-text">
                  Permanent ban only. Enforcement is independent of the content decision.
                </div>
              </>
            )}
          </div>

          <AuthorCard author={author} />
        </div>
      </div>

      <CaseDecisionDialog
        open={dialog.kind === "decision"}
        mode={dialog.kind === "decision" ? dialog.mode : "approve"}
        targetType={kase.targetType}
        live={live}
        subject={subject}
        notice={dialog.kind === "decision" && dialog.mode === "approve" ? approveNotice : undefined}
        warning={dialogWarning}
        busy={approve.isPending || reject.isPending}
        onClose={closeDialog}
        onConfirm={(values) => void onDecision(values)}
      />

      <BanMemberDialog
        open={dialog.kind === "ban"}
        name={authorName}
        busy={ban.isPending}
        onClose={closeDialog}
        onConfirm={(values) => void onBan(values)}
      />

      <ConfirmDialog
        open={dialog.kind === "unban"}
        title="Lift Ban?"
        description={`${authorName} will be able to sign in again. Their content decisions are unchanged.`}
        confirmLabel="Lift Ban"
        busy={unban.isPending}
        onConfirm={() => void onUnban()}
        onCancel={closeDialog}
      />

      <HideEvidenceDialog
        open={dialog.kind === "hide"}
        fileLabel={hideLabel}
        busy={rejectEvidence.isPending}
        onClose={closeDialog}
        onConfirm={(values) => void onHide(values)}
      />
    </div>
  );
}

/** One line of a resolved case's record. */
function ResolutionRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="info-cell-label">{label}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: 12.5,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/*
 * Remounting on the case id, rather than resetting state in an effect.
 *
 * This screen keeps local state (an open dialog, a typed note, the file being
 * opened). Moving to another case with previous/next has to clear all of it,
 * and an effect that did so would run *after* the first render — one frame of
 * the new case wearing the old case's dialog. Changing `key` makes React
 * discard the instance instead.
 */
export function ModerationDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  return <ModerationDetailView key={caseId} caseId={caseId ?? ""} />;
}

export default ModerationDetailPage;
