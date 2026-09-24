/**
 * Ban a member from the case they were reported on.
 *
 * A ban is enforcement against the *account*, independent of the content
 * decision (the prototype's help text, kept): the report or comment on screen
 * is still approved or rejected on its own merits, and the pipeline holds any
 * of the member's items still waiting for a check (`author_banned`).
 *
 * The reason is required and comes from the §3.3 ban catalogue. Unlike a
 * rejection there is no author-facing note — the member is signed out, not
 * sent an explanation — so the only free text is internal, and it becomes
 * required when the reason is "Other".
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  BAN_REASONS,
  reasonNeedsNote,
  type BanReasonCode,
} from "@/features/moderation/moderation.types";

const NOTE_MAX = 2000;

export interface BanMemberDialogProps {
  open: boolean;
  /** The member's display name, for the copy. */
  name: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (values: { reasonCode: BanReasonCode; note: string }) => void;
}

function BanForm({ open, name, busy, onClose, onConfirm }: BanMemberDialogProps) {
  const [reason, setReason] = useState<BanReasonCode | "">("");
  const [note, setNote] = useState("");

  const noteMissing = reason !== "" && reasonNeedsNote(reason) && !note.trim();
  const ready = reason !== "" && !noteMissing;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Ban User?"
      description={`This will permanently ban ${name}. They are signed out everywhere and cannot sign in again until the ban is lifted. Enforcement is independent of the content decision.`}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ready}
            onClick={() => {
              if (reason !== "" && ready) onConfirm({ reasonCode: reason, note });
            }}
          >
            Ban User
          </Button>
        </>
      }
    >
      <Select<BanReasonCode | "">
        label="Ban reason"
        showLabel
        value={reason}
        placeholder="Select a reason…"
        options={BAN_REASONS}
        onChange={setReason}
        disabled={busy}
      />

      <label htmlFor="ban-note">
        Internal note{reason !== "" && reasonNeedsNote(reason) ? "" : " (optional)"}
      </label>
      <textarea
        id="ban-note"
        value={note}
        maxLength={NOTE_MAX}
        disabled={busy}
        placeholder="What led to the ban. Recorded in the audit log; never sent to the member."
        {...(noteMissing ? { "aria-invalid": true, "aria-describedby": "ban-note-error" } : {})}
        onChange={(event) => setNote(event.target.value)}
      />
      {noteMissing ? (
        <div className="field-error-msg" id="ban-note-error">
          Add a note that explains the reason when you choose “Other”.
        </div>
      ) : (
        <div className="field-hint">Staff only.</div>
      )}
    </Modal>
  );
}

/** Remounts per opening, so a cancelled reason is not still selected next time. */
export function BanMemberDialog(props: BanMemberDialogProps) {
  if (!props.open) return null;
  return <BanForm {...props} />;
}

export default BanMemberDialog;
