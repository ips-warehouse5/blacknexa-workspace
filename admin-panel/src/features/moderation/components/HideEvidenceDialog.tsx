/**
 * Hide one evidence file from members (`POST /cases/:id/evidence/:evidenceId/reject`).
 *
 * This is the per-file lever D22 needs: a report whose text is fine can carry a
 * photo that is not, and rejecting the whole report to deal with one file would
 * punish the account for the attachment. The file is hidden permanently; the
 * report, its other files and the case are untouched, and the case stays open
 * for the decision on the rest.
 *
 * The reason is optional — the author is not notified of a hidden file — but
 * "Other" still needs a note, as everywhere in §3.3, so the audit log never
 * records an unexplained "Other".
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select, type SelectOption } from "@/components/ui/Select";
import {
  REJECT_REASONS,
  reasonNeedsNote,
  type RejectReasonCode,
} from "@/features/moderation/moderation.types";

const NOTE_MAX = 2000;

const REASON_OPTIONS: SelectOption<RejectReasonCode | "">[] = [
  { value: "", label: "No specific reason" },
  ...REJECT_REASONS,
];

export interface HideEvidenceDialogProps {
  open: boolean;
  /** "Image 2" — the same name the evidence tile shows. */
  fileLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (values: { reasonCode: RejectReasonCode | null; internalNote: string }) => void;
}

function HideForm({ open, fileLabel, busy, onClose, onConfirm }: HideEvidenceDialogProps) {
  const [reason, setReason] = useState<RejectReasonCode | "">("");
  const [note, setNote] = useState("");

  const noteMissing = reason !== "" && reasonNeedsNote(reason) && !note.trim();

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Hide this file from members?"
      description={`Members will no longer see ${fileLabel}. The report, its other files and this case are unchanged, and the case stays open for your decision on the rest. This cannot be undone from the console.`}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={noteMissing}
            onClick={() => {
              if (noteMissing) return;
              onConfirm({ reasonCode: reason === "" ? null : reason, internalNote: note });
            }}
          >
            Hide File
          </Button>
        </>
      }
    >
      <Select<RejectReasonCode | "">
        label="Reason"
        showLabel
        value={reason}
        options={REASON_OPTIONS}
        onChange={setReason}
        disabled={busy}
      />

      <label htmlFor="hide-evidence-note">
        Internal note{reason !== "" && reasonNeedsNote(reason) ? "" : " (optional)"}
      </label>
      <textarea
        id="hide-evidence-note"
        value={note}
        maxLength={NOTE_MAX}
        disabled={busy}
        placeholder="Why this file should not be shown. Recorded in the audit log only."
        {...(noteMissing
          ? { "aria-invalid": true, "aria-describedby": "hide-evidence-note-error" }
          : {})}
        onChange={(event) => setNote(event.target.value)}
      />
      {noteMissing ? (
        <div className="field-error-msg" id="hide-evidence-note-error">
          Add a note that explains the reason when you choose “Other”.
        </div>
      ) : (
        <div className="field-hint">Staff only. The author is not notified.</div>
      )}
    </Modal>
  );
}

/** Remounts per opening, so one file's reason is not pre-filled for the next. */
export function HideEvidenceDialog(props: HideEvidenceDialogProps) {
  if (!props.open) return null;
  return <HideForm {...props} />;
}

export default HideEvidenceDialog;
