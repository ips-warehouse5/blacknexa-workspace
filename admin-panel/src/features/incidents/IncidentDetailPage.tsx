/**
 * Incident detail — the case record for one report.
 *
 * Left column is the case as it stands: information, the reporter's account,
 * evidence, and the lifecycle so far. Right column is what an operator can do
 * about it, gated by role.
 *
 * Which actions appear depends on where the incident already is. A verified
 * incident cannot be verified again, and offering a dismissed one a "dismiss"
 * button invites a click that means nothing.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useToast } from "@/app/providers/ToastProvider";
import { useDeniedReason } from "@/components/rbac/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Page";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { STATUS_TONES } from "@/features/incidents/IncidentsTable";
import { EvidenceGrid } from "@/features/moderation/components/EvidenceGrid";
import { incidents } from "@/mocks/incidents";
import { useAuthStore } from "@/stores/auth.store";
import type { Incident, IncidentNote } from "@/mocks/types";

type Action = "verify" | "dismiss" | "deactivate" | "assign" | null;

/** Operators an incident can be assigned to. */
const ASSIGNEES = [
  { value: "Advocate R. Idris", label: "Advocate R. Idris" },
  { value: "Advocate Jason Ross", label: "Advocate Jason Ross" },
  { value: "Advocate Sarah Miller", label: "Advocate Sarah Miller" },
  { value: "Moderator M. Kaur", label: "Moderator M. Kaur" },
  { value: "Moderator David Lee", label: "Moderator David Lee" },
];

const DISMISS_REASONS = [
  { value: "insufficient", label: "Insufficient evidence" },
  { value: "duplicate", label: "Duplicate report" },
  { value: "outofscope", label: "Outside platform scope" },
  { value: "withdrawn", label: "Withdrawn by reporter" },
];

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  );
}

function IncidentDetailView() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const admin = useAuthStore((s) => s.admin);

  const verifyDenied = useDeniedReason("incidents.verify");
  const dismissDenied = useDeniedReason("incidents.dismiss");
  const deactivateDenied = useDeniedReason("incidents.deactivate");
  const assignDenied = useDeniedReason("incidents.assign");
  const notesDenied = useDeniedReason("incidents.notes");

  const source = useMemo(
    () => incidents.find((i) => i.id === incidentId),
    [incidentId],
  );

  /*
   * A local copy so that actions taken on this screen are visible immediately,
   * the way the prototype behaves. Nothing is persisted — a reload restores the
   * fixture.
   */
  const [incident, setIncident] = useState<Incident | undefined>(source);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    document.title = incident
      ? `${incident.id} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [incident]);

  if (!incident) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>Incident not found</h2>
          <p>No incident matches “{incidentId}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/incidents">
              Back to incidents
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  /** Append a note to the timeline, stamped with who added it. */
  const addEntry = (text: string, author = admin?.name ?? "Operator") => {
    const entry: IncidentNote = {
      author,
      date: new Date().toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      text,
    };
    setIncident((current) =>
      current ? { ...current, notes: [...current.notes, entry] } : current,
    );
  };

  const runAction = () => {
    if (!action) return;

    if (action === "assign") {
      setIncident((current) =>
        current
          ? { ...current, assignee, status: current.status === "Submitted" ? "Under Review" : current.status }
          : current,
      );
      addEntry(`Assigned to ${assignee}.`, "System");
      toast.success("Incident assigned", `${incident.id} is now with ${assignee}.`);
    } else if (action === "verify") {
      setIncident((current) => (current ? { ...current, status: "Verified" } : current));
      addEntry("Incident verified after review of the supporting evidence.", "System");
      toast.success("Incident verified", `${incident.id} is now published as verified.`);
    } else if (action === "dismiss") {
      const label = DISMISS_REASONS.find((r) => r.value === reason)?.label ?? reason;
      setIncident((current) => (current ? { ...current, status: "Dismissed" } : current));
      addEntry(`Incident dismissed — ${label}.`, "System");
      toast.success("Incident dismissed", `${incident.id} has been closed.`);
    } else if (action === "deactivate") {
      setIncident((current) => (current ? { ...current, status: "Deactivated" } : current));
      addEntry("Incident deactivated and removed from public view.", "System");
      toast.success("Incident deactivated", `${incident.id} is no longer publicly visible.`);
    }

    setAction(null);
    setReason("");
  };

  const submitNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    addEntry(text);
    setNoteDraft("");
    toast.success("Note added", "Your note is on the case record.");
  };

  const open = incident.status === "Submitted" || incident.status === "Under Review";
  const live = incident.status === "Verified";

  return (
    <div className="details-page">
      <div className="details-top-bar">
        <button
          type="button"
          className="back-btn-pill"
          title="Back to incidents"
          aria-label="Back to the incident queue"
          onClick={() => navigate("/incidents")}
        >
          ←
        </button>
        <div className="meta-chip-wrap">
          <strong>{incident.id}</strong>
          <Badge tone={STATUS_TONES[incident.status]}>{incident.status}</Badge>
          <span className="badge flag-source-badge">{incident.assignee}</span>
        </div>
      </div>

      <h1 className="details-main-title">{incident.title}</h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Incident Information</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label="Author / Reporter" value={incident.author} />
              <InfoCell label="Category" value={incident.category} />
              <InfoCell label="Visibility" value={incident.visibility} />
              <InfoCell label="Location / Area" value={incident.location} />
              <InfoCell label="Submitted At" value={incident.submitted} />
              <InfoCell label="Assigned To" value={incident.assignee} />
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Incident Story</div>
            </div>
            <div className="content-body-text">
              {incident.story.split("\n\n").map((paragraph, i) => (
                <p key={i} style={{ margin: "0 0 12px" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">
                Evidence ({incident.evidence.length})
              </div>
            </div>
            <EvidenceGrid
              items={incident.evidence.map((file) => ({
                ...file,
                date: incident.submitted,
              }))}
            />
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Incident Lifecycle</div>
            </div>
            <div className="notes-feed">
              {incident.notes.map((entry, i) => (
                <div className="note-item" key={`${entry.date}-${i}`}>
                  <div className="note-head">
                    <strong>{entry.author}</strong>
                    <span>{entry.date}</span>
                  </div>
                  <div>{entry.text}</div>
                </div>
              ))}
            </div>

            <div className="note-input-wrap">
              <label className="sr-only" htmlFor="incident-note">
                Add a case note
              </label>
              <textarea
                id="incident-note"
                className="note-textarea"
                value={noteDraft}
                placeholder={
                  notesDenied ?? "Add an internal case note. Visible to operators only."
                }
                disabled={Boolean(notesDenied)}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <Button
                  variant="primary"
                  disabled={!noteDraft.trim()}
                  {...(notesDenied ? { deniedReason: notesDenied } : {})}
                  onClick={submitNote}
                >
                  Add Note
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="details-right">
          {open ? (
            <div className="action-card">
              <div className="action-card-title">Case Decision</div>
              <div className="action-btn-stack">
                <button
                  type="button"
                  className={`approve-full-btn${verifyDenied ? " perm-locked" : ""}`}
                  disabled={Boolean(verifyDenied)}
                  {...(verifyDenied ? { title: verifyDenied } : {})}
                  onClick={() => setAction("verify")}
                >
                  ✓ Verify Incident
                </button>
                <button
                  type="button"
                  className={`reject-outline-btn${dismissDenied ? " perm-locked" : ""}`}
                  disabled={Boolean(dismissDenied)}
                  {...(dismissDenied ? { title: dismissDenied } : {})}
                  onClick={() => setAction("dismiss")}
                >
                  ✕ Dismiss Incident
                </button>
              </div>
              <div className="action-help-text">
                Verifying publishes the incident as confirmed. Dismissing closes it and records
                the reason on the case.
              </div>
            </div>
          ) : (
            <div className="action-card">
              <div className="action-card-title">Case Record</div>
              <p className="action-help-text" style={{ marginTop: 0 }}>
                This incident is <strong>{incident.status.toLowerCase()}</strong>. No further
                decision is available.
              </p>
            </div>
          )}

          <div className="action-card">
            <div className="action-card-title">Assignment</div>
            <div className="action-btn-stack">
              <Button
                variant="outline"
                {...(assignDenied ? { deniedReason: assignDenied } : {})}
                onClick={() => {
                  setAssignee(
                    incident.assignee === "Unassigned" ? (ASSIGNEES[0]?.value ?? "") : incident.assignee,
                  );
                  setAction("assign");
                }}
              >
                {incident.assignee === "Unassigned" ? "Assign Case" : "Reassign Case"}
              </Button>
            </div>
            <div className="action-help-text">
              Currently with <strong>{incident.assignee}</strong>.
            </div>
          </div>

          {live ? (
            <div className="action-card">
              <div className="action-card-title">Visibility</div>
              <div className="action-btn-stack">
                <button
                  type="button"
                  className={`ban-full-btn${deactivateDenied ? " perm-locked" : ""}`}
                  disabled={Boolean(deactivateDenied)}
                  {...(deactivateDenied ? { title: deactivateDenied } : {})}
                  onClick={() => setAction("deactivate")}
                >
                  ⊝ Deactivate Incident
                </button>
              </div>
              <div className="action-help-text">
                Removes the incident from public view. The case record is kept.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={
          action === "verify"
            ? "Verify this incident"
            : action === "dismiss"
              ? "Dismiss this incident"
              : action === "deactivate"
                ? "Deactivate this incident"
                : "Assign this case"
        }
        description={
          action === "verify"
            ? `${incident.id} will be published as a verified incident.`
            : action === "dismiss"
              ? "The reporter is told the outcome. Pick the closest reason."
              : action === "deactivate"
                ? `${incident.id} will be hidden from public view. The case record is kept.`
                : "Choose the operator who will handle this case."
        }
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action === "verify" || action === "assign" ? "primary" : "danger"}
              disabled={action === "dismiss" && !reason}
              onClick={runAction}
            >
              {action === "verify"
                ? "Verify"
                : action === "dismiss"
                  ? "Dismiss"
                  : action === "deactivate"
                    ? "Deactivate"
                    : "Assign"}
            </Button>
          </>
        }
      >
        {action === "dismiss" ? (
          <Select
            label="Dismissal reason"
            showLabel
            value={reason}
            placeholder="Select a reason…"
            options={DISMISS_REASONS}
            onChange={setReason}
          />
        ) : null}

        {action === "assign" ? (
          <Select
            label="Assign to"
            showLabel
            value={assignee}
            options={ASSIGNEES}
            onChange={setAssignee}
          />
        ) : null}
      </Modal>
    </div>
  );
}


/*
 * Remounting on the id, rather than resetting state in an effect.
 *
 * This screen keeps local edits (the action dialog, a typed reason). Moving to
 * another record has to clear all of it, and the effect that did so ran *after*
 * the first render — so for one frame the new record was shown wearing the old
 * record's dialog state. Changing `key` makes React discard the instance
 * instead, which is both correct on the first frame and simpler to read.
 */
export function IncidentDetailPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  return <IncidentDetailView key={incidentId} />;
}

export default IncidentDetailPage;
