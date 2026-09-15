/**
 * Content Moderation — the review screen for one flagged item.
 *
 * Everything a moderator needs to make one decision, on one page: the metadata,
 * the content in full, why it was flagged and by whom, its evidence, and the
 * two decisions available.
 *
 * The previous/next controls walk the queue in its current order, so a moderator
 * can work straight through without returning to the list between items. The
 * ordering comes from the same fixture the queue reads, so "next" means the
 * same thing on both screens.
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
import { EvidenceGrid, evidenceFromLabels } from "@/features/moderation/components/EvidenceGrid";
import { moderationPosts } from "@/mocks/moderationPosts";
import type { ModerationPost } from "@/mocks/types";

/** The decision being confirmed, or null when no dialog is open. */
type Decision = "approve" | "reject" | "ban" | null;

const REJECT_REASONS = [
  { value: "inaccurate", label: "Inaccurate or unverifiable" },
  { value: "duplicate", label: "Duplicate of an existing report" },
  { value: "policy", label: "Breaches community guidelines" },
  { value: "privacy", label: "Exposes private details" },
  { value: "spam", label: "Spam or advertising" },
];

const BAN_REASONS = [
  { value: "threats", label: "Threats of violence" },
  { value: "harassment", label: "Targeted harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "repeat", label: "Repeated policy violations" },
];

/** One label/value pair in the metadata grid. */
function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  );
}

/** Initials for the comment author's avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function ModerationDetailView() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [decision, setDecision] = useState<Decision>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const decideDenied = useDeniedReason("moderation.decide");
  const banDenied = useDeniedReason("moderation.ban");

  const index = useMemo(
    () => moderationPosts.findIndex((p) => p.id === postId),
    [postId],
  );
  const post: ModerationPost | undefined = index >= 0 ? moderationPosts[index] : undefined;

  useEffect(() => {
    document.title = post
      ? `${post.id} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [post]);

  if (!post) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>Item not found</h2>
          <p>Nothing in the moderation queue matches “{postId}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/moderation">
              Back to the queue
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const aiFlags = post.ai ?? [];
  const flaggedByUsers = post.reports.length > 0;
  const evidence = evidenceFromLabels(post.evidence);

  const previous = index > 0 ? moderationPosts[index - 1] : undefined;
  const next = index < moderationPosts.length - 1 ? moderationPosts[index + 1] : undefined;

  const confirmDecision = () => {
    const labels: Record<Exclude<Decision, null>, string> = {
      approve: "Content approved",
      reject: "Content rejected",
      ban: "User banned",
    };
    if (decision) {
      // Fixture-backed: the outcome is reported but nothing is persisted yet.
      toast.success(labels[decision], `${post.id} — recorded against this item.`);
    }
    setDecision(null);
    setReason("");
    setNote("");
  };

  return (
    <div className="details-page">
      <div className="details-top-bar" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="back-btn-pill"
            title="Back to queue"
            aria-label="Back to the moderation queue"
            onClick={() => navigate("/moderation")}
          >
            ←
          </button>
          <div className="meta-chip-wrap">
            <span>{post.type.toUpperCase()}</span>
            <span>·</span>
            <strong>{post.id}</strong>
            <Badge tone="pending">Pending Review</Badge>
            <span className="badge flag-source-badge">
              Flag By: {flaggedByUsers ? "User" : "AI"}
            </span>
          </div>
        </div>

        <div className="details-nav-controls">
          <span style={{ fontSize: 12.5, color: "var(--muted)", marginRight: 4 }}>
            {index + 1} of {moderationPosts.length}
          </span>
          <button
            type="button"
            className="back-btn-pill details-nav-btn"
            title="Previous item"
            aria-label="Previous item"
            disabled={!previous}
            onClick={() => previous && navigate(`/moderation/${previous.id}`)}
          >
            ←
          </button>
          <button
            type="button"
            className="back-btn-pill details-nav-btn"
            title="Next item"
            aria-label="Next item"
            disabled={!next}
            onClick={() => next && navigate(`/moderation/${next.id}`)}
          >
            →
          </button>
        </div>
      </div>

      <h1 className="details-main-title">{post.title}</h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Content Details</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label={`${post.type} ID`} value={post.id} />
              <InfoCell label="Content Type" value={post.type} />
              <InfoCell label="User / Author" value={post.user} />
              <InfoCell
                label="Flag Source"
                value={flaggedByUsers ? "User Reports" : "Keyword Filter"}
              />
              <InfoCell label="User Reports" value={post.reports.length} />
              <InfoCell label="Category" value={post.category} />
              <InfoCell label="Who Can See It" value={post.status} />
              <InfoCell label="Area" value={post.location} />
              <InfoCell label="Submitted At" value={post.submitted} />
            </div>
          </div>

          {post.type === "Comment" ? (
            <div className="detail-card">
              <div className="detail-card-head">
                <div className="card-section-label">Flagged Comment</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
                Posted under discussion thread:{" "}
                <strong style={{ color: "var(--accent)", fontWeight: 700 }}>
                  {post.parentIncident}
                </strong>
              </div>
              <div className="flagged-comment-box">
                <div className="flagged-comment-head">
                  <div className="flagged-comment-avatar" aria-hidden="true">
                    {initials(post.user)}
                  </div>
                  <div>
                    <strong style={{ fontSize: 13, color: "var(--text)" }}>{post.user}</strong>
                    <span
                      style={{ color: "var(--muted)", fontSize: 11.5, marginLeft: 6 }}
                    >
                      · {post.submitted}
                    </span>
                  </div>
                </div>
                <div className="content-body-text flagged-comment-body">{post.content}</div>
              </div>
            </div>
          ) : (
            <div className="detail-card">
              <div className="detail-card-head">
                <div className="card-section-label">Full Original Incident</div>
              </div>
              <div className="content-block">
                <div className="content-sub-label">Title</div>
                <div className="content-title-text">{post.title}</div>
              </div>
              <div className="content-block" style={{ marginBottom: 0 }}>
                <div className="content-sub-label">Summary</div>
                {/* Split on blank lines so the reporter's paragraphing survives. */}
                <div className="content-body-text">
                  {post.content.split("\n\n").map((paragraph, i) => (
                    <p key={i} style={{ margin: i === 0 ? "0 0 12px" : "0 0 12px" }}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {aiFlags.length > 0 ? (
            <div className="detail-card">
              <div className="detail-card-head">
                <div className="card-section-label">AI Flags</div>
              </div>
              <table className="mini">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "50%" }}>
                      Violation Category
                    </th>
                    <th scope="col" style={{ width: "50%" }}>
                      Detected Keyword / Match
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aiFlags.map(([rule, matched], i) => (
                    <tr key={`${rule}-${i}`}>
                      <td>
                        <strong>{rule}</strong>
                      </td>
                      <td>
                        <code className="matched-text">{matched}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {post.reports.length > 0 ? (
            <div className="detail-card">
              <div className="detail-card-head">
                <div className="card-section-label">User Reports</div>
              </div>
              <table className="mini">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "38%" }}>
                      Reported By
                    </th>
                    <th scope="col" style={{ width: "38%" }}>
                      Report Reason
                    </th>
                    <th scope="col" style={{ width: "24%" }}>
                      Reported At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {post.reports.map(([reporter, why, at], i) => (
                    <tr key={`${reporter}-${i}`}>
                      <td>
                        <strong>{reporter}</strong>
                      </td>
                      <td>
                        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
                          {why}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: 12 }}>{at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Evidence ({evidence.length})</div>
            </div>
            <EvidenceGrid items={evidence} />
          </div>
        </div>

        <div className="details-right">
          <div className="action-card">
            <div className="action-card-title">Content Decision</div>
            <div className="action-btn-stack">
              <button
                type="button"
                className={`approve-full-btn${decideDenied ? " perm-locked" : ""}`}
                disabled={Boolean(decideDenied)}
                {...(decideDenied ? { title: decideDenied } : {})}
                onClick={() => setDecision("approve")}
              >
                ✓ Approve
              </button>
              <button
                type="button"
                className={`reject-outline-btn${decideDenied ? " perm-locked" : ""}`}
                disabled={Boolean(decideDenied)}
                {...(decideDenied ? { title: decideDenied } : {})}
                onClick={() => setDecision("reject")}
              >
                ✕ Reject
              </button>
            </div>
            <div className="action-help-text">
              Approving publishes the report as verified. Rejecting requires a reason, which is
              recorded on this page and shown to the author.
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-title">User Enforcement</div>
            <div className="action-btn-stack">
              <button
                type="button"
                className={`ban-full-btn${banDenied ? " perm-locked" : ""}`}
                disabled={Boolean(banDenied)}
                {...(banDenied ? { title: banDenied } : {})}
                onClick={() => setDecision("ban")}
              >
                ⊝ Ban User
              </button>
            </div>
            <div className="action-help-text">
              Permanent ban only. Enforcement is independent of the content decision.
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={
          decision === "approve"
            ? "Approve this content"
            : decision === "reject"
              ? "Reject this content"
              : "Ban this user"
        }
        description={
          decision === "approve"
            ? `${post.id} will be published as verified and removed from the queue.`
            : decision === "reject"
              ? "The author is told why. Pick the closest reason."
              : `${post.user} will be permanently banned. This does not change the content decision.`
        }
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === "approve" ? "primary" : "danger"}
              // A reason is required for anything that is held against someone.
              disabled={decision !== "approve" && !reason}
              onClick={confirmDecision}
            >
              {decision === "approve"
                ? "Approve"
                : decision === "reject"
                  ? "Reject"
                  : "Ban User"}
            </Button>
          </>
        }
      >
        {decision !== "approve" && decision !== null ? (
          <Select
            label={decision === "reject" ? "Rejection reason" : "Ban reason"}
            showLabel
            value={reason}
            placeholder="Select a reason…"
            options={decision === "reject" ? REJECT_REASONS : BAN_REASONS}
            onChange={setReason}
          />
        ) : null}

        <label htmlFor="moderation-note">Internal note (optional)</label>
        <textarea
          id="moderation-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context for the audit trail. Not shown to the author."
        />
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
export function ModerationDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  return <ModerationDetailView key={postId} />;
}

export default ModerationDetailPage;
