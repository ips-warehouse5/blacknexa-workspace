/**
 * Who wrote the content, and their record.
 *
 * Moderators see the author even when the item was posted anonymously (D15) —
 * a pattern of rejected reports or removed comments is invisible otherwise —
 * and the card says so plainly, so nobody repeats the name back to members.
 * The counts are the account's history across the platform, not this case: how
 * many reports they have filed, how many a moderator rejected, how many of
 * their comments were removed, and how many flags others have raised on their
 * content.
 */

import { Badge } from "@/components/ui/Badge";
import { formatMonthYear } from "@/features/moderation/moderation.format";
import {
  USER_STATUS_LABELS,
  USER_STATUS_TONES,
  type CaseAuthorView,
} from "@/features/moderation/moderation.types";

export function AuthorCard({ author }: { author: CaseAuthorView | null }) {
  return (
    <div className="action-card">
      <div className="action-card-title">Author</div>

      {author ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
                {author.displayName}
              </div>
              <div className="sub" title={author.email} style={{ fontSize: 11.5 }}>
                {author.email}
              </div>
            </div>
            <Badge tone={USER_STATUS_TONES[author.status]}>
              {USER_STATUS_LABELS[author.status]}
            </Badge>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            Member since {formatMonthYear(author.memberSince)}
          </div>

          {author.anonymousOnThisItem ? (
            <div className="action-help-text" style={{ marginTop: 8 }}>
              Posted anonymously — members see “Anonymous”. Keep the name to staff.
            </div>
          ) : null}

          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px 14px",
              margin: "16px 0 0",
            }}
          >
            <AuthorStat label="Reports filed" value={author.stats.reports} />
            <AuthorStat label="Rejected" value={author.stats.rejected} />
            <AuthorStat label="Comments removed" value={author.stats.commentsRemoved} />
            <AuthorStat label="Flags against" value={author.stats.flagsAgainst} />
          </dl>
        </>
      ) : (
        <div className="action-help-text" style={{ marginTop: 0 }}>
          The author's account has been deleted. The content stays on the record without a name.
        </div>
      )}
    </div>
  );
}

function AuthorStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="info-cell-label">{label}</dt>
      <dd style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{value}</dd>
    </div>
  );
}

export default AuthorCard;
