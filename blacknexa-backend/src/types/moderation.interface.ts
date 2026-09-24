/**
 * Moderation vocabulary — the one taxonomy every layer shares.
 *
 * Spec: `docs/INCIDENT_MODULE_PLAN.md` (revision 2) §3, §4.3–§4.6, §5.1–§5.2,
 * §6.1 and §7.4. Every code, label, state and formula the automated pipeline,
 * the domain services, the admin console and the mobile client agree on lives
 * here, so a disagreement is a compile error rather than a production bug.
 *
 * ── Why this module has zero imports ───────────────────────────────────────
 * It is imported by the unit tests (`npm test`) without a `.env`, by the pure
 * policy module (`services/moderation_policy.ts`, which must not touch env or
 * the database) and by the models. Importing anything — even `import type` from
 * `report.interface.ts` — would drag `config/env.config.ts` in transitively on
 * some path sooner or later, and `env.config` exits the process when a required
 * variable is missing. Where this file needs a shape that lives elsewhere (the
 * nine report categories, the report status), it restates it structurally and
 * `report.interface.ts` asserts the two stay identical.
 *
 * ── Why one taxonomy (D6) ─────────────────────────────────────────────────
 * Before this module four layers disagreed: the mobile flag sheet had six codes,
 * the admin prototype had six *different* tabs, the keyword filter had its own
 * categories and the reject modal a fourth list. A user flag under "Direct
 * threat" could not land in the *Direct Threat & Violence* tab because no code
 * connected them. The eight `PolicyCategory` codes below are now used for AI
 * output, keyword rules, user flags, reject reasons and admin tabs alike, and
 * the three legacy mobile codes are accepted on input and normalised (§3.1).
 *
 * ── Why publication is its own axis (D1) ──────────────────────────────────
 * `ReportModerationState` (pending → approved / held / rejected / deactivated)
 * says whether other members may see a report. `ReportStatus` (submitted →
 * under_review → verified / dismissed) says what a moderator concluded about
 * the incident. They are deliberately independent: "published" never means
 * "verified", and the owner-facing `displayStatusOf()` below is the only place
 * the two are folded into one label.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Policy categories — §3.1, D6
// ─────────────────────────────────────────────────────────────────────────────

/** The eight policy codes. Order is fixed and meaningful (AI output, tabs). */
export type PolicyCategory =
  | "threat"
  | "harassment"
  | "hate"
  | "private_info"
  | "misleading"
  | "spam"
  | "graphic"
  | "other";

/**
 * The fixed order. The AI engine normalises its `categories` array to exactly
 * these eight in exactly this order (§6.1), and the admin queue renders its
 * category tabs in it, so the order is part of the contract, not a convenience.
 */
export const POLICY_CATEGORIES: readonly PolicyCategory[] = [
  "threat",
  "harassment",
  "hate",
  "private_info",
  "misleading",
  "spam",
  "graphic",
  "other",
];

/** Admin tab / label for each code — the prototype's titles (§3.1). */
export const ADMIN_TAB_LABELS: Readonly<Record<PolicyCategory, string>> = {
  threat: "Direct Threat & Violence",
  harassment: "Harassment & Bullying",
  hate: "Hate Speech & Discrimination",
  private_info: "Private Details / Doxxing",
  misleading: "Misleading or Untrue Content",
  spam: "Spam or Advertising",
  graphic: "Graphic or Sexual Content",
  other: "Other",
};

/**
 * What a member reads in the flag sheet (D7). Written from the member's side —
 * "It threatens…" — because the person flagging is describing what they saw,
 * not applying a policy.
 */
export const MEMBER_FLAG_LABELS: Readonly<Record<PolicyCategory, string>> = {
  threat: "It threatens or encourages violence",
  harassment: "It harasses or bullies someone",
  hate: "It attacks people for who they are",
  private_info: "It exposes someone's private details",
  misleading: "It's fake or trolling",
  spam: "Spam or advertising",
  graphic: "Graphic or sexual content",
  other: "Something else",
};

/**
 * Categories a *comment* can be flagged under (§3.1). `misleading` and `graphic`
 * describe a report as a whole — a comment is not "a fabricated report", and
 * comments carry no media — so the comment sheet offers six.
 */
export const COMMENT_FLAG_CATEGORIES: readonly PolicyCategory[] = [
  "threat",
  "harassment",
  "hate",
  "private_info",
  "spam",
  "other",
];

/**
 * Categories whose user flags must be looked at within the hour, and which add
 * 40 to a case's priority (§4.4). The mobile flag sheet promises "Safety flags
 * are looked at within the hour", and `GET /admin/moderation/stats` reports
 * `safetyFlagBreached` against exactly this set.
 */
export const SAFETY_CATEGORIES: readonly PolicyCategory[] = ["threat", "private_info", "graphic"];

/** The minutes a safety flag may wait before `safetyFlagBreached` counts it. */
export const SAFETY_FLAG_SLA_MINUTES = 60;

/** The three flag codes shipped mobile clients still send (the old D8 sheet). */
export type LegacyFlagCode = "threatening" | "private_details" | "untrue";

/**
 * Legacy input codes → canonical codes (§3.1). Applied on write so new rows are
 * always canonical, and on read so rows written before revision 2 still land in
 * the right tab. `graphic`, `spam` and `other` were already canonical.
 */
export const LEGACY_FLAG_CODES: Readonly<Record<LegacyFlagCode, PolicyCategory>> = {
  threatening: "threat",
  private_details: "private_info",
  untrue: "misleading",
};

export const ALL_LEGACY_FLAG_CODES: readonly LegacyFlagCode[] = [
  "threatening",
  "private_details",
  "untrue",
];

/** Type guard for a canonical code. */
export function isPolicyCategory(raw: unknown): raw is PolicyCategory {
  return typeof raw === "string" && (POLICY_CATEGORIES as readonly string[]).includes(raw);
}

/**
 * Canonical or legacy code → canonical code, or `null` for anything else.
 *
 * Case and surrounding whitespace are forgiven because this also runs over
 * stored rows; an unknown code is `null`, never a guess, so a caller can refuse
 * the input (write path) or bucket it under `other` (read path) deliberately.
 */
export function normaliseFlagCategory(raw: string | null | undefined): PolicyCategory | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  if (isPolicyCategory(code)) return code;
  if (Object.prototype.hasOwnProperty.call(LEGACY_FLAG_CODES, code)) {
    return LEGACY_FLAG_CODES[code as LegacyFlagCode];
  }
  return null;
}

/** As `normaliseFlagCategory`, but only for codes a comment may carry. */
export function normaliseCommentFlagCategory(raw: string | null | undefined): PolicyCategory | null {
  const code = normaliseFlagCategory(raw);
  return code && COMMENT_FLAG_CATEGORIES.includes(code) ? code : null;
}

/** The `expectedWithin` line of the flag response (§7.6). */
export function flagExpectedWithin(category: PolicyCategory): "within the hour" | "within a day" {
  return SAFETY_CATEGORIES.includes(category) ? "within the hour" : "within a day";
}

/** One open flag as the case backfill reads it (`report_flags` ⟕ `report_comments`). */
export interface OpenFlagRow {
  report_id: string | null;
  comment_id: string | null;
  /** The comment's own `report_id` — legacy comment flags stored `report_id` NULL. */
  comment_report_id: string | null;
  reason: string | null;
}

/** The case signal one target's open flags add up to. */
export interface OpenFlagCaseSignal {
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  commentId: string | null;
  /** How many open flags — becomes `user_flag_count`. */
  flagCount: number;
  /** Normalised categories, first-seen order; an unknown legacy reason is `other`. */
  categories: PolicyCategory[];
}

/**
 * Fold open flags into one case signal per target (§3.1, §4.4, review R16).
 *
 * Flags raised before revision 2 have no `case_id`, and the case-based queue
 * lists cases only — so without a case they never reach a moderator again. The
 * migration opens (or merges into) one case per target from this summary. A
 * comment flag belongs to the comment, whatever `report_id` it stored; one
 * whose comment no longer exists has no report to hang a case on and is
 * skipped. Pass rows oldest first so the category order is the order people
 * raised them in.
 */
export function summariseOpenFlags(rows: readonly OpenFlagRow[]): OpenFlagCaseSignal[] {
  const byTarget = new Map<string, OpenFlagCaseSignal>();
  for (const row of rows) {
    const isComment = Boolean(row.comment_id);
    const targetId = isComment ? row.comment_id : row.report_id;
    const reportId = isComment ? row.comment_report_id : row.report_id;
    if (!targetId || !reportId) continue;
    const targetType: ModerationTargetType = isComment ? "comment" : "report";
    const key = `${targetType}:${targetId}`;
    let signal = byTarget.get(key);
    if (!signal) {
      signal = {
        targetType,
        targetId,
        reportId,
        commentId: isComment ? targetId : null,
        flagCount: 0,
        categories: [],
      };
      byTarget.set(key, signal);
    }
    signal.flagCount += 1;
    const category = normaliseFlagCategory(row.reason) ?? "other";
    if (!signal.categories.includes(category)) signal.categories.push(category);
  }
  return [...byTarget.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// States — §3.2, §4.3, §4.4
// ─────────────────────────────────────────────────────────────────────────────

/** `reports.moderation_state` — the publication axis (D1). */
export type ReportModerationState = "pending" | "approved" | "held" | "rejected" | "deactivated";

export const ALL_REPORT_MODERATION_STATES: readonly ReportModerationState[] = [
  "pending",
  "approved",
  "held",
  "rejected",
  "deactivated",
];

/** `report_evidence.moderation_state` (D22). No `held`: a file is shown or not. */
export type EvidenceModerationState = "pending" | "approved" | "rejected";

/**
 * `report_evidence.approved_scope` — *which bytes* an approval covers (D22,
 * review R5). NULL while a file is pending or rejected.
 *
 *   • `full`      — the original was assessed, by a human or by the AI reading
 *                   the sealed original itself; non-owners get `url` and
 *                   `thumbUrl`.
 *   • `thumbnail` — only the sealed preview was assessed (the AI's usual view of
 *                   a photo); non-owners get `thumbUrl` only, and the original
 *                   waits for a human (or a later full assessment).
 *
 * The AI only ever saw a client-generated preview, yet non-owners used to be
 * served the original — so a harmless preview over a harmful original was
 * approved and published. An approval now names what it looked at, and the
 * read path serves exactly that.
 */
export type EvidenceApprovedScope = "full" | "thumbnail";

export const ALL_EVIDENCE_APPROVED_SCOPES: readonly EvidenceApprovedScope[] = ["full", "thumbnail"];

/**
 * The scope a row ends with when an approval of `requested` scope lands on a
 * row already approved at `current` (NULL when it was not approved). An
 * approval never narrows: a later thumbnail-only verdict (a flag re-check, a
 * re-run) must not take the original away from a file a human already cleared,
 * while a full assessment (a human, or the AI on the original) upgrades a
 * thumbnail approval. The SQL in `evidence.service.ts#approveEvidence` is this
 * function, restated.
 */
export function mergeApprovedScope(
  current: EvidenceApprovedScope | null | undefined,
  requested: EvidenceApprovedScope,
): EvidenceApprovedScope {
  return current === "full" || requested === "full" ? "full" : "thumbnail";
}

/** `report_comments.moderation_state`. Deactivation is a report-only concept. */
export type CommentModerationState = "pending" | "approved" | "held" | "rejected";

/** `report_comments.status` — unchanged by revision 2, restated for the helpers. */
export type CommentStatus = "visible" | "hidden" | "removed";

/** What a run or a case is about. Evidence runs target their report. */
export type ModerationTargetType = "report" | "comment";

/** `moderation_runs.status`. The table *is* the queue (D13). */
export type RunStatus = "queued" | "running" | "done" | "cancelled";

/** Why a run was queued (§5.1). */
export type RunTrigger =
  | "filed"
  | "edited"
  | "resubmitted"
  | "comment"
  | "flagged"
  | "manual"
  | "evidence";

/**
 * What a run decided. `hide` / `keep` exist only for `flagged` re-checks of
 * published content; `noop` is a run cancelled because its content went stale
 * or was deleted. Named `RunOutcome` because `ModerationOutcome` already means
 * "a status a moderator can set" in `report.interface.ts`.
 */
export type RunOutcome = "approve" | "hold" | "hide" | "keep" | "noop";

/** `moderation_runs.ai_status` — how the AI stage ended (§5.3 step 4). */
export type AiStatus = "assessed" | "unavailable" | "blocked" | "skipped" | "error";

/** `moderation_cases.state`. One open case per target, enforced by an index. */
export type CaseState = "open" | "resolved";

/** How a case ended. `auto_cleared` is the pipeline; the rest name who or why. */
export type CaseResolution = "approved" | "rejected" | "auto_cleared" | "withdrawn" | "superseded";

/** `report_flags.status` — unchanged, restated for the case service. */
export type FlagStatus = "open" | "resolved" | "dismissed";

/** The AI's separate safety signal (D21). Not a policy violation. */
export type SafetyRisk = "none" | "self_harm" | "imminent_danger";

/** Keyword rule behaviour (D9). Seeds use `signal`. */
export type KeywordAction = "hold" | "signal" | "monitor";

/** Seeded by the migration (`system`) or written by an admin (`custom`). */
export type KeywordRuleKind = "system" | "custom";

/** Which content a keyword rule is matched against. */
export type KeywordAppliesTo = "all" | "reports" | "comments";

export const ALL_KEYWORD_ACTIONS: readonly KeywordAction[] = ["hold", "signal", "monitor"];
export const ALL_KEYWORD_RULE_KINDS: readonly KeywordRuleKind[] = ["system", "custom"];
export const ALL_KEYWORD_APPLIES_TO: readonly KeywordAppliesTo[] = ["all", "reports", "comments"];

/**
 * The single enqueue predicate (D3): private reports never reach the AI.
 *
 * Every enqueue point — filing, edits, evidence, comments, flags, reruns and
 * the reconciler — calls this rather than restating the rule, so there is one
 * line to audit for the promise "private reports are never sent".
 */
export function needsModeration(report: { visibility: string }): boolean {
  return report.visibility !== "private";
}

// ─────────────────────────────────────────────────────────────────────────────
// Reason catalogues — §3.3 (codes stored; labels in one shared map)
// ─────────────────────────────────────────────────────────────────────────────

/** One option in a reason picker. The catalogue order is the picker order. */
export interface ReasonOption<C extends string = string> {
  code: C;
  label: string;
}

/** Reject reasons are the policy codes, worded for the author (§3.3). */
export type RejectReasonCode = PolicyCategory;

export type DismissReasonCode =
  | "not_credible"
  | "duplicate"
  | "out_of_scope"
  | "insufficient_detail"
  | "withdrawn"
  | "other";

export type DeactivateReasonCode = "reporter_request" | "legal" | "filed_in_error" | "other";

export type BanReasonCode = "threats" | "harassment" | "hate" | "spam" | "repeat" | "other";

/** Staff-only hold reasons (§3.3). Never shown to an author. */
export type HoldReason =
  | "ai_low_confidence"
  | "ai_violation"
  | "ai_unavailable"
  | "ai_blocked"
  | "injection_suspected"
  | "keyword_match"
  | "content_unreadable"
  /**
   * The text is longer than the engine accepts, so the AI would only have seen
   * a clipped prefix of it — never approved on a partial read (review R10).
   * Added by the pipeline package.
   */
  | "content_too_long"
  | "safety_risk"
  | "resubmission"
  | "author_banned"
  | "media_unassessed"
  | "system_error"
  | "user_flags";

/** The author sees this label (plus an optional note) on D2 and in the Vault. */
export const REJECT_REASONS: readonly ReasonOption<RejectReasonCode>[] = [
  { code: "threat", label: "Threatening content" },
  { code: "harassment", label: "Harassment" },
  { code: "hate", label: "Hate speech" },
  { code: "private_info", label: "Exposes private details" },
  { code: "misleading", label: "Fabricated, joke or trolling (not a genuine account)" },
  { code: "spam", label: "Spam or advertising" },
  { code: "graphic", label: "Graphic or sexual content" },
  { code: "other", label: "Other" },
];

/** Incident Management → Dismiss. The author sees the label and note. */
export const DISMISS_REASONS: readonly ReasonOption<DismissReasonCode>[] = [
  { code: "not_credible", label: "Not credible on the evidence provided" },
  { code: "duplicate", label: "Duplicate of an existing incident" },
  { code: "out_of_scope", label: "Outside BlackNexa scope" },
  { code: "insufficient_detail", label: "Insufficient detail to proceed" },
  { code: "withdrawn", label: "Withdrawn by the reporter" },
  { code: "other", label: "Other" },
];

/** Incident Management → Deactivate (D10). The author sees the label and note. */
export const DEACTIVATE_REASONS: readonly ReasonOption<DeactivateReasonCode>[] = [
  { code: "reporter_request", label: "Reporter requested removal" },
  { code: "legal", label: "Legal or safeguarding instruction" },
  { code: "filed_in_error", label: "Filed in error by the reporter" },
  { code: "other", label: "Other" },
];

/** Content Moderation → Ban User. Staff-facing only. */
export const BAN_REASONS: readonly ReasonOption<BanReasonCode>[] = [
  { code: "threats", label: "Threats of violence" },
  { code: "harassment", label: "Targeted harassment" },
  { code: "hate", label: "Hate speech" },
  { code: "spam", label: "Spam or automated abuse" },
  { code: "repeat", label: "Repeated policy violations" },
  { code: "other", label: "Other" },
];

/** In the order a moderator reads them on a case. */
export const HOLD_REASONS: readonly HoldReason[] = [
  "safety_risk",
  "ai_violation",
  "keyword_match",
  "injection_suspected",
  "ai_blocked",
  "ai_low_confidence",
  "ai_unavailable",
  "content_unreadable",
  "content_too_long",
  "resubmission",
  "author_banned",
  "media_unassessed",
  "user_flags",
  "system_error",
];

/** Hold-reason chips on the case detail. Staff-only wording. */
export const HOLD_REASON_LABELS: Readonly<Record<HoldReason, string>> = {
  ai_low_confidence: "AI not confident",
  ai_violation: "AI found a violation",
  ai_unavailable: "AI unavailable",
  ai_blocked: "AI declined to assess",
  injection_suspected: "Possible instruction injection",
  keyword_match: "Keyword match",
  content_unreadable: "Content unreadable",
  content_too_long: "Too long for the AI to read in full",
  safety_risk: "Safety risk",
  resubmission: "Resubmitted after rejection",
  author_banned: "Author banned",
  media_unassessed: "Media needs review",
  system_error: "System error",
  user_flags: "User flags",
};

/** Code lists for Joi `.valid(...)`, derived so they cannot drift from the labels. */
export const REJECT_REASON_CODES: readonly RejectReasonCode[] = REJECT_REASONS.map((r) => r.code);
export const DISMISS_REASON_CODES: readonly DismissReasonCode[] = DISMISS_REASONS.map((r) => r.code);
export const DEACTIVATE_REASON_CODES: readonly DeactivateReasonCode[] = DEACTIVATE_REASONS.map(
  (r) => r.code,
);
export const BAN_REASON_CODES: readonly BanReasonCode[] = BAN_REASONS.map((r) => r.code);

/** §3.3: "`other` always requires a note." One rule, every catalogue. */
export function requiresNote(code: string | null | undefined): boolean {
  return code === "other";
}

function labelIn<C extends string>(
  catalogue: readonly ReasonOption<C>[],
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return catalogue.find((option) => option.code === code)?.label ?? null;
}

export function rejectReasonLabel(code: string | null | undefined): string | null {
  return labelIn(REJECT_REASONS, code);
}

export function dismissReasonLabel(code: string | null | undefined): string | null {
  return labelIn(DISMISS_REASONS, code);
}

export function deactivateReasonLabel(code: string | null | undefined): string | null {
  return labelIn(DEACTIVATE_REASONS, code);
}

export function banReasonLabel(code: string | null | undefined): string | null {
  return labelIn(BAN_REASONS, code);
}

export function holdReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(HOLD_REASON_LABELS, code)
    ? HOLD_REASON_LABELS[code as HoldReason]
    : null;
}

/**
 * `reports.moderation_reason` holds a reject code or a deactivate code, and the
 * state says which catalogue it belongs to. Returns `null` for every other
 * state: hold reasons are staff-only (§3.2), so a held report has no
 * author-visible reason even if a stale code is still on the row.
 */
export function ownerReasonLabel(
  moderationState: ReportModerationState,
  code: string | null | undefined,
): string | null {
  if (moderationState === "rejected") return rejectReasonLabel(code);
  if (moderationState === "deactivated") return deactivateReasonLabel(code);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner display status — §3.2
// ─────────────────────────────────────────────────────────────────────────────

/** One value for the D2 banner, the Vault chips and the C9 stepper. */
export type DisplayStatus =
  | "checking"
  | "with_moderator"
  | "not_published"
  | "taken_down"
  | "published"
  | "private"
  | "under_review"
  | "verified"
  | "dismissed";

/** In the Vault's chip order. */
export const ALL_DISPLAY_STATUSES: readonly DisplayStatus[] = [
  "checking",
  "with_moderator",
  "not_published",
  "published",
  "private",
  "under_review",
  "verified",
  "dismissed",
  "taken_down",
];

export const DISPLAY_STATUS_LABELS: Readonly<Record<DisplayStatus, string>> = {
  checking: "Checking",
  with_moderator: "With a moderator",
  not_published: "Not published",
  taken_down: "Taken down",
  published: "Published",
  private: "Private",
  under_review: "Under review",
  verified: "Verified",
  dismissed: "Dismissed",
};

/**
 * States in which the author is shown a reason label and note (§3.2). Held
 * reports show no reason at all — hold reasons are staff-only.
 */
export const AUTHOR_VISIBLE_MODERATION_STATES: readonly ReportModerationState[] = [
  "rejected",
  "deactivated",
];

export function isAuthorVisibleModerationState(state: ReportModerationState): boolean {
  return AUTHOR_VISIBLE_MODERATION_STATES.includes(state);
}

/** The inputs `displayStatusOf` needs — a report row satisfies it structurally. */
export interface DisplayStatusInput {
  moderationState: ReportModerationState;
  /** A `ReportStatus`. Typed as a string so a raw row can be passed unconverted. */
  status: string;
  /** A `Visibility`. */
  visibility: string;
}

/**
 * The §3.2 owner-display table, exactly:
 *
 *   pending → checking · held → with_moderator · rejected → not_published ·
 *   deactivated → taken_down (whatever the case status), and for approved
 *   reports the case status: submitted → published, under_review, verified,
 *   dismissed.
 *
 * Private reports "skip checking and show *Private* instead of *Published*":
 * they are approved at filing (D3), so the only substitution needed is
 * approved + submitted + private → `private`. A private report further along
 * the case axis shows that axis (Under review, Verified, Dismissed) like any
 * other, and a private report staff took down still shows Taken down.
 */
export function displayStatusOf(input: DisplayStatusInput): DisplayStatus {
  switch (input.moderationState) {
    case "pending":
      return "checking";
    case "held":
      return "with_moderator";
    case "rejected":
      return "not_published";
    case "deactivated":
      return "taken_down";
    case "approved":
    default:
      switch (input.status) {
        case "under_review":
          return "under_review";
        case "verified":
          return "verified";
        case "dismissed":
          return "dismissed";
        default:
          return input.visibility === "private" ? "private" : "published";
      }
  }
}

/**
 * The inverse of `displayStatusOf`, as a conjunction a query can apply — for
 * `GET /reports?mine=true&displayStatus=…` (§7.4). `statuses: null` means any
 * case status; `visibility` narrows to private or non-private reports.
 */
export interface DisplayStatusFilter {
  moderationState: ReportModerationState;
  statuses: readonly string[] | null;
  visibility: "private" | "not_private" | null;
}

export function displayStatusFilter(displayStatus: DisplayStatus): DisplayStatusFilter {
  switch (displayStatus) {
    case "checking":
      return { moderationState: "pending", statuses: null, visibility: null };
    case "with_moderator":
      return { moderationState: "held", statuses: null, visibility: null };
    case "not_published":
      return { moderationState: "rejected", statuses: null, visibility: null };
    case "taken_down":
      return { moderationState: "deactivated", statuses: null, visibility: null };
    case "published":
      return { moderationState: "approved", statuses: ["submitted"], visibility: "not_private" };
    case "private":
      return { moderationState: "approved", statuses: ["submitted"], visibility: "private" };
    case "under_review":
      return { moderationState: "approved", statuses: ["under_review"], visibility: null };
    case "verified":
      return { moderationState: "approved", statuses: ["verified"], visibility: null };
    case "dismissed":
      return { moderationState: "approved", statuses: ["dismissed"], visibility: null };
  }
}

/**
 * `ReportOwnerView.moderation` (§7.4). `reasonCode`, `reasonLabel` and `note`
 * are populated only in `AUTHOR_VISIBLE_MODERATION_STATES`.
 */
export interface OwnerModerationView {
  state: ReportModerationState;
  displayStatus: DisplayStatus;
  reasonCode?: string | null;
  reasonLabel?: string | null;
  note?: string | null;
  /**
   * `rejected` only: how many more *Edit and resubmit* attempts the server will
   * accept before it answers 409 "Contact support" (D19, `MAX_RESUBMISSIONS`).
   * D2 hides the action at 0 (§10 "hidden after 3") instead of offering an edit
   * that can only be refused. Omitted in every other state.
   */
  resubmissionsLeft?: number;
  /** When the current state was reached (`moderated_at`), or null if never moderated. */
  at: string | null;
}

/** Owner-safe moderation events on the D2 timeline (§7.4). */
export type OwnerModerationEvent =
  | "published"
  | "with_moderator"
  | "not_published"
  | "taken_down"
  | "live_again";

// ─────────────────────────────────────────────────────────────────────────────
// Owner notifications — §7.7
// ─────────────────────────────────────────────────────────────────────────────

/** One notification template. `type` is a `NotificationType`. */
export interface OwnerNotificationCopy {
  type: "status_change" | "moderation_notice" | "corroboration_or_reply";
  title: string;
  /**
   * Fixed copy. Never member text: "no unmoderated member text in any
   * notification, push or email" (§0). `null` for `reply`, whose body is the
   * *approved* comment's first 160 characters, supplied by the caller.
   */
  body: string | null;
}

export const OWNER_NOTIFICATIONS = {
  live: {
    type: "status_change",
    title: "Your report is live",
    body: "It is now visible in the community feed.",
  },
  withModerator: {
    type: "status_change",
    title: "Your report is with a moderator",
    body: "A moderator checks it before it is published. Urgent reports are checked within the hour.",
  },
  /** D21: the crisis-copy variant when the AI signalled a safety risk. */
  withModeratorSafety: {
    type: "status_change",
    title: "Your report is with a moderator",
    body: "If you or someone else is in danger right now, call your local emergency number. A moderator is looking at your report now.",
  },
  notPublished: {
    type: "status_change",
    title: "Your report wasn't published",
    body: "Open it to see why and what you can do next.",
  },
  takenDown: {
    type: "status_change",
    title: "Your report was taken down",
    body: "Open it to see why.",
  },
  liveAgain: {
    type: "status_change",
    title: "Your report is live again",
    body: "It is visible in the community feed again.",
  },
  reviewedAgain: {
    type: "status_change",
    title: "Your report is being reviewed again",
    body: "A moderator has reopened your case.",
  },
  commentRemoved: {
    type: "moderation_notice",
    title: "Your comment was removed",
    body: "A moderator removed a comment you posted because it breaks the community rules.",
  },
  reply: {
    type: "corroboration_or_reply",
    title: "Someone replied to your report",
    body: null,
  },
} as const satisfies Record<string, OwnerNotificationCopy>;

// ─────────────────────────────────────────────────────────────────────────────
// AI engine contract — §6.1 (mirrors `app/schemas/moderation.py`)
// ─────────────────────────────────────────────────────────────────────────────

/** Request caps enforced by the engine (`extra="forbid"`, 422 beyond them). */
export const AI_LIMITS = {
  maxTitleChars: 200,
  maxBodyChars: 20_000,
  maxLocationLabelChars: 200,
  maxParentTitleChars: 200,
  maxFlaggedCategories: 8,
  maxKeywordSignals: 20,
  maxImages: 10,
  /** Decoded bytes per image. */
  maxImageBytes: 1_572_864,
  maxEvidenceChars: 200,
  maxSummaryChars: 600,
} as const;

/** The nine report categories, restated (see the header). */
export type AiReportCategory =
  | "policing"
  | "profiling"
  | "housing"
  | "workplace"
  | "education"
  | "medical"
  | "digital"
  | "harassment"
  | "other";

/** Thumbnail formats the engine accepts. */
export type AiImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface AiAssessImage {
  mimeType: AiImageMimeType;
  /** Base64, ≤ `AI_LIMITS.maxImageBytes` decoded. */
  data: string;
}

/** A keyword `signal` hit forwarded as a hint (D9) — never a `monitor` hit. */
export interface AiKeywordSignal {
  category: PolicyCategory;
  term: string;
}

/** `POST /api/v1/internal/moderation/assess` body (camelCase). */
export interface AiAssessRequest {
  /** The run id with dashes stripped: 32 hex characters. */
  runId: string;
  targetType: ModerationTargetType;
  /** The report category (describes what happened; not a policy code). */
  category: AiReportCategory | null;
  title: string | null;
  body: string;
  locationLabel: string | null;
  /** For comments: the parent report's title. */
  parentTitle: string | null;
  urgent: boolean;
  /**
   * D8: only the *set* of flagged categories, never notes or counts — a flag is
   * a hint where to look, not evidence.
   */
  flaggedCategories: PolicyCategory[];
  keywordSignals: AiKeywordSignal[];
  images: AiAssessImage[];
}

/** How the engine call ended. `skipped` / `error` are Node-side `AiStatus` values. */
export type AiEngineStatus = "assessed" | "unavailable" | "blocked";

export type AiRecommendation = "approve" | "review";

export type AiSeverity = "low" | "medium" | "high";

/** One of the eight per-category verdicts, always all eight, in fixed order. */
export interface AiCategoryVerdict {
  code: PolicyCategory;
  violation: boolean;
  /** 0–1, clamped by the engine. */
  confidence: number;
  severity: AiSeverity;
  /**
   * ≤ 200 characters copied verbatim from the content when `violation` is true.
   * Empty or null otherwise. Node re-checks the verbatim claim before an
   * auto-hide (D8) — the engine's word is not taken for it.
   */
  evidence: string | null;
  /** English rendering of `evidence` when the content is not English. */
  evidenceEnglish: string | null;
}

export interface AiAssessmentMeta {
  runId: string;
  model: string;
  policyVersion: string;
  durationMs: number;
}

/** The engine's response — always 200 for a valid request (§6.1). */
export interface AiAssessment {
  status: AiEngineStatus;
  /** `review` whenever any category is violated; `review, 0` when unavailable. */
  recommendation: AiRecommendation;
  confidence: number;
  categories: AiCategoryVerdict[];
  safetyRisk: SafetyRisk;
  /** ≤ 600 characters, English, for the moderator. */
  summary: string;
  injectionSuspected: boolean;
  blockReason: string | null;
  /** BCP-47 code of the main language. */
  language: string | null;
  imagesAssessed: number;
  meta: AiAssessmentMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword stage — §4.5, §5.3 step 3
// ─────────────────────────────────────────────────────────────────────────────

/** Where in the content a term matched. Comments only have a `body`. */
export type KeywordField = "title" | "body" | "locationLabel";

/**
 * One element of `moderation_runs.keyword_hits` (§4.3).
 *
 * `ruleId` is null for the built-in detectors (email, phone, SSN, card), which
 * are code rather than rows; their `ruleName` names the detector. Callers that
 * bump `keyword_rules.detected_count` must skip null ids.
 */
export interface KeywordHit {
  ruleId: string | null;
  ruleName: string;
  category: PolicyCategory;
  term: string;
  field: KeywordField;
  action: KeywordAction;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit vocabulary — §4.6
// ─────────────────────────────────────────────────────────────────────────────

/** Who acted. `ai` for assessed decisions, `system` for fallbacks (§5.3 step 6). */
export type AuditActorKind = "admin" | "system" | "ai" | "member";

/** What an audit row is about. */
export type AuditTargetType =
  | "report"
  | "comment"
  | "evidence"
  | "flag"
  | "case"
  | "keyword_rule"
  | "member";

/**
 * Every audited action, `area.verb`. A closed union so a typo cannot silently
 * create a new action that no filter or dashboard knows about; adding one is a
 * one-line change here.
 */
export type AuditAction =
  // Automated pipeline (§5.3)
  | "moderation.auto_approve"
  | "moderation.hold"
  | "moderation.auto_hide"
  | "moderation.keep"
  | "moderation.cancel"
  // Human moderation (§8.1)
  | "moderation.approve"
  | "moderation.reject"
  | "moderation.rerun"
  | "moderation.withdraw"
  | "moderation.supersede"
  | "evidence.approve"
  | "evidence.reject"
  | "keyword_rule.create"
  | "keyword_rule.update"
  | "keyword_rule.delete"
  | "member.ban"
  | "member.unban"
  // Incident management (§9.1)
  | "incident.verify"
  | "incident.dismiss"
  | "incident.reopen"
  | "incident.deactivate"
  | "incident.reactivate"
  | "incident.assign"
  | "incident.note"
  // Member actions worth an audit trail
  | "report.file"
  | "report.edit"
  | "report.resubmit"
  | "report.delete"
  | "comment.create"
  | "comment.remove"
  | "flag.create"
  | "flag.resolve"
  | "flag.dismiss"
  // D16
  | "self_action.refused";

// ─────────────────────────────────────────────────────────────────────────────
// Priorities, limits and the two pure formulas — §4.3, §4.4, §5.1, §5.2
// ─────────────────────────────────────────────────────────────────────────────

/** `moderation_runs.priority` values (§4.3, §5.1). The claim orders by it DESC. */
export const RUN_PRIORITY = {
  /** Urgent filings and safety work. */
  urgent: 100,
  /** An edit of already-published content: it is hidden until re-checked. */
  editedApproved: 50,
  flagged: 50,
  manual: 50,
  normal: 0,
} as const;

/** The resubmission cap (D19). The fourth attempt gets 409 "Contact support". */
export const MAX_RESUBMISSIONS = 3;

/**
 * How many resubmissions a rejected report has left — the owner view's
 * `moderation.resubmissionsLeft`. The same comparison `updateReport` refuses
 * on (`resubmission_count >= MAX_RESUBMISSIONS`), so D2 hides *Edit and
 * resubmit* exactly when the next attempt would be a 409. Never negative; a
 * missing or nonsense count is treated as none used.
 */
export function resubmissionsLeft(resubmissionCount: number | null | undefined): number {
  const used =
    typeof resubmissionCount === "number" && Number.isFinite(resubmissionCount)
      ? Math.max(0, Math.floor(resubmissionCount))
      : 0;
  return Math.max(0, MAX_RESUBMISSIONS - used);
}

/**
 * D19: does this pending/held report still owe the human check a human
 * rejection promised — the "resubmission debt"? `lastResubmittedVersion` is the
 * `content_version` of its newest `resubmitted` run, or null when there is none.
 *
 * The debt is a property of the report's durable state, not of any one run:
 *
 *   • a `resubmitted` run exists only because a human rejected the report —
 *     the owner edited it after the rejection, Reactivate brought a rejected
 *     report back (`incident_admin.service.ts`), or the reconciler found a
 *     rejection in its history (`reconcileTriggerFor`);
 *   • `approved_content_version` is the last version anyone cleared, and a human
 *     rejection clears it (`moderation_admin.service.ts#rejectCase`; Reactivate
 *     does the same for rows rejected before that rule existed).
 *
 * So the debt is outstanding while the report is not live, a `resubmitted` run
 * exists, and no approval has covered its version since. Only a human can
 * settle it: every run decided while it holds is decided as `resubmitted`,
 * which always holds (`moderation_pipeline.service.ts#decisionTrigger`). An
 * `edited`, `evidence` or `manual` run could otherwise be approved by the AI
 * alone and republish a report a human rejected (review R1: a late photo's
 * `evidence` run did exactly that).
 *
 * Review Q7: this used to return false straight away when `resubmission_count`
 * was 0. A report rejected on first submission, or rejected and taken down
 * while live, and then deactivated and reactivated, has a count of 0 — its
 * reactivation run held it, and the next edit or *Re-run AI* queued an ordinary
 * run the AI could approve, undoing the rejection. The count now matters only
 * when no `resubmitted` run is left to read: resubmissions on record but no run
 * to prove the check happened still fail towards a human.
 *
 * The pure half of `awaitsResubmissionCheck` in `evidence.service.ts`, the one
 * query behind the edit, late-evidence, re-run, reactivation and run-decision
 * paths.
 */
export function isAwaitingResubmissionCheck(
  report: {
    resubmission_count: number;
    moderation_state: string;
    approved_content_version: number | null | undefined;
  },
  lastResubmittedVersion: number | null,
): boolean {
  if (report.moderation_state !== "pending" && report.moderation_state !== "held") return false;
  if (lastResubmittedVersion === null || !Number.isFinite(lastResubmittedVersion)) {
    return report.resubmission_count > 0;
  }
  const approved = report.approved_content_version;
  return approved === null || approved === undefined || approved < lastResubmittedVersion;
}

/** The run a file sealed onto a filed report should queue (§5.1). */
export interface LateEvidenceRunPlan {
  trigger: Extract<RunTrigger, "evidence" | "resubmitted">;
  priority: number;
  /** Pass to `maxAttemptsFor` — an urgent report keeps its short budget (D5). */
  urgent: boolean;
}

/**
 * Whether — and how — to queue a run for a file sealed onto an already-filed
 * report (`evidence.service.ts#queueLateEvidenceRun`). Null when nothing should
 * be queued:
 *
 *   • private report, a file that is not pending, or a report that is neither
 *     `approved` nor `pending` (a held/rejected report waits for a moderator);
 *   • a pending report with a run already queued — that run reads the file;
 *   • a queued run of another kind — every run reads pending files anyway.
 *
 * Otherwise `evidence` — or `resubmitted` for a pending report still awaiting
 * its resubmission check (D19, review R1) — at the urgent priority when the
 * report is urgent (review R2).
 */
export function planLateEvidenceRun(input: {
  moderated: boolean;
  reportState: string;
  fileState: string;
  urgent: boolean;
  queuedTrigger: string | null;
  awaitingResubmissionCheck: boolean;
}): LateEvidenceRunPlan | null {
  if (!input.moderated) return null;
  if (input.fileState !== "pending") return null;
  if (input.reportState !== "approved" && input.reportState !== "pending") return null;
  if (input.reportState === "pending" && input.queuedTrigger !== null) return null;
  if (input.queuedTrigger !== null && input.queuedTrigger !== "evidence") return null;
  return {
    trigger: input.reportState === "pending" && input.awaitingResubmissionCheck ? "resubmitted" : "evidence",
    priority: input.urgent ? RUN_PRIORITY.urgent : RUN_PRIORITY.normal,
    urgent: input.urgent,
  };
}

/** At most one queued `flagged` run per target per this window (§5.1). */
export const FLAG_RECHECK_THROTTLE_MS = 15 * 60_000;

/** The weights in the §4.4 priority formula. */
export const CASE_PRIORITY_WEIGHTS = {
  urgentOrSafety: 100,
  safetyCategory: 40,
  highSeverityViolation: 20,
  perUserFlag: 5,
  maxCountedUserFlags: 10,
  mediaOnly: 5,
} as const;

export interface CasePriorityInput {
  urgent: boolean;
  /** `none`, null and undefined all mean no safety risk. */
  safetyRisk: SafetyRisk | null | undefined;
  /** The case's categories. Unknown codes are ignored. */
  categories: readonly string[];
  /** True when the AI marked any category violated with severity `high`. */
  highSeverityViolation: boolean;
  userFlagCount: number;
  /**
   * True for a case opened only because media awaits review: `media_review`
   * with no AI, keyword or user signal and no other hold reason.
   */
  mediaOnly?: boolean;
}

/**
 * §4.4: `(urgent or safety_risk) ? 100 : 0` + 40 if any of threat ·
 * private_info · graphic + 20 for a high-severity AI violation +
 * `min(user_flag_count, 10) × 5`; media-only review cases get 5.
 *
 * "Get 5" is applied as a floor — a media-only case on an urgent report still
 * sorts with the urgent ones rather than being pulled down to 5.
 */
export function casePriority(input: CasePriorityInput): number {
  const w = CASE_PRIORITY_WEIGHTS;
  const safety = input.safetyRisk != null && input.safetyRisk !== "none";
  let score = input.urgent || safety ? w.urgentOrSafety : 0;
  if (input.categories.some((code) => (SAFETY_CATEGORIES as readonly string[]).includes(code))) {
    score += w.safetyCategory;
  }
  if (input.highSeverityViolation) score += w.highSeverityViolation;
  const flags = Number.isFinite(input.userFlagCount) ? Math.max(0, Math.floor(input.userFlagCount)) : 0;
  score += Math.min(flags, w.maxCountedUserFlags) * w.perUserFlag;
  if (input.mediaOnly) score = Math.max(score, w.mediaOnly);
  return score;
}

/** The §5.2 retry schedule parameters. */
export const BACKOFF = {
  baseMs: 15_000,
  factor: 4,
  capMs: 10 * 60_000,
  /** ± this fraction of the capped delay. */
  jitter: 0.2,
} as const;

/**
 * §5.2: `min(15 s × 4^(attempt−1), 10 min)` ± 20 % → 15 s, 60 s, 4 min, 10 min.
 *
 * `attempt` is the attempt that just failed, 1-based (the run's `attempts`
 * after the claim). The jitter spreads retries from a replica-wide outage so
 * they do not all land on the engine in the same second. `randomFn` is
 * injectable so the bounds are testable; it must return a value in [0, 1).
 */
export function backoffMs(attempt: number, randomFn: () => number = Math.random): number {
  const n = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const raw = BACKOFF.baseMs * Math.pow(BACKOFF.factor, n - 1);
  const capped = Math.min(Number.isFinite(raw) ? raw : BACKOFF.capMs, BACKOFF.capMs);
  const r = Math.min(Math.max(Number(randomFn()) || 0, 0), 1);
  const factor = 1 - BACKOFF.jitter + 2 * BACKOFF.jitter * r;
  return Math.round(capped * factor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin queue tabs — §8.1 (shared so the console and the API agree)
// ─────────────────────────────────────────────────────────────────────────────

/** `GET /admin/moderation/cases?tab=` values: the four sources, then the eight codes. */
export type ModerationQueueTab = "all" | "ai" | "keyword" | "user" | "media" | PolicyCategory;

export const MODERATION_QUEUE_TABS: readonly ModerationQueueTab[] = [
  "all",
  "ai",
  "keyword",
  "user",
  "media",
  ...POLICY_CATEGORIES,
];
