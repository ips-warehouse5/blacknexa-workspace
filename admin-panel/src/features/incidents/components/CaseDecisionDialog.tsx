/**
 * The confirmation for every case decision on the incident detail page:
 * Verify, Dismiss, Reopen, Deactivate and Reactivate (plan §9.2, contract §3.6).
 *
 * One dialog rather than five because the five share their shape — a title, a
 * sentence saying exactly what will happen, at most a reason and two notes —
 * and keeping them together means the note rules cannot drift between them.
 * The copy is the prototype's where it had some: "Verify Incident?" with "…and
 * the content decision is unchanged" (the D1 promise — verification never
 * touches publication), and "Select a predefined reason and add any relevant
 * context." for Dismiss and Deactivate, with "Dismiss & Submit" /
 * "Deactivate & Submit".
 *
 * ── The two notes ───────────────────────────────────────────────────────────
 * The prototype had one "Custom Reason" box. The API separates what the author
 * reads from what operators read, so the dialog does too:
 *   • Note to the author (`publicNote`, ≤ 512) — Dismiss and Deactivate. The
 *     author sees the reason label and this note. Required when the reason is
 *     "Other" (§3.3: `other` always requires a note), checked here so the
 *     operator is told before the request rather than by a 400.
 *   • Internal note (`internalNote` / `note`, ≤ 2000) — stored as an Internal
 *     Admin Note, never on the author's timeline. Required only to Reopen:
 *     undoing a dismissal needs a reason on the record.
 *
 * The form is remounted per decision (keyed on the kind), so every dialog
 * opens blank instead of carrying the last one's reason and notes.
 */

import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  DEACTIVATE_REASON_CODES,
  DEACTIVATE_REASON_LABELS,
  DISMISS_REASON_CODES,
  DISMISS_REASON_LABELS,
  INTERNAL_NOTE_MAX,
  PUBLIC_NOTE_MAX,
  REASON_NEEDING_NOTE,
  type DeactivateIncidentInput,
  type DeactivateReasonCode,
  type DismissIncidentInput,
  type DismissReasonCode,
  type ReactivateIncidentInput,
  type ReopenIncidentInput,
  type VerifyIncidentInput,
} from "@/features/incidents/incidents.types";

export type CaseDecision =
  | { kind: "verify"; input: VerifyIncidentInput }
  | { kind: "dismiss"; input: DismissIncidentInput }
  | { kind: "reopen"; input: ReopenIncidentInput }
  | { kind: "deactivate"; input: DeactivateIncidentInput }
  | { kind: "reactivate"; input: ReactivateIncidentInput };

export type CaseDecisionKind = CaseDecision["kind"];

export interface CaseDecisionDialogProps {
  /** The decision being confirmed, or null when no dialog is open. */
  kind: CaseDecisionKind | null;
  caseRef: string;
  /** What Reactivate would do now (from the detail); decides that dialog's copy. */
  reactivateRestores: "approved" | "pending" | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (decision: CaseDecision) => void;
}

const OTHER_NEEDS_NOTE = "Add a note that explains the reason when you choose “Other”.";
const NOTE_TOO_LONG = "Keep a note under 2,000 characters.";
const PUBLIC_NOTE_TOO_LONG = "Keep the note to the author under 512 characters.";
const REOPEN_NEEDS_NOTE = "Say why the case is being reopened.";

const DISMISS_OPTIONS = DISMISS_REASON_CODES.map((code) => ({
  value: code as string,
  label: DISMISS_REASON_LABELS[code],
}));

const DEACTIVATE_OPTIONS = DEACTIVATE_REASON_CODES.map((code) => ({
  value: code as string,
  label: DEACTIVATE_REASON_LABELS[code],
}));

function isDismissReason(value: string): value is DismissReasonCode {
  return (DISMISS_REASON_CODES as readonly string[]).includes(value);
}

function isDeactivateReason(value: string): value is DeactivateReasonCode {
  return (DEACTIVATE_REASON_CODES as readonly string[]).includes(value);
}

/** An optional note, present only when something was typed. */
function optional<K extends string>(key: K, value: string): { [P in K]?: string } {
  return (value ? { [key]: value } : {}) as { [P in K]?: string };
}

export function CaseDecisionDialog(props: CaseDecisionDialogProps) {
  if (!props.kind) return null;
  return <DecisionForm key={props.kind} {...props} kind={props.kind} />;
}

function DecisionForm({
  kind,
  caseRef,
  reactivateRestores,
  busy,
  onCancel,
  onSubmit,
}: CaseDecisionDialogProps & { kind: CaseDecisionKind }) {
  const hasReason = kind === "dismiss" || kind === "deactivate";

  // Prototype defaults: the first reason in each catalogue is preselected.
  const [reason, setReason] = useState<string>(
    kind === "dismiss" ? "not_credible" : kind === "deactivate" ? "reporter_request" : "",
  );
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  /** Errors are shown after the first attempt, not while the operator is still typing. */
  const [attempted, setAttempted] = useState(false);

  const publicId = useId();
  const internalId = useId();

  const trimmedPublic = publicNote.trim();
  const trimmedInternal = internalNote.trim();
  const needsPublicNote = hasReason && reason === REASON_NEEDING_NOTE;

  const publicError =
    needsPublicNote && !trimmedPublic
      ? OTHER_NEEDS_NOTE
      : trimmedPublic.length > PUBLIC_NOTE_MAX
        ? PUBLIC_NOTE_TOO_LONG
        : null;
  const internalError =
    kind === "reopen" && !trimmedInternal
      ? REOPEN_NEEDS_NOTE
      : trimmedInternal.length > INTERNAL_NOTE_MAX
        ? NOTE_TOO_LONG
        : null;

  const submit = () => {
    setAttempted(true);
    if (publicError || internalError) return;

    switch (kind) {
      case "verify":
        onSubmit({ kind, input: optional("note", trimmedInternal) });
        return;
      case "reopen":
        onSubmit({ kind, input: { note: trimmedInternal } });
        return;
      case "reactivate":
        onSubmit({ kind, input: optional("note", trimmedInternal) });
        return;
      case "dismiss":
        if (!isDismissReason(reason)) return;
        onSubmit({
          kind,
          input: {
            reasonCode: reason,
            ...optional("publicNote", trimmedPublic),
            ...optional("internalNote", trimmedInternal),
          },
        });
        return;
      case "deactivate":
        if (!isDeactivateReason(reason)) return;
        onSubmit({
          kind,
          input: {
            reasonCode: reason,
            ...optional("publicNote", trimmedPublic),
            ...optional("internalNote", trimmedInternal),
          },
        });
        return;
    }
  };

  const copy = dialogCopy(kind, caseRef, reactivateRestores);
  const showPublicError = attempted && publicError;
  const showInternalError = attempted && internalError;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      title={copy.title}
      description={copy.description}
      // Typed notes should not be lost to a stray click on the backdrop.
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={copy.destructive ? "danger" : "primary"}
            loading={busy}
            onClick={submit}
            // The prototype's Verify confirm is green: it is a positive
            // verdict, not a generic primary action.
            {...(kind === "verify"
              ? { style: { background: "#0E8A5F", borderColor: "#0E8A5F", color: "#ffffff" } }
              : {})}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {hasReason ? (
        <Select
          label="Predefined Reason"
          showLabel
          value={reason}
          options={kind === "dismiss" ? DISMISS_OPTIONS : DEACTIVATE_OPTIONS}
          onChange={setReason}
        />
      ) : null}

      {hasReason ? (
        <>
          <label htmlFor={publicId}>
            Note to the author {needsPublicNote ? "(required for “Other”)" : "(optional)"}
          </label>
          <textarea
            id={publicId}
            value={publicNote}
            maxLength={PUBLIC_NOTE_MAX}
            placeholder="Enter additional reason..."
            aria-describedby={`${publicId}-hint${showPublicError ? ` ${publicId}-error` : ""}`}
            {...(showPublicError ? { "aria-invalid": true } : {})}
            onChange={(e) => setPublicNote(e.target.value)}
          />
          <div
            className="field-hint"
            id={`${publicId}-hint`}
            style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
          >
            <span>The reporter sees the reason and this note.</span>
            <span>
              {publicNote.length} / {PUBLIC_NOTE_MAX}
            </span>
          </div>
          {showPublicError ? (
            <div className="field-error-msg" id={`${publicId}-error`} style={{ display: "block" }}>
              {publicError}
            </div>
          ) : null}
        </>
      ) : null}

      <label htmlFor={internalId}>{copy.internalLabel}</label>
      <textarea
        id={internalId}
        value={internalNote}
        maxLength={INTERNAL_NOTE_MAX}
        placeholder={copy.internalPlaceholder}
        aria-describedby={`${internalId}-hint${showInternalError ? ` ${internalId}-error` : ""}`}
        {...(showInternalError ? { "aria-invalid": true } : {})}
        onChange={(e) => setInternalNote(e.target.value)}
      />
      <div
        className="field-hint"
        id={`${internalId}-hint`}
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <span>Visible to operators only — kept in Internal Admin Notes.</span>
        {internalNote.length > INTERNAL_NOTE_MAX - 400 ? (
          <span>
            {internalNote.length} / {INTERNAL_NOTE_MAX}
          </span>
        ) : null}
      </div>
      {showInternalError ? (
        <div className="field-error-msg" id={`${internalId}-error`} style={{ display: "block" }}>
          {internalError}
        </div>
      ) : null}
    </Modal>
  );
}

interface DialogCopy {
  title: string;
  description: string;
  confirm: string;
  destructive: boolean;
  internalLabel: string;
  internalPlaceholder: string;
}

/** What each dialog says. Specific, because this is the last stop before the author is told. */
function dialogCopy(
  kind: CaseDecisionKind,
  caseRef: string,
  reactivateRestores: "approved" | "pending" | null,
): DialogCopy {
  const optionalInternal = {
    internalLabel: "Internal note (optional)",
    internalPlaceholder: "Add context for the case record...",
  };

  switch (kind) {
    case "verify":
      return {
        title: "Verify Incident?",
        // The prototype's copy, verbatim: verification is a case verdict and
        // never a publication decision (D1).
        description:
          "You are about to mark this incident as Verified — it can proceed as a credible case. A private incident stays private, no user is banned, and the content decision is unchanged.",
        confirm: "Verify Incident",
        destructive: false,
        ...optionalInternal,
      };
    case "dismiss":
      return {
        title: "Dismiss Incident",
        description:
          "Select a predefined reason and add any relevant context. The reporter is told the outcome; a dismissed incident stays visible.",
        confirm: "Dismiss & Submit",
        destructive: true,
        ...optionalInternal,
      };
    case "reopen":
      return {
        title: "Reopen Case?",
        description: `${caseRef} moves back to Under Review, and the reporter is told it is being reviewed again.`,
        confirm: "Reopen Case",
        destructive: false,
        internalLabel: "Why is the case being reopened? (required)",
        internalPlaceholder: "Explain what changed...",
      };
    case "deactivate":
      return {
        title: "Deactivate Incident",
        description:
          "Select a predefined reason and add any relevant context. It is taken down from public view straight away, any open moderation case on it or its comments is closed, and the reporter is told the reason.",
        confirm: "Deactivate & Submit",
        destructive: true,
        ...optionalInternal,
      };
    case "reactivate":
      return {
        title: "Reactivate Incident?",
        description:
          reactivateRestores === "approved"
            ? `${caseRef} is published again straight away, and the reporter is told it is live again.`
            : `${caseRef} goes back through the check before it is published, because it changed or was not published when it was taken down.`,
        confirm: "Reactivate Incident",
        destructive: false,
        ...optionalInternal,
      };
  }
}

export default CaseDecisionDialog;
