/**
 * Evidence attached to a report.
 *
 * Each tile shows the file's kind, name, size and an integrity line. The
 * integrity note is the point of the card rather than decoration: evidence that
 * might end up supporting a legal claim has to be visibly unaltered since
 * upload, and a moderator needs to see that at a glance.
 */

import type { IncidentEvidence } from "@/mocks/types";

/** A tile, with the upload timestamp the grid shows. */
export interface EvidenceItem extends IncidentEvidence {
  date: string;
}

/** File kinds the tiles know how to label. */
const KIND_LABELS: Record<string, string> = {
  IMG: "Image",
  PDF: "Document",
  AUD: "Audio",
  MP4: "Video",
  VID: "Video",
};

/**
 * Build tiles from the moderation fixture's evidence labels.
 *
 * The moderation queue stores evidence as prose ("Image evidence") rather than
 * as file records, so this reconstructs plausible file details for display —
 * exactly as the prototype did. When real evidence records arrive this function
 * goes away and the grid takes them directly.
 */
export function evidenceFromLabels(labels: readonly string[]): EvidenceItem[] {
  return labels.map((label, index) => {
    const lower = label.toLowerCase();

    if (lower.includes("video")) {
      return {
        type: "MP4",
        name: `incident-video-${index + 1}.mp4`,
        meta: "Video · 12.4 MB",
        date: `27 Aug 2026 · 09:4${index}`,
      };
    }
    if (lower.includes("document")) {
      return {
        type: "PDF",
        name: "witness-statement.pdf",
        meta: "Document · 1.8 MB",
        date: `27 Aug 2026 · 09:4${index}`,
      };
    }
    if (lower.includes("audio")) {
      return {
        type: "AUD",
        name: "voice-note-21.m4a",
        meta: "Audio · 3:12 · 11 MB",
        date: `27 Aug 2026 · 09:4${index}`,
      };
    }
    return {
      type: "IMG",
      name: `entry-door-0${index + 1}.jpg`,
      meta: "Image · 2.4 MB",
      date: `27 Aug 2026 · 09:4${index}`,
    };
  });
}

export function EvidenceGrid({ items }: { items: readonly EvidenceItem[] }) {
  if (items.length === 0) {
    return <div className="empty">No evidence was attached to this report.</div>;
  }

  return (
    <div className="evidence-grid">
      {items.map((item, index) => (
        <div className="evidence-card" key={`${item.name}-${index}`}>
          <div className="evidence-preview-type">
            <span>{item.type}</span>
            <span className="evidence-kind-label">{KIND_LABELS[item.type] ?? "File"}</span>
          </div>

          <div className="evidence-meta-body">
            <div className="evidence-file-name" title={item.name}>
              {item.name}
            </div>
            <div className="evidence-file-size">{item.meta}</div>
            <div className="evidence-file-date">Uploaded {item.date}</div>
          </div>

          <div className="evidence-card-footer">
            <span className="integrity-text">✓ Integrity verified</span>
            <button
              type="button"
              className="view-evidence-btn"
              // Names the file, so a screen-reader user moving between tiles
              // knows which one this button belongs to.
              aria-label={`View ${item.name}`}
            >
              View
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default EvidenceGrid;
