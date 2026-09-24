/**
 * The two non-AI signals on a case: keyword matches and member flags.
 *
 * **Keyword Matches** is its own card now. The prototype folded keyword hits
 * into "AI Flags", but they are different evidence: a keyword hit is a
 * deterministic string match (with a rule behind it an admin can edit), the AI
 * verdict is a judgement. The Action column matters — a `signal` hit on its own
 * never holds anything (D9), so a moderator seeing only signal hits and a clean
 * AI verdict knows the rule was a hint, not a finding.
 *
 * **User Reports** lists *every* flag ever raised on the target, across cases,
 * newest first — including dismissed ones and flags from earlier cases. Who
 * flagged is shown with their account age and how many flags they have filed
 * (D15): that is how brigading is spotted, and it is never shown to the author.
 */

import { Badge } from "@/components/ui/Badge";
import {
  formatDateTime,
  formatMonthYear,
} from "@/features/moderation/moderation.format";
import {
  FLAG_STATUS_LABELS,
  FLAG_STATUS_TONES,
  KEYWORD_ACTION_LABELS,
  KEYWORD_FIELD_LABELS,
  type KeywordHitView,
  type UserFlagView,
} from "@/features/moderation/moderation.types";

export function KeywordMatchesCard({ hits }: { hits: readonly KeywordHitView[] }) {
  return (
    <div className="detail-card">
      <div className="detail-card-head">
        <div className="card-section-label">Keyword Matches</div>
      </div>
      {hits.length === 0 ? (
        <div className="content-body-text" style={{ color: "var(--muted)" }}>
          No keyword rule matched the latest automated check.
        </div>
      ) : (
        <table className="mini">
          <caption className="sr-only">Keyword rules that matched this content</caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: "30%" }}>
                Rule
              </th>
              <th scope="col" style={{ width: "26%" }}>
                Detected Keyword / Match
              </th>
              <th scope="col" style={{ width: "14%" }}>
                Field
              </th>
              <th scope="col" style={{ width: "30%" }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {hits.map((hit, index) => (
              // A rule can match several terms in several fields, and a
              // built-in detector has no rule id — the position disambiguates.
              <tr key={`${hit.ruleId ?? hit.ruleName}-${hit.term}-${hit.field}-${index}`}>
                <td>
                  <strong style={{ fontSize: 13 }}>{hit.ruleName}</strong>
                  <span className="sub">
                    {hit.categoryLabel}
                    {hit.ruleId === null ? " · built-in detector" : ""}
                  </span>
                </td>
                <td>
                  <code className="matched-text">{hit.term}</code>
                </td>
                <td style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {KEYWORD_FIELD_LABELS[hit.field] ?? hit.field}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  <strong>{KEYWORD_ACTION_LABELS[hit.action]}</strong>
                  <span className="sub" style={{ whiteSpace: "normal" }}>
                    {hit.action === "hold"
                      ? "Holds on its own"
                      : hit.action === "signal"
                        ? "A hint to the AI — holds only if confirmed"
                        : "Recorded only"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function UserReportsCard({
  flags,
  caseId,
}: {
  flags: readonly UserFlagView[];
  /** The case on screen, so flags raised under it can be told from older ones. */
  caseId: string;
}) {
  const open = flags.filter((flag) => flag.status === "open").length;

  return (
    <div className="detail-card">
      <div className="detail-card-head">
        <div className="card-section-label">User Reports ({flags.length})</div>
        {flags.length > 0 ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{open} open</span>
        ) : null}
      </div>
      {flags.length === 0 ? (
        <div className="content-body-text" style={{ color: "var(--muted)" }}>
          No member has flagged this.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="mini" style={{ minWidth: 640 }}>
            <caption className="sr-only">Every member flag raised on this content</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: "24%" }}>
                  Reported By
                </th>
                <th scope="col" style={{ width: "20%" }}>
                  Report Reason
                </th>
                <th scope="col" style={{ width: "24%" }}>
                  Note
                </th>
                <th scope="col" style={{ width: "16%" }}>
                  Reported At
                </th>
                <th scope="col" style={{ width: "16%" }}>
                  Case
                </th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.id}>
                  <td>
                    {flag.reporter ? (
                      <>
                        <strong style={{ fontSize: 13 }}>{flag.reporter.displayName}</strong>
                        <span className="sub">
                          Since {formatMonthYear(flag.reporter.memberSince)} ·{" "}
                          {flag.reporter.flagsFiled}{" "}
                          {flag.reporter.flagsFiled === 1 ? "flag" : "flags"} filed
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: 12.5 }}>Deleted account</span>
                    )}
                  </td>
                  <td>
                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
                      {flag.categoryLabel}
                    </span>
                    {/* Old rows keep the legacy code they were filed under. */}
                    {flag.reason !== flag.category ? (
                      <span className="sub">Filed as “{flag.reason}”</span>
                    ) : null}
                  </td>
                  <td
                    style={{
                      fontSize: 12.5,
                      color: flag.note ? "var(--text)" : "var(--muted)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {flag.note ?? "—"}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>
                    {formatDateTime(flag.createdAt)}
                    <span className="sub">{flag.flagRef}</span>
                  </td>
                  <td>
                    <Badge tone={FLAG_STATUS_TONES[flag.status]}>
                      {FLAG_STATUS_LABELS[flag.status]}
                    </Badge>
                    <span className="sub">
                      {flag.caseId === caseId
                        ? "This case"
                        : flag.caseId
                          ? "Earlier case"
                          : "No case"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
