/**
 * Read one enquiry, and act on it.
 *
 * A dialog rather than a detail route because an enquiry is short: a name, an
 * address, and a paragraph. Sending an operator to another page — and back —
 * to read three lines is the kind of navigation that makes a queue slow to
 * work, and the whole point of this screen is getting through the inbox.
 *
 * The status and the note are edited together and saved in one request, so an
 * operator who sets a status and writes a note does not have to discover that
 * only one of them took.
 */

import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_TONES,
  type ContactInquiry,
  type ContactStatus,
  type UpdateContactInput,
} from "@/features/contact/contact.types";

const STATUS_OPTIONS = CONTACT_STATUSES.map((status) => ({
  value: status,
  label: CONTACT_STATUS_LABELS[status],
}));

export interface InquiryDetailDialogProps {
  open: boolean;
  inquiry: ContactInquiry | null;
  busy: boolean;
  /** Whether this role may change the status or the note. */
  canManage: boolean;
  /** Reason the save controls are locked, when `canManage` is false. */
  deniedReason?: string | undefined;
  onClose: () => void;
  onSave: (input: UpdateContactInput) => void;
}

function InquiryDetail({
  open,
  inquiry,
  busy,
  canManage,
  deniedReason,
  onClose,
  onSave,
}: InquiryDetailDialogProps & { inquiry: ContactInquiry }) {
  /*
   * Seeded once, and deliberately never re-seeded from the prop.
   *
   * The dialog is keyed by enquiry id (see the wrapper), so opening a different
   * row starts from that row's values. Within one enquiry the fields then stay
   * the operator's: a background refetch — or another operator moving the
   * enquiry — must not reach in and change a status they have selected or a
   * note they are halfway through typing. The header badge still renders the
   * live `inquiry.status`, so a value that has moved underneath is visible
   * rather than silently swapped.
   */
  const [status, setStatus] = useState<ContactStatus>(inquiry.status);
  const [note, setNote] = useState(inquiry.internalNote ?? "");

  const noteChanged = note.trim() !== (inquiry.internalNote ?? "").trim();
  const statusChanged = status !== inquiry.status;
  const dirty = noteChanged || statusChanged;

  const save = () => {
    // Only the fields that actually changed are sent. The API distinguishes an
    // absent note from an empty one, so sending an unchanged note back would
    // be a write the operator did not ask for.
    const input: UpdateContactInput = {};
    if (statusChanged) input.status = status;
    if (noteChanged) input.internalNote = note.trim();
    onSave(input);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Enquiry from ${inquiry.name}`}
      description={`${inquiry.subjectLabel} · received ${formatDateTime(inquiry.submittedAt)}`}
      // A half-written note should not be lost to a stray click on the backdrop.
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={save}
            loading={busy}
            // Disabled until something has actually changed, so the button
            // never promises a save that would be a no-op.
            disabled={!dirty}
            {...(canManage ? {} : { deniedReason: deniedReason ?? "You cannot change this." })}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, margin: "0 0 4px" }}>
        <Detail label="From">{inquiry.name}</Detail>

        <Detail label="Email">
          {/* A mailto is the whole point of the screen: replying happens in a
              mail client, not here. */}
          <a href={`mailto:${inquiry.email}`} style={{ color: "var(--accent)" }}>
            {inquiry.email}
          </a>
        </Detail>

        <Detail label="Subject">{inquiry.subjectLabel}</Detail>

        <Detail label="Current Status">
          <Badge tone={CONTACT_STATUS_TONES[inquiry.status]}>
            {CONTACT_STATUS_LABELS[inquiry.status]}
          </Badge>
        </Detail>

        {inquiry.handledBy ? (
          <Detail label="Last Handled">
            {inquiry.handledBy}
            {inquiry.handledAt ? ` · ${formatDateTime(inquiry.handledAt)}` : ""}
          </Detail>
        ) : null}
      </dl>

      <label htmlFor="inquiry-message">Message</label>
      <div
        id="inquiry-message"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "var(--surface)",
          padding: "12px 14px",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--text)",
          // The sender typed line breaks; honouring them is the difference
          // between a message and a wall of text.
          whiteSpace: "pre-wrap",
          maxHeight: 240,
          overflowY: "auto",
        }}
      >
        {inquiry.message}
      </div>

      <div style={{ marginTop: 18, maxWidth: 260 }}>
        <Select
          label="Set Status"
          showLabel
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
          disabled={!canManage || busy}
        />
      </div>

      <label htmlFor="inquiry-note">Internal Note</label>
      <textarea
        id="inquiry-note"
        value={note}
        maxLength={2000}
        disabled={!canManage || busy}
        placeholder="Context for whoever picks this up next. Never sent to the sender."
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="field-hint">
        Visible to operators only. Clear the box and save to remove the note.
      </div>
    </Modal>
  );
}

/** One label/value pair in the header grid. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 13.5, color: "var(--text)" }}>{children}</dd>
    </div>
  );
}

/**
 * Remounts per enquiry.
 *
 * Opening one enquiry and then another must not show the first one's status
 * still selected in the dropdown. Keying on the id gives that for free, which
 * an effect that re-seeds on open only approximates.
 */
export function InquiryDetailDialog(props: InquiryDetailDialogProps) {
  if (!props.open || !props.inquiry) return null;
  return <InquiryDetail key={props.inquiry.id} {...props} inquiry={props.inquiry} />;
}

/** A date the API sent, in the console's display format. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default InquiryDetailDialog;
