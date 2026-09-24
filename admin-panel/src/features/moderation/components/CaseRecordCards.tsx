/**
 * What has already happened to this content: the last rejection, and the full
 * audit history.
 *
 * **Previous rejection** matters most on a resubmission (D19): the author was
 * told why it was not published, edited it, and sent it back — so the
 * moderator deciding it now needs the earlier reason and both notes in front of
 * them to judge whether the edit addressed them.
 *
 * **History** is the append-only audit log (§4.6) for the target, its cases and
 * (for a report) its files — AI, system and human decisions alike, newest
 * first. It is rendered from codes rather than server prose, so every row reads
 * the same way; an action the console does not recognise still appears, under
 * its code, because a gap in an audit trail reads as something hidden. The
 * first twenty rows show by default; a busy report can collect a hundred.
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  formatDateTime,
  historyActionLabel,
  historyActorName,
  historyReasonLabel,
  historyStateChange,
} from "@/features/moderation/moderation.format";
import type {
  HistoryItem,
  ModerationTargetType,
  PreviousRejectionView,
} from "@/features/moderation/moderation.types";

const HISTORY_PREVIEW = 20;

export function PreviousRejectionCard({
  rejection,
  resubmissionCount,
}: {
  rejection: PreviousRejectionView;
  /** How many times the report has been resubmitted (max 3). */
  resubmissionCount: number;
}) {
  return (
    <div className="detail-card">
      <div className="detail-card-head">
        <div className="card-section-label">Previously Rejected</div>
        {resubmissionCount > 0 ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Resubmission {resubmissionCount} of 3
          </span>
        ) : null}
      </div>
      <div className="content-info-grid">
        <div className="info-cell">
          <div className="info-cell-label">Reason</div>
          <div className="info-cell-value">
            {rejection.reasonLabel ?? rejection.reasonCode ?? "Not recorded"}
          </div>
        </div>
        <div className="info-cell">
          <div className="info-cell-label">Rejected By</div>
          <div className="info-cell-value">{rejection.resolvedBy?.name ?? "A moderator"}</div>
        </div>
        <div className="info-cell">
          <div className="info-cell-label">Rejected At</div>
          <div className="info-cell-value">{formatDateTime(rejection.resolvedAt)}</div>
        </div>
      </div>
      {rejection.publicNote ? (
        <div className="content-block" style={{ marginTop: 16 }}>
          <div className="content-sub-label">Note shown to the author</div>
          <div className="content-body-text" style={{ whiteSpace: "pre-wrap" }}>
            {rejection.publicNote}
          </div>
        </div>
      ) : null}
      {rejection.internalNote ? (
        <div className="content-block" style={{ marginBottom: 0 }}>
          <div className="content-sub-label">Internal note</div>
          <div className="content-body-text" style={{ whiteSpace: "pre-wrap" }}>
            {rejection.internalNote}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CaseHistoryCard({
  items,
  targetType,
}: {
  items: readonly HistoryItem[];
  /** The case's target, for labelling publication states on case-level rows. */
  targetType: ModerationTargetType;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, HISTORY_PREVIEW);

  return (
    <div className="detail-card">
      <div className="detail-card-head">
        <div className="card-section-label">History ({items.length})</div>
      </div>

      {items.length === 0 ? (
        <div className="content-body-text" style={{ color: "var(--muted)" }}>
          Nothing has been recorded against this content yet.
        </div>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {visible.map((item) => {
            const change = historyStateChange(item, targetType);
            const reason = historyReasonLabel(item.action, item.reasonCode);
            return (
              <li key={item.id} className="note-item">
                <div className="note-head">
                  <span>{historyActorName(item)}</span>
                  <span>{formatDateTime(item.at)}</span>
                </div>
                <div style={{ color: "var(--text)" }}>
                  {historyActionLabel(item.action)}
                  {change ? (
                    <span style={{ color: "var(--muted)" }}> · {change}</span>
                  ) : null}
                </div>
                {reason ? (
                  <div style={{ color: "var(--muted)", marginTop: 4 }}>Reason: {reason}</div>
                ) : null}
                {item.note ? (
                  <div
                    style={{
                      color: "var(--muted)",
                      marginTop: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    Internal note: {item.note}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {items.length > HISTORY_PREVIEW ? (
        <div style={{ marginTop: 12 }}>
          <Button variant="outline" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show the latest only" : `Show all ${items.length} entries`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
