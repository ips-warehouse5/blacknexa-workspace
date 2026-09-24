/**
 * Incident detail — the case record for one report (plan §9.2, contract §3.4).
 *
 * Layout is the prototype's `#incidentDetails`: a top bar (INCIDENT · BNX ref,
 * status pill, moderation chip, assigned badge), the title, then two columns.
 * Left is the case as it stands — Incident Information, Incident Story,
 * Uploaded Evidences, Incident Lifecycle. Right is what an operator can do
 * about it — the Case Decision / Case Record card, Case Assignment, Internal
 * Admin Notes.
 *
 * ── What decides what is shown ──────────────────────────────────────────────
 * Three inputs, each owned by the server, and the page only combines them:
 *   • `detail.access` — the tier (contract §3.0). Staff get metadata only: the
 *     story and the files are withheld and the page says so instead of
 *     rendering blanks. Advocates reach only their assignments; anything else
 *     is a 404, which renders as "not found" exactly like a missing id, so the
 *     page never confirms an incident exists to someone who may not see it.
 *   • `detail.actions` — which workflow buttons the incident's *state* allows
 *     (a verified case cannot be verified again; a case waiting on Content
 *     Moderation cannot be verified at all). A button the state rules out is
 *     not drawn.
 *   • the permission (`useDeniedReason`) — a button the state allows but the
 *     *role* does not is drawn locked with the reason, because an action other
 *     operators visibly have should read as a closed door, not a missing
 *     feature (the `Button` / `Can` convention).
 *
 * ── Two axes (D1) ───────────────────────────────────────────────────────────
 * Verify / Dismiss / Reopen decide the case; publication is Content
 * Moderation's. While the incident is not published, the decision card says
 * "Resolve the moderation case first" and links to `/moderation/<openCaseId>`.
 * Deactivate (from any state but deactivated) and Reactivate are the two
 * publication actions this screen owns (D10).
 *
 * Every decision refetches the detail on success, so the lifecycle, the notes
 * and the buttons always come from the server rather than from a local guess
 * at what the action did. A 409 (someone decided first, or the incident moved)
 * is a toast with the server's message and a refetch — see
 * `incidents.hooks.ts`.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { useToast } from "@/app/providers/ToastProvider";
import { EvidenceGrid } from "@/components/evidence/EvidenceGrid";
import { useCanNavigate, useDeniedReason, usePermission } from "@/components/rbac/Can";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Page";
import env from "@/config/env";
import { CaseAssignmentCard } from "@/features/incidents/components/CaseAssignmentCard";
import {
  CaseDecisionDialog,
  type CaseDecision,
  type CaseDecisionKind,
} from "@/features/incidents/components/CaseDecisionDialog";
import {
  IncidentStatusBadge,
  ModerationChip,
  UrgentBadge,
} from "@/features/incidents/components/IncidentBadges";
import { IncidentLifecycle } from "@/features/incidents/components/IncidentLifecycle";
import { InternalNotesCard } from "@/features/incidents/components/InternalNotesCard";
import { RecordField } from "@/features/incidents/components/RecordField";
import {
  authorLabel,
  formatDate,
  formatDateTime,
  formatOccurred,
  isIncidentId,
} from "@/features/incidents/incidents.format";
import {
  isStaleDecision,
  useDeactivateIncident,
  useDismissIncident,
  useIncidentDetail,
  useIncidentEvidenceLink,
  useReactivateIncident,
  useReopenIncident,
  useVerifyIncident,
} from "@/features/incidents/incidents.hooks";
import { latestEvent, lifecycleSteps } from "@/features/incidents/incidents.lifecycle";
import { incidentBackTarget } from "@/features/incidents/incidents.queue";
import {
  CATEGORY_LABELS,
  DISPLAY_STATUS_LABELS,
  EVIDENCE_STRENGTH_LABELS,
  LOCATION_PRECISION_LABELS,
  MODERATION_STATE_LABELS,
  REPORT_STATUS_LABELS,
  VISIBILITY_LABELS,
  type IncidentAuthorView,
  type IncidentDetail,
  type IncidentModerationView,
} from "@/features/incidents/incidents.types";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/types/api";

const MUTED_LINE: CSSProperties = { fontSize: 12, color: "var(--muted)", marginTop: 2 };

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

// ── Small pieces ────────────────────────────────────────────────────────────

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{children}</div>
    </div>
  );
}

/**
 * A full-width decision button in the prototype's styles (`approve-full-btn`,
 * `reject-outline-btn`, `warn-outline-btn`), locked with a reason when the role
 * lacks the permission.
 */
function ActionButton({
  className,
  denied,
  onClick,
  children,
}: {
  className: string;
  denied: string | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${className}${denied ? " perm-locked" : ""}`}
      disabled={Boolean(denied)}
      title={denied}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const ACCOUNT_STATUS_NOTES = {
  banned: "Account banned",
  suspended: "Account suspended",
  deleted: "Account deleted",
} as const;

function AuthorCell({ author }: { author: IncidentAuthorView | null }) {
  return (
    <>
      <div>{authorLabel(author)}</div>
      {author?.email ? <div style={MUTED_LINE}>{author.email}</div> : null}
      {author?.status && author.status !== "active" ? (
        <div style={{ ...MUTED_LINE, color: "var(--danger)" }}>
          {ACCOUNT_STATUS_NOTES[author.status]}
        </div>
      ) : null}
      {author?.memberSince ? (
        <div style={MUTED_LINE}>Member since {formatDate(author.memberSince)}</div>
      ) : null}
    </>
  );
}

/**
 * "Resolve the moderation case first" (§9.2).
 *
 * Case decisions need a published incident (the server refuses them with 409
 * otherwise), so while it is checking, held or rejected the card explains which
 * of the three it is and links to the moderation case — for operators who can
 * open Content Moderation; everyone else is told who resolves it.
 */
function ModerationNotice({
  moderation,
  canOpenModeration,
}: {
  moderation: IncidentModerationView;
  canOpenModeration: boolean;
}) {
  const why =
    moderation.state === "pending"
      ? "It is still going through the automated safety check. Case decisions open once it is published."
      : moderation.state === "held"
        ? "It is held for a moderator in Content Moderation. Case decisions open once it is published."
        : "A moderator rejected it, so it is not published. Case decisions open only if the author resubmits it and it is published.";

  return (
    <div
      role="note"
      style={{
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        lineHeight: 1.5,
        marginBottom: 12,
      }}
    >
      <strong style={{ display: "block", marginBottom: 2 }}>Resolve the moderation case first</strong>
      {why}
      {moderation.openCaseId ? (
        canOpenModeration ? (
          <div style={{ marginTop: 8 }}>
            <Link
              className="btn outline"
              to={`/moderation/${moderation.openCaseId}`}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              Open moderation case
            </Link>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>A moderator resolves it in Content Moderation.</div>
        )
      ) : null}
    </div>
  );
}

interface DeniedReasons {
  verify: string | undefined;
  dismiss: string | undefined;
  deactivate: string | undefined;
}

/**
 * The decision card, in the form the incident's state calls for: the
 * verification decision while the case is open, the prototype's CASE RECORD
 * once verified (verified by / at, privacy unchanged) or dismissed (reason,
 * Reopen), and the deactivation record with Reactivate once taken down.
 */
function CaseDecisionCard({
  detail,
  denied,
  canOpenModeration,
  onDecide,
}: {
  detail: IncidentDetail;
  denied: DeniedReasons;
  canOpenModeration: boolean;
  onDecide: (kind: CaseDecisionKind) => void;
}) {
  const { report, actions, moderation } = detail;

  const notice = actions.resolveModerationFirst ? (
    <ModerationNotice moderation={moderation} canOpenModeration={canOpenModeration} />
  ) : null;

  const deactivateButton = (label: string) =>
    actions.deactivate ? (
      <ActionButton
        className="warn-outline-btn"
        denied={denied.deactivate}
        onClick={() => onDecide("deactivate")}
      >
        {label}
      </ActionButton>
    ) : null;

  if (moderation.state === "deactivated") {
    const takenDown = latestEvent(detail.timeline, "incident.deactivate");
    return (
      <div className="action-card">
        <div className="action-card-title">Incident Deactivated</div>
        <RecordField label="Publication" emphasis>
          Taken down from public view
        </RecordField>
        <RecordField label="Reason">{moderation.reasonLabel ?? "Not recorded"}</RecordField>
        {moderation.note ? (
          <RecordField label="Note to the author">{moderation.note}</RecordField>
        ) : null}
        <RecordField label="Deactivated">
          {formatDateTime(moderation.moderatedAt)}
          {takenDown?.actor.name ? ` · ${takenDown.actor.name}` : ""}
        </RecordField>
        <RecordField label="Case Status" last>
          {REPORT_STATUS_LABELS[report.status]}
        </RecordField>
        {actions.reactivate ? (
          <div className="action-btn-stack">
            <ActionButton
              className="approve-full-btn"
              denied={denied.deactivate}
              onClick={() => onDecide("reactivate")}
            >
              Reactivate Incident
            </ActionButton>
          </div>
        ) : null}
        <div className="action-help-text">
          {moderation.reactivateRestores === "approved"
            ? "Reactivating publishes it again straight away and tells the reporter it is live again."
            : "Reactivating sends it back through the check before it is published, because it changed or was not published when it was taken down."}
        </div>
      </div>
    );
  }

  if (report.status === "verified") {
    return (
      <div className="action-card">
        <div className="action-card-title">Case Record</div>
        <RecordField label="Incident Status" emphasis>
          Verified
        </RecordField>
        <RecordField label="Verified By">{detail.verifiedBy?.name ?? "Not recorded"}</RecordField>
        <RecordField label="Verified At">{formatDateTime(detail.verifiedAt)}</RecordField>
        <RecordField label="Privacy" last>
          {VISIBILITY_LABELS[report.visibility]} — unchanged by verification
        </RecordField>
        {notice}
        <div className="action-btn-stack">{deactivateButton("⊘ Deactivate Incident")}</div>
      </div>
    );
  }

  if (report.status === "dismissed") {
    const dismissal = latestEvent(detail.timeline, "status.dismissed");
    return (
      <div className="action-card">
        <div className="action-card-title">Case Record</div>
        <RecordField label="Incident Status" emphasis>
          Dismissed
        </RecordField>
        <RecordField label="Reason">{dismissal?.reasonLabel ?? "Not recorded"}</RecordField>
        {dismissal?.note ? (
          <RecordField label="Note to the author">{dismissal.note}</RecordField>
        ) : null}
        <RecordField label="Dismissed" last>
          {dismissal
            ? `${formatDateTime(dismissal.at)}${dismissal.actor.name ? ` · ${dismissal.actor.name}` : ""}`
            : "—"}
        </RecordField>
        {notice}
        <div className="action-btn-stack">
          {actions.reopen ? (
            <Button
              variant="primary"
              style={{ width: "100%", padding: 11, fontWeight: 700, fontSize: 13 }}
              {...(denied.dismiss ? { deniedReason: denied.dismiss } : {})}
              onClick={() => onDecide("reopen")}
            >
              Reopen Case
            </Button>
          ) : null}
          {deactivateButton("⊘ Deactivate Incident")}
        </div>
        <div className="action-help-text">
          A dismissed incident stays visible. Reopening moves it back to Under Review and tells the
          reporter it is being reviewed again.
        </div>
      </div>
    );
  }

  return (
    <div className="action-card">
      <div className="action-card-title">Case Verification Decision</div>
      {notice}
      <div className="action-btn-stack">
        {actions.verify ? (
          <ActionButton
            className="approve-full-btn"
            denied={denied.verify}
            onClick={() => onDecide("verify")}
          >
            Mark Verified
          </ActionButton>
        ) : null}
        {actions.dismiss ? (
          <ActionButton
            className="reject-outline-btn"
            denied={denied.dismiss}
            onClick={() => onDecide("dismiss")}
          >
            Dismiss Incident
          </ActionButton>
        ) : null}
        {deactivateButton("Deactivate Incident")}
      </div>
      <div className="action-help-text">
        Marking verified activates the verified shield badge on the public feed. It does not change
        whether the incident is published — that is decided in Content Moderation.
      </div>
    </div>
  );
}

// ── States before there is an incident to show ─────────────────────────────

function IncidentUnavailable({ id, backTo }: { id: string; backTo: string }) {
  const role = useAuthStore((s) => s.admin?.role ?? null);
  return (
    <Card>
      <EmptyState
        title="Incident not found"
        message={
          role === "advocate"
            ? `No incident assigned to you matches “${id}”. Advocates can open only the incidents assigned to them.`
            : `No incident matches “${id}”. It may have been deleted by its author.`
        }
        action={
          <Link className="btn primary" to={backTo}>
            Back to incidents
          </Link>
        }
      />
    </Card>
  );
}

// ── The case ────────────────────────────────────────────────────────────────

function IncidentCase({ detail, backTo }: { detail: IncidentDetail; backTo: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { report, access, moderation, counts } = detail;

  const verifyDenied = useDeniedReason("incidents.verify");
  const dismissDenied = useDeniedReason("incidents.dismiss");
  const deactivateDenied = useDeniedReason("incidents.deactivate");
  const assignDenied = useDeniedReason("incidents.assign");
  const notesDenied = useDeniedReason("incidents.notes");
  const canAssign = usePermission("incidents.assign");
  const canOpenModeration = useCanNavigate("moderation");

  const [decision, setDecision] = useState<CaseDecisionKind | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const verify = useVerifyIncident();
  const dismiss = useDismissIncident();
  const reopen = useReopenIncident();
  const deactivate = useDeactivateIncident();
  const reactivate = useReactivateIncident();
  const evidenceLink = useIncidentEvidenceLink();

  const pending: Record<CaseDecisionKind, boolean> = {
    verify: verify.isPending,
    dismiss: dismiss.isPending,
    reopen: reopen.isPending,
    deactivate: deactivate.isPending,
    reactivate: reactivate.isPending,
  };

  const submitDecision = async (value: CaseDecision) => {
    const id = report.id;
    try {
      switch (value.kind) {
        case "verify":
          await verify.mutateAsync({ id, input: value.input });
          break;
        case "dismiss":
          await dismiss.mutateAsync({ id, input: value.input });
          break;
        case "reopen":
          await reopen.mutateAsync({ id, input: value.input });
          break;
        case "deactivate":
          await deactivate.mutateAsync({ id, input: value.input });
          break;
        case "reactivate":
          await reactivate.mutateAsync({ id, input: value.input });
          break;
      }
      setDecision(null);
    } catch (error) {
      // The hook has toasted it. A conflict, a refusal or a vanished incident
      // cannot succeed on a second click, so the dialog closes onto the
      // refetched state; anything else keeps it open with the notes intact.
      if (isStaleDecision(error)) setDecision(null);
    }
  };

  /**
   * Open one file in a new tab.
   *
   * The tab is opened inside the click, before the link is fetched: browsers
   * treat a window opened after an `await` as an unsolicited pop-up and block
   * it. It is pointed at the presigned URL when that arrives, and closed again
   * if the request fails. The opener is cut so the file's page cannot script
   * the console.
   */
  const viewEvidence = (evidenceId: string) => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setViewingId(evidenceId);
    evidenceLink.mutate(
      { id: report.id, evidenceId },
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

  const hidesContent = !access.seesContent || report.contentRedacted;
  const exact =
    access.seesContent && report.location.exactLat !== null && report.location.exactLng !== null
      ? `${report.location.exactLat.toFixed(5)}, ${report.location.exactLng.toFixed(5)}`
      : null;

  return (
    <div className="details-page">
      <div className="details-top-bar">
        <button
          type="button"
          className="back-btn-pill"
          title="Back to incidents"
          aria-label="Back to the incident queue"
          onClick={() => navigate(backTo)}
        >
          ←
        </button>
        <div className="meta-chip-wrap" style={{ flexWrap: "wrap" }}>
          <span>INCIDENT</span>
          <span aria-hidden="true">·</span>
          <strong>{report.caseRef}</strong>
          <IncidentStatusBadge status={report.status} moderationState={report.moderationState} />
          <ModerationChip moderationState={report.moderationState} />
          <span className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>
            Assigned: {detail.assignee?.name ?? "Unassigned"}
          </span>
          {report.urgent ? <UrgentBadge /> : null}
        </div>
      </div>

      <h1 className="details-main-title">{report.title}</h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Incident Information</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label="Author / Reporter">
                <AuthorCell author={detail.author} />
              </InfoCell>
              <InfoCell label="Category">
                {CATEGORY_LABELS[report.category] ?? report.category}
              </InfoCell>
              <InfoCell label="Visibility">{VISIBILITY_LABELS[report.visibility]}</InfoCell>
              <InfoCell label="Location / Area">
                <div>{report.location.label ?? "Not given"}</div>
                <div style={MUTED_LINE}>{LOCATION_PRECISION_LABELS[report.location.precision]}</div>
                {exact ? <div style={MUTED_LINE}>Exact point on record: {exact}</div> : null}
              </InfoCell>
              <InfoCell label="Submitted At">{formatDateTime(report.filedAt)}</InfoCell>
              <InfoCell label="Occurred At">{formatOccurred(report)}</InfoCell>
              <InfoCell label="Urgent">
                {report.urgent ? "Yes — marked urgent by the reporter" : "No"}
              </InfoCell>
              <InfoCell label="Publication">
                <div>{MODERATION_STATE_LABELS[moderation.state]}</div>
                <div style={MUTED_LINE}>
                  The author sees “{DISPLAY_STATUS_LABELS[moderation.displayStatus]}”
                </div>
              </InfoCell>
              <InfoCell label="Community Activity">
                <div>
                  {plural(counts.supports, "support")} · {plural(counts.corroborations, "corroboration")}
                </div>
                <div style={MUTED_LINE}>
                  {plural(counts.comments, "comment")} · {plural(counts.openFlags, "open flag")}
                  {counts.flags > counts.openFlags ? ` (${counts.flags} in total)` : ""}
                </div>
              </InfoCell>
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Incident Story</div>
              {report.lastEditedAt ? (
                <span className="readonly-hint">
                  Edited by the author · {formatDateTime(report.lastEditedAt)}
                </span>
              ) : null}
            </div>
            {hidesContent ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                Your role can see this incident’s details, but not the reporter’s account or the
                evidence files.
              </p>
            ) : report.bodyUnreadable || report.body === null ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>
                The reporter’s account could not be decrypted on this server. The rest of the case
                record is unaffected.
              </p>
            ) : (
              <div
                className="content-body-text"
                style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.65, overflowWrap: "anywhere" }}
              >
                {report.body}
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Uploaded Evidences ({report.evidence.length})</div>
              <span className="readonly-hint" title={detail.evidenceStrength.rationale}>
                Evidence strength:{" "}
                <strong>{EVIDENCE_STRENGTH_LABELS[detail.evidenceStrength.strength]}</strong>
              </span>
            </div>
            <EvidenceGrid
              files={report.evidence}
              {...(access.seesContent ? { onView: viewEvidence, viewingId } : {})}
              emptyText="No evidence files attached."
            />
            {!access.seesContent && report.evidence.length > 0 ? (
              <div className="action-help-text">
                Your role can see what was uploaded, but cannot open the files.
              </div>
            ) : null}
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Incident Lifecycle</div>
            </div>
            <IncidentLifecycle steps={lifecycleSteps(detail)} />
          </div>
        </div>

        <div className="details-right">
          <CaseDecisionCard
            detail={detail}
            denied={{ verify: verifyDenied, dismiss: dismissDenied, deactivate: deactivateDenied }}
            canOpenModeration={canOpenModeration}
            onDecide={setDecision}
          />
          <CaseAssignmentCard
            incidentId={report.id}
            caseRef={report.caseRef}
            assignee={detail.assignee}
            // The state's say (always true today, contract §3.4) and the role's.
            canAssign={canAssign && detail.actions.assign}
            assignDenied={assignDenied}
          />
          <InternalNotesCard incidentId={report.id} notes={detail.notes} notesDenied={notesDenied} />
        </div>
      </div>

      <CaseDecisionDialog
        kind={decision}
        caseRef={report.caseRef}
        reactivateRestores={moderation.reactivateRestores}
        busy={decision ? pending[decision] : false}
        onCancel={() => setDecision(null)}
        onSubmit={(value) => void submitDecision(value)}
      />
    </div>
  );
}

// ── Route component ─────────────────────────────────────────────────────────

function IncidentDetailView() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const location = useLocation();
  // The queue the row was opened from, with its tab, page and filters (review
  // Q17) — validated by `incidentBackTarget`, never an arbitrary path.
  const backTo = incidentBackTarget(location.state);

  // Old links (the prototype's "INC-20481") are not report ids; they are
  // answered as not found here rather than sent to the API to be refused.
  const valid = isIncidentId(incidentId);
  const query = useIncidentDetail(valid ? incidentId : "", valid);
  const caseRef = query.data?.report.caseRef;

  useEffect(() => {
    document.title = caseRef
      ? `${caseRef} · ${env.appName} Admin`
      : `Incident · ${env.appName} Admin`;
  }, [caseRef]);

  const notFound =
    !valid || (query.isError && query.error instanceof ApiError && query.error.status === 404);

  if (notFound) return <IncidentUnavailable id={incidentId ?? ""} backTo={backTo} />;

  // A failed background refetch keeps the last good copy on screen; only a
  // first load that fails replaces the page with the error.
  if (query.data) return <IncidentCase detail={query.data} backTo={backTo} />;

  if (query.isError) {
    return (
      <Card>
        <EmptyState
          title="Could not load the incident"
          message={
            query.error instanceof ApiError
              ? query.error.message
              : "Something went wrong while loading this incident."
          }
          action={
            <div style={{ display: "inline-flex", gap: 10 }}>
              <button type="button" className="btn outline" onClick={() => void query.refetch()}>
                Try again
              </button>
              <Link className="btn primary" to={backTo}>
                Back to incidents
              </Link>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="page-placeholder" aria-busy="true">
        <p>Loading the incident…</p>
      </div>
    </Card>
  );
}

/*
 * Remounting on the id, rather than resetting state in an effect.
 *
 * This screen keeps local state (an open decision dialog, a typed note, an
 * assignment being edited). Moving to another record has to clear all of it,
 * and an effect that did so would run *after* the first render — so for one
 * frame the new record would be shown wearing the old record's dialog state.
 * Changing `key` makes React discard the instance instead.
 */
export function IncidentDetailPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  return <IncidentDetailView key={incidentId} />;
}

export default IncidentDetailPage;
