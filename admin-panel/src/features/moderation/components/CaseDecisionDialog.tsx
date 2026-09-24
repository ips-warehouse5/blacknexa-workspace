/**
 * Confirm a content decision: approve (publish / keep) or reject (remove).
 *
 * The wording changes with what the decision actually does to the target —
 * the prototype's split, made exact:
 *
 *   report, not yet live    Approve & Publish      ·  Reject
 *   report, already live    Keep Published         ·  Reject & Take Down
 *   comment                 Keep Comment           ·  Remove Comment
 *
 * **Approving publishes; it never verifies** (D1). The approve copy says so in
 * the plan's words, because the prototype's "published as verified" is the one
 * sentence most likely to make a moderator believe they have vouched for a
 * report's truth. Verification happens in Incident Management.
 *
 * A rejection carries three things with three audiences (§3.3): a predefined
 * **reason** from the catalogue (the author sees its label), a **note to the
 * author** (required when the reason is "Other", since "Other" alone tells them
 * nothing), and an **internal note** for colleagues and the audit log. They are
 * separate fields so nothing written for staff can reach the author by mistake.
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  REJECT_REASONS,
  reasonNeedsNote,
  type ModerationTargetType,
  type RejectReasonCode,
} from "@/features/moderation/moderation.types";

const PUBLIC_NOTE_MAX = 512;
const INTERNAL_NOTE_MAX = 2000;

export type DecisionMode = "approve" | "reject";

export interface DecisionValues {
  /** Present for a rejection. */
  reasonCode: RejectReasonCode | null;
  publicNote: string;
  internalNote: string;
}

export interface CaseDecisionDialogProps {
  open: boolean;
  mode: DecisionMode;
  targetType: ModerationTargetType;
  /** Whether the target is live right now (report published / comment visible). */
  live: boolean;
  /** Names the item in the copy, e.g. "BNX-4471". */
  subject: string;
  /**
   * An extra line under the description — used to say that approving a report
   * also releases its files still waiting for review (D22), which is easy to
   * forget when the text is what was flagged.
   */
  notice?: string | undefined;
  /**
   * Something changed behind the open dialog — the report was edited, files
   * arrived, the case was closed by the pipeline (reviews Q6, Q10, Q13). Shown
   * above everything else, in the warning colour. The dialog stays open with
   * the notes intact; the moderator decides whether to go on or cancel.
   */
  warning?: string | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: (values: DecisionValues) => void;
}

interface Copy {
  title: string;
  description: string;
  confirm: string;
}

const APPROVE_DISCLAIMER =
  "Publishing makes it visible in the community feed. It does not verify it — verification happens in Incident Management.";

function copyFor(
  mode: DecisionMode,
  targetType: ModerationTargetType,
  live: boolean,
  subject: string,
): Copy {
  if (targetType === "comment") {
    return mode === "approve"
      ? live
        ? {
            title: "Dismiss Reports & Keep Comment?",
            description:
              "The user reports will be dismissed and the comment will remain visible on the incident discussion thread.",
            confirm: "Keep Comment",
          }
        : {
            title: "Keep Comment",
            description:
              "The comment is published on the incident discussion thread and any user reports on it are dismissed.",
            confirm: "Keep Comment",
          }
      : {
          title: "Remove Flagged Comment",
          description:
            "Select the policy violation reason for removing this comment. The commenter is told the reason and your note.",
          confirm: "Remove Comment",
        };
  }

  if (mode === "approve") {
    return live
      ? {
          title: "Keep Published",
          description: `${subject} stays in the community feed and its open flags are dismissed. It does not verify it — verification happens in Incident Management.`,
          confirm: "Keep Published",
        }
      : {
          title: "Approve & Publish",
          description: APPROVE_DISCLAIMER,
          confirm: "Approve & Publish",
        };
  }

  return live
    ? {
        title: "Reject & Take Down",
        description: `${subject} is taken out of the community feed. The author sees the reason and your note, and may edit and resubmit — a resubmission always comes back to a moderator.`,
        confirm: "Reject & Take Down",
      }
    : {
        title: "Reject Content",
        description:
          "Select a predefined reason. The author sees the reason and your note, and may edit and resubmit — a resubmission always comes back to a moderator.",
        confirm: "Reject & Submit",
      };
}

function DecisionForm({
  open,
  mode,
  targetType,
  live,
  subject,
  notice,
  warning,
  busy,
  onClose,
  onConfirm,
}: CaseDecisionDialogProps) {
  const [reason, setReason] = useState<RejectReasonCode | "">("");
  const [publicNote, setPublicNote] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const copy = copyFor(mode, targetType, live, subject);
  const rejecting = mode === "reject";
  const noteMissing = rejecting && reason !== "" && reasonNeedsNote(reason) && !publicNote.trim();
  const ready = !rejecting || (reason !== "" && !noteMissing);

  const confirm = () => {
    if (!ready) return;
    onConfirm({
      reasonCode: rejecting && reason !== "" ? reason : null,
      publicNote: rejecting ? publicNote : "",
      internalNote,
    });
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={copy.title}
      description={copy.description}
      // Typed notes should not be lost to a stray click on the backdrop.
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={rejecting ? "danger" : "primary"}
            onClick={confirm}
            loading={busy}
            // A reason is required for anything held against someone.
            disabled={!ready}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {warning ? (
        <div
          role="alert"
          style={{
            border: "1px solid var(--warning)",
            background: "color-mix(in srgb, var(--warning) 9%, transparent)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12.5,
            color: "var(--text)",
            lineHeight: 1.5,
          }}
        >
          {warning}
        </div>
      ) : null}

      {notice ? (
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--accent-soft)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12.5,
            color: "var(--text)",
            lineHeight: 1.5,
          }}
        >
          {notice}
        </div>
      ) : null}

      {rejecting ? (
        <>
          <Select<RejectReasonCode | "">
            label="Predefined Reason"
            showLabel
            value={reason}
            placeholder="Select a reason…"
            options={REJECT_REASONS}
            onChange={setReason}
            disabled={busy}
          />

          <label htmlFor="decision-public-note">
            Note to the author{reason !== "" && reasonNeedsNote(reason) ? "" : " (optional)"}
          </label>
          <textarea
            id="decision-public-note"
            value={publicNote}
            maxLength={PUBLIC_NOTE_MAX}
            disabled={busy}
            placeholder="Shown to the author with the reason. Explain what to change if they resubmit."
            {...(noteMissing
              ? { "aria-invalid": true, "aria-describedby": "decision-public-note-error" }
              : {})}
            onChange={(event) => setPublicNote(event.target.value)}
          />
          {noteMissing ? (
            <div className="field-error-msg" id="decision-public-note-error">
              Add a note that explains the reason when you choose “Other”.
            </div>
          ) : (
            <div className="field-hint">
              {publicNote.length} / {PUBLIC_NOTE_MAX} · The author reads this.
            </div>
          )}
        </>
      ) : null}

      <label htmlFor="decision-internal-note">Internal note (optional)</label>
      <textarea
        id="decision-internal-note"
        value={internalNote}
        maxLength={INTERNAL_NOTE_MAX}
        disabled={busy}
        placeholder="Context for colleagues and the audit trail. Never shown to the author."
        onChange={(event) => setInternalNote(event.target.value)}
      />
      <div className="field-hint">Staff only — kept on the case and in the audit log.</div>
    </Modal>
  );
}

/**
 * Remounts per opening.
 *
 * Opening Reject after cancelling an earlier one must not show the old reason
 * still selected, and switching from Approve to Reject must not carry a note
 * across. Keying on the mode and unmounting when closed gives both for free.
 */
export function CaseDecisionDialog(props: CaseDecisionDialogProps) {
  if (!props.open) return null;
  return <DecisionForm key={props.mode} {...props} />;
}

export default CaseDecisionDialog;
