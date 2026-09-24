/**
 * Internal Admin Notes — the operators' working record on a case (plan §9.2).
 *
 * A card of its own, as in the prototype, and deliberately separate from the
 * Incident Lifecycle. The earlier port merged the two into one feed, which put
 * private working notes beside events the author also sees on their timeline;
 * the backend now keeps them apart too (`report_notes`, staff-only by
 * construction, versus status events). Notes given with a decision — verify,
 * dismiss, reopen, deactivate, reactivate — land here as well, so this feed is
 * the whole internal record.
 *
 * Every author is the real signed-in operator the server recorded, replacing
 * the prototype's hard-coded "Moderator M. Kaur". Newest first, as the API
 * returns them. Writing is `incidents.notes`, which all four roles hold; the
 * composer is still gated so a future role without it gets a reason rather
 * than a 403.
 */

import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/features/incidents/incidents.format";
import { useAddIncidentNote } from "@/features/incidents/incidents.hooks";
import {
  INTERNAL_NOTE_MAX,
  type IncidentNoteView,
} from "@/features/incidents/incidents.types";
import { isRoleKey } from "@/lib/rbac";
import { ROLE_LABELS } from "@/types/rbac";

export interface InternalNotesCardProps {
  incidentId: string;
  notes: readonly IncidentNoteView[];
  /** Why the composer is locked, when the role lacks `incidents.notes`. */
  notesDenied: string | undefined;
}

/** "M. Kaur · Moderator", or a placeholder once the account is gone. */
function noteAuthor(note: IncidentNoteView): string {
  if (!note.author) return "Former team member";
  const role = isRoleKey(note.author.role) ? ROLE_LABELS[note.author.role] : null;
  return role ? `${note.author.name} · ${role}` : note.author.name;
}

export function InternalNotesCard({ incidentId, notes, notesDenied }: InternalNotesCardProps) {
  const [draft, setDraft] = useState("");
  const addNote = useAddIncidentNote();
  const inputId = useId();

  const text = draft.trim();

  const submit = async () => {
    if (!text || text.length > INTERNAL_NOTE_MAX) return;
    try {
      await addNote.mutateAsync({ id: incidentId, input: { body: text } });
      setDraft("");
    } catch {
      // Reported by the hook; the draft stays so nothing typed is lost.
    }
  };

  return (
    <div className="action-card">
      <div className="action-card-title">Internal Admin Notes</div>

      <div className="notes-feed" aria-live="polite">
        {notes.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>
            No internal notes logged yet.
          </div>
        ) : (
          notes.map((note) => (
            <div className="note-item" key={note.id}>
              <div className="note-head">
                <span>{noteAuthor(note)}</span>
                <span>{formatDateTime(note.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="note-input-wrap">
        <label className="sr-only" htmlFor={inputId}>
          Add an internal note
        </label>
        <textarea
          id={inputId}
          className="note-textarea"
          value={draft}
          maxLength={INTERNAL_NOTE_MAX}
          placeholder={notesDenied ?? "Write private internal note..."}
          disabled={Boolean(notesDenied) || addNote.isPending}
          onChange={(e) => setDraft(e.target.value)}
        />
        {draft.length > INTERNAL_NOTE_MAX - 400 ? (
          <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
            {draft.length} / {INTERNAL_NOTE_MAX}
          </div>
        ) : null}
        <Button
          variant="primary"
          style={{ fontSize: 12, padding: 8 }}
          loading={addNote.isPending}
          disabled={!text}
          {...(notesDenied ? { deniedReason: notesDenied } : {})}
          onClick={() => void submit()}
        >
          Add Note
        </Button>
      </div>
    </div>
  );
}

export default InternalNotesCard;
