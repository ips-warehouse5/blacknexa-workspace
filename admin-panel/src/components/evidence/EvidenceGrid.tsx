/**
 * Evidence attached to a report — the real file records, shared by the
 * moderation detail and the incident detail.
 *
 * Each tile shows the file's kind, size, capture and seal times and an integrity
 * line. The integrity note is the point of the card rather than decoration:
 * evidence that might end up supporting a legal claim has to be visibly
 * unaltered since upload, so the line is derived from the server's seal
 * (`sealedAt` + `sha256`), never printed unconditionally.
 *
 * Files carry their own moderation state (plan D22): a file the AI could not
 * assess stays hidden from members until a moderator clears it, so the tile says
 * so, and the optional `onHide` action lets a moderator keep one file from
 * members without rejecting the whole report.
 *
 * An approved file also has a *scope* (plan §11a, review R5): a photo the AI
 * cleared from its hash-verified thumbnail is approved at `thumbnail` — members
 * see the thumbnail, and the full file only once a moderator approves it
 * (`full`). "Visible to members" would overstate that, so the tile names the
 * scope; `approvedScope` is optional because older callers do not send it, and
 * without it the tile keeps the plain approved wording.
 */

import { format } from "date-fns";

import { formatBytes, formatDuration } from "@/components/evidence/format";

export type EvidenceKind = "photo" | "video" | "audio" | "document";
export type EvidenceModerationState = "pending" | "approved" | "rejected";
export type EvidenceApprovedScope = "full" | "thumbnail";

/** One sealed (or still uploading) evidence record as the admin API returns it. */
export interface EvidenceFile {
  id: string;
  kind: EvidenceKind;
  mime: string;
  bytes: number;
  durationMs?: number | null;
  capturedAt?: string | null;
  sealedAt?: string | null;
  sha256?: string | null;
  uploadState?: string | null;
  moderationState?: EvidenceModerationState | null;
  /** What an approval covers — see the header. Null unless approved. */
  approvedScope?: EvidenceApprovedScope | null;
}

export interface EvidenceGridProps {
  files: readonly EvidenceFile[];
  /** Opens the file (the page fetches a short-lived URL). Omit to hide View. */
  onView?: (id: string) => void;
  /** The file whose URL is being fetched, to show a busy state on its button. */
  viewingId?: string | null;
  /** Hides one file from members. Omit to hide the action. */
  onHide?: (id: string) => void;
  /** When set, the Hide action is disabled with this tooltip (RBAC). */
  hideDeniedReason?: string | null;
  emptyText?: string;
}

const KIND_TAG: Record<EvidenceKind, { tag: string; label: string }> = {
  photo: { tag: "IMG", label: "Image" },
  video: { tag: "MP4", label: "Video" },
  audio: { tag: "AUD", label: "Audio" },
  document: { tag: "PDF", label: "Document" },
};

const MODERATION_LABEL: Record<EvidenceModerationState, string> = {
  pending: "Awaiting review — hidden from members",
  approved: "Visible to members",
  rejected: "Hidden from members",
};

/** An approval that covers the thumbnail only: the full file still waits for a moderator. */
const THUMBNAIL_ONLY_LABEL = "Thumbnail visible to members — full file awaiting review";

function moderationLabel(file: EvidenceFile): string | null {
  const state = file.moderationState ?? null;
  if (!state) return null;
  if (state === "approved" && file.approvedScope === "thumbnail") return THUMBNAIL_ONLY_LABEL;
  return MODERATION_LABEL[state];
}

function formatWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : format(date, "d MMM yyyy · HH:mm");
}

export function EvidenceGrid({
  files,
  onView,
  viewingId,
  onHide,
  hideDeniedReason,
  emptyText = "No evidence was attached to this report.",
}: EvidenceGridProps) {
  if (files.length === 0) {
    return <div className="empty">{emptyText}</div>;
  }

  return (
    <div className="evidence-grid">
      {files.map((file, index) => {
        const kind = KIND_TAG[file.kind] ?? { tag: "FILE", label: "File" };
        const name = `${kind.label} ${index + 1}`;
        const meta = [kind.label, file.durationMs ? formatDuration(file.durationMs) : null, formatBytes(file.bytes)]
          .filter(Boolean)
          .join(" · ");
        const captured = formatWhen(file.capturedAt);
        const sealed = formatWhen(file.sealedAt);
        const verified = Boolean(file.sealedAt && file.sha256);
        const state = file.moderationState ?? null;
        const stateLabel = moderationLabel(file);

        return (
          <div className="evidence-card" key={file.id}>
            <div className="evidence-preview-type">
              <span>{kind.tag}</span>
              <span className="evidence-kind-label">{kind.label}</span>
            </div>

            <div className="evidence-meta-body">
              <div className="evidence-file-name" title={file.mime}>
                {name}
              </div>
              <div className="evidence-file-size">{meta}</div>
              {captured && <div className="evidence-file-date">Captured {captured}</div>}
              <div className="evidence-file-date">{sealed ? `Sealed ${sealed}` : "Not sealed yet"}</div>
              {stateLabel && <div className="evidence-file-date">{stateLabel}</div>}
            </div>

            <div className="evidence-card-footer">
              <span className="integrity-text" title={file.sha256 ?? undefined}>
                {verified ? "✓ Integrity verified" : "Integrity pending"}
              </span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                {onHide && state !== "rejected" && (
                  <button
                    type="button"
                    className={`view-evidence-btn${hideDeniedReason ? " perm-locked" : ""}`}
                    disabled={Boolean(hideDeniedReason)}
                    title={hideDeniedReason ?? "Hide this file from members"}
                    aria-label={`Hide ${name} from members`}
                    onClick={() => onHide(file.id)}
                  >
                    Hide
                  </button>
                )}
                {onView && (
                  <button
                    type="button"
                    className="view-evidence-btn"
                    disabled={!file.sealedAt || viewingId === file.id}
                    // Names the file, so a screen-reader user moving between
                    // tiles knows which one this button belongs to.
                    aria-label={`View ${name}`}
                    onClick={() => onView(file.id)}
                  >
                    {viewingId === file.id ? "Opening…" : "View"}
                  </button>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default EvidenceGrid;
