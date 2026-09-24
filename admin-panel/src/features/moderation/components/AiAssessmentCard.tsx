/**
 * The AI's view of a case — what the automated check saw and why it held it.
 *
 * The prototype's "AI Flags" card was a two-column list of rule names and
 * matched words, and it stood in for both the AI and the keyword filter. The
 * real engine (plan §6) returns much more, and each part earns its place here:
 *
 *   • **Safety banner first.** A self-harm or imminent-danger signal (D21) is
 *     not a policy violation; the moderator's job is to check in, then usually
 *     publish. Putting the guidance above the verdict is what stops a distressing
 *     report being rejected as "graphic" by someone skimming the table.
 *   • **Injection and blocked notices** say when the verdict below should not be
 *     trusted — the content tried to steer the model, or the model declined.
 *   • **Hold reasons** are the case's own chips (every signal that held it), so
 *     a hold with no AI verdict at all — an outage, a resubmission — still says
 *     why it is here.
 *   • **Per-category rows** show confidence, severity and the verbatim quote the
 *     model gave as evidence (plus its English rendering), so a moderator can
 *     check the claim against the text instead of taking a score on faith.
 *   • **Model and policy version** go in the footer: when a verdict looks wrong,
 *     those are the first two questions anyone asks.
 *
 * The recent-runs table underneath explains an empty verdict ("AI unavailable,
 * attempt 4 of 4") and is what the *Re-run AI* button is judged against.
 */

import { Badge } from "@/components/ui/Badge";
import {
  formatDateTime,
  formatDurationMs,
  formatPercent,
} from "@/features/moderation/moderation.format";
import {
  AI_SEVERITY_LABELS,
  AI_STATUS_LABELS,
  RUN_OUTCOME_LABELS,
  RUN_TRIGGER_LABELS,
  SAFETY_RISK_LABELS,
  hasSafetyRisk,
  type AiAssessmentView,
  type HoldReason,
  type LabelledCode,
  type RunView,
  type SafetyRisk,
} from "@/features/moderation/moderation.types";

export interface AiAssessmentCardProps {
  ai: AiAssessmentView | null;
  /** The case's hold reasons — every signal that held it, not only the AI's. */
  holdReasons: readonly LabelledCode<HoldReason>[];
  /** The case-level safety signal, which outlives the run that raised it. */
  caseSafetyRisk: SafetyRisk | null;
  runs: readonly RunView[];
}

/** What to tell a moderator who has to decide it themselves. */
const SAFETY_GUIDANCE: Record<Exclude<SafetyRisk, "none">, string> = {
  self_harm: "Self-harm is not a policy violation — check in, then publish.",
  imminent_danger:
    "Someone may be in danger right now. A safety risk is not a policy violation — act on the danger first, then publish.",
};

/** A tinted notice box. Tints are mixed from the status tokens so both themes read. */
function Notice({
  tone,
  title,
  children,
  alert = false,
}: {
  tone: "danger" | "warning";
  title: string;
  children: React.ReactNode;
  alert?: boolean;
}) {
  const colour = tone === "danger" ? "var(--danger)" : "var(--warning)";
  return (
    <div
      {...(alert ? { role: "alert" } : {})}
      style={{
        border: `1px solid ${colour}`,
        background: `color-mix(in srgb, ${colour} 9%, transparent)`,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 14,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: colour }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 4, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

/** Why there is no verdict, read from the most recent run. */
function noVerdictMessage(latest: RunView | undefined): string {
  if (!latest) return "No automated check has run on this content yet.";
  if (latest.status === "queued" || latest.status === "running") {
    return "An automated check is in progress. This case updates when it finishes.";
  }
  if (latest.aiStatus && latest.aiStatus !== "assessed" && latest.aiStatus !== "blocked") {
    return `The AI could not assess this content (${AI_STATUS_LABELS[latest.aiStatus].toLowerCase()}). Review it yourself, or re-run the check once the AI is back.`;
  }
  return "The AI has not assessed this version of the content.";
}

export function AiAssessmentCard({ ai, holdReasons, caseSafetyRisk, runs }: AiAssessmentCardProps) {
  const aiSafety = ai?.safetyRisk ?? null;
  const safety = hasSafetyRisk(caseSafetyRisk)
    ? caseSafetyRisk
    : hasSafetyRisk(aiSafety)
      ? aiSafety
      : null;

  const footer = ai
    ? [
        ai.model ? `Model ${ai.model}` : null,
        ai.policyVersion ? `Policy ${ai.policyVersion}` : null,
        formatDurationMs(ai.durationMs),
        ai.imagesAssessed > 0
          ? `${ai.imagesAssessed} image${ai.imagesAssessed === 1 ? "" : "s"} assessed`
          : null,
        ai.language ? `Language ${ai.language}` : null,
        `${RUN_TRIGGER_LABELS[ai.trigger]} · ${formatDateTime(ai.finishedAt)}`,
      ].filter(Boolean)
    : [];

  return (
    <div className="detail-card">
      <div className="detail-card-head">
        <div className="card-section-label">AI Assessment</div>
        {ai && ai.aiStatus === "assessed" && ai.recommendation ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Badge tone={ai.recommendation === "approve" ? "published" : "under_review"}>
              {ai.recommendation === "approve" ? "Recommends approval" : "Recommends a moderator"}
            </Badge>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {formatPercent(ai.confidence)} confident
            </span>
          </span>
        ) : null}
      </div>

      {safety ? (
        <Notice tone="danger" title={`Safety risk — ${SAFETY_RISK_LABELS[safety]}`} alert>
          {SAFETY_GUIDANCE[safety]}
        </Notice>
      ) : null}

      {ai?.injectionSuspected ? (
        <Notice tone="warning" title="Possible instruction injection">
          The content contains text that tries to instruct the AI or change its decision. Treat
          the verdict below with caution and read the content yourself.
        </Notice>
      ) : null}

      {ai?.aiStatus === "blocked" ? (
        <Notice tone="warning" title="The AI declined to assess this content">
          {ai.blockReason ? `Reason given: ${ai.blockReason}. ` : ""}
          Nothing below is a verdict — review the content and its evidence yourself.
        </Notice>
      ) : null}

      {holdReasons.length > 0 ? (
        <div className="content-block">
          <div className="content-sub-label">Hold Reasons</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {holdReasons.map((reason) => (
              <span key={reason.code} className="keyword-chip" title={reason.code}>
                {reason.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {ai ? (
        <>
          {ai.summary ? (
            <div className="content-block">
              <div className="content-sub-label">Summary for the moderator</div>
              <div className="content-body-text">{ai.summary}</div>
            </div>
          ) : null}

          {ai.categories.length > 0 ? (
            <table className="mini" style={{ marginTop: 4 }}>
              <caption className="sr-only">AI assessment by policy category</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "28%" }}>
                    Category
                  </th>
                  <th scope="col" style={{ width: "18%" }}>
                    Result
                  </th>
                  <th scope="col" style={{ width: "14%" }}>
                    Confidence
                  </th>
                  <th scope="col" style={{ width: "40%" }}>
                    Evidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {ai.categories.map((category) => (
                  <tr key={category.code}>
                    <td style={{ fontSize: 13 }}>
                      {category.violation ? <strong>{category.label}</strong> : category.label}
                    </td>
                    <td>
                      {category.violation ? (
                        <Badge tone="rejected">
                          Violation · {AI_SEVERITY_LABELS[category.severity]}
                        </Badge>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Clear</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--muted)" }}>
                      {formatPercent(category.confidence)}
                    </td>
                    <td>
                      {category.evidence ? (
                        <>
                          {/* Verbatim from the content — the model is asked to
                              copy it exactly, and D8 checks it does. */}
                          <code className="matched-text" style={{ whiteSpace: "pre-wrap" }}>
                            “{category.evidence}”
                          </code>
                          {category.evidenceEnglish ? (
                            <div
                              style={{
                                fontSize: 11.5,
                                color: "var(--muted)",
                                marginTop: 4,
                                fontStyle: "italic",
                              }}
                            >
                              In English: {category.evidenceEnglish}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : ai.aiStatus === "assessed" ? (
            <div className="empty" style={{ padding: 16 }}>
              The AI returned no category scores for this check.
            </div>
          ) : null}

          {footer.length > 0 ? (
            <div className="action-help-text" style={{ marginTop: 14 }}>
              {footer.join(" · ")}
            </div>
          ) : null}
        </>
      ) : (
        <div className="content-body-text" style={{ color: "var(--muted)" }}>
          {noVerdictMessage(runs[0])}
        </div>
      )}

      {runs.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div className="content-sub-label">Recent automated checks</div>
          <table className="mini">
            <caption className="sr-only">The most recent automated checks on this content</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: "24%" }}>
                  Trigger
                </th>
                <th scope="col" style={{ width: "20%" }}>
                  Outcome
                </th>
                <th scope="col" style={{ width: "28%" }}>
                  AI
                </th>
                <th scope="col" style={{ width: "28%" }}>
                  Finished
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} style={{ fontSize: 12.5 }}>
                  <td>{RUN_TRIGGER_LABELS[run.trigger]}</td>
                  <td>
                    {run.status === "queued" || run.status === "running"
                      ? run.status === "queued"
                        ? "Queued"
                        : "Running"
                      : run.outcome
                        ? RUN_OUTCOME_LABELS[run.outcome]
                        : "Cancelled"}
                  </td>
                  <td style={{ color: "var(--muted)" }} title={run.error ?? undefined}>
                    {run.aiStatus ? AI_STATUS_LABELS[run.aiStatus] : "—"}
                    {run.aiStatus !== "assessed" && run.attempts > 1
                      ? ` · attempt ${run.attempts} of ${run.maxAttempts}`
                      : ""}
                  </td>
                  <td style={{ color: "var(--muted)" }}>
                    {run.finishedAt ? formatDateTime(run.finishedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default AiAssessmentCard;
