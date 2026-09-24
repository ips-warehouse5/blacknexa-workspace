# Admin API — Content Moderation & Incident Management

Contract for the console (Phase 2 packages 2B *moderation* and 2C *incidents*) against the backend package 2A.
Design: `docs/INCIDENT_MODULE_PLAN.md` §3 (vocabulary), §8.1 (moderation API), §9.1 (incident API), D1, D8, D10, D15–D19, D22, §11a.
Source of truth for every shape below (kept in step with this file):

| Surface | Routes | Controller | Service (wire types) | Schemas |
|---|---|---|---|---|
| Content Moderation | `src/routes/moderation.route.ts` | `src/controllers/moderation.controller.ts` | `src/services/moderation_admin.service.ts`, `src/services/keyword_rules.service.ts` | `src/validations/moderation.validation.ts` |
| Incident Management | `src/routes/incident.route.ts` | `src/controllers/incident.controller.ts` | `src/services/incident_admin.service.ts` | `src/validations/incident.validation.ts` |
| Shared guards | — | — | `src/services/admin_guard.service.ts` (D16 self-check, access tiers, reasons) | — |
| Vocabulary | — | — | `src/types/moderation.interface.ts`, `src/types/report.interface.ts`, `src/types/user.interface.ts` | — |

Two axes, never confused (D1): **publication** (`moderationState`: pending · approved · held · rejected · deactivated) is decided in Content Moderation — and by Deactivate/Reactivate in Incident Management; the **case verdict** (`status`: submitted · under_review · verified · dismissed) is decided in Incident Management. Approving publishes; it never verifies. Verifying never changes publication.

---

## 0. Conventions

### 0.1 Base, auth, permissions

- Base URL: `/api/v1`. Moderation: `/api/v1/admin/moderation/*`. Incidents: `/api/v1/admin/incidents/*`.
- Every route requires an operator access token: `Authorization: Bearer <accessToken>` from `POST /admin/auth/mfa/verify` (or `/admin/auth/refresh`). `adminAuthGuard` runs once per router.
- Each route then requires one permission (`requirePermission`). The matrix (`src/config/rbac.config.ts`):

| Permission | superadmin | moderator | advocate | staff |
|---|:-:|:-:|:-:|:-:|
| `moderation.view` | ✓ | ✓ | | |
| `moderation.decide` | ✓ | ✓ | | |
| `moderation.ban` | ✓ | ✓ | | |
| `moderation.keywords` | ✓ | ✓ | | |
| `incidents.view` | ✓ | ✓ | ✓ | ✓ |
| `incidents.verify` | ✓ | ✓ | | |
| `incidents.dismiss` | ✓ | ✓ | | |
| `incidents.notes` | ✓ | ✓ | ✓ | ✓ |
| `incidents.assign` | ✓ | | | |
| `incidents.deactivate` | ✓ | | | |
| `platform.operate` | ✓ | | | |

- Incident routes additionally apply an **access tier** by role (§9.1, D17) — see §3.0.

### 0.2 Envelopes

Success (every endpoint below):

```ts
interface ApiSuccess<T> {
  success: 1;
  message: string;          // human-readable, e.g. "Moderation cases listed successfully."
  result: T;
  pagination?: Pagination;  // list endpoints only
}

interface Pagination {
  page: number;             // 1-based, as requested
  limit: number;            // as requested
  total: number;            // rows matching the filters (all pages)
  totalPages: number;       // ≥ 1
  hasNext: boolean;
  hasPrevious: boolean;
}
```

**Lists** (`GET /admin/moderation/cases`, `GET /admin/moderation/keyword-rules`, `GET /admin/incidents`) return `result: T[]` and the top-level `pagination` block — exactly what the console's `apiGetPage<T>` reads. Summaries are separate endpoints. `GET /admin/incidents/assignees` is an unpaginated array.

Errors (every failure — validation, guards, services, rate limit):

```ts
interface ApiError {
  success: false;
  error: string;            // client-safe message; show it as-is
}
```

The one exception is an unknown path: `404 { success: false, message: "Not found.", path: string }`.

### 0.3 Status codes

| Code | When |
|---|---|
| 400 | Joi validation (messages joined with `"; "`), a reason rule (`other` without a note), an invalid assignee, a transition the case machine forbids |
| 401 | No/expired/invalid token (`"Authentication is required to access this resource."`) |
| 403 | Missing permission (`"You do not have permission to perform this action."`), a member (non-admin) token, a staff-tier evidence request, **or a D16 self-dealing refusal** (message says why; the attempt is audited as `self_action.refused`) |
| 404 | No such case / incident / file / member / rule; an incident outside an advocate's assignments (never 403, so existence is not confirmed) |
| 409 | Already decided (two moderators at once — the loser gets this before anything is written); target deleted, removed or deactivated; wrong state for the action; content edited since it was rendered (`contentVersion`); name taken (keyword rules); **lock wait > 5 s** (`"Someone else is changing this right now. Try again in a moment."` — safe to retry) |
| 429 | `adminWriteLimiter` (per operator) or `apiLimiter` (per IP): `"Too many requests. Please slow down and try again shortly."`; `RateLimit-*` / `Retry-After` headers exposed |
| 503 | Evidence link requested but object storage is not configured, or presigning failed |
| 500 | Unexpected; message generic in production |

### 0.4 Rate limits

- `apiLimiter` — all of `/api/v1`, per IP (`RATE_LIMIT_MAX`, default 300 / 15 min).
- `adminWriteLimiter` — every `POST` / `PATCH` / `DELETE` on both routers, **keyed by the operator's admin id** (`RATE_LIMIT_USER_WRITE_MAX`, default 120 / window). Colleagues behind one office IP do not share a bucket.

### 0.5 Input rules

- Unknown query/body keys are **stripped** (not rejected). Strings are trimmed. Optional note fields treat `""`/whitespace as absent.
- Ids are UUID strings. Booleans in queries accept `true`/`false`. Timestamps on the wire are ISO-8601 strings (UTC, `…Z`).
- `publicNote` ≤ 512 chars (author-visible). `internalNote` / `note` ≤ 2000 chars (staff-only). Incident notes 1–2000.
- A reason code of `other` always requires a note: reject → `publicNote`; evidence reject → `internalNote`; ban → `note`; dismiss / deactivate → `publicNote`. Checked by Joi and again in the service.

### 0.6 What every decision does (both surfaces)

One transaction (5 s lock timeout): lock the target row (report; or comment → its report) → for moderation, lock the case → re-check state on the locked rows → write → one `audit_events` row whose `metadata` carries `before` and `after` `{ moderationState, status }` → owner notification rows. Pushes and flag-outcome emails leave **after** the commit. Every decision is refused (403) when the operator's normalised email (lower-cased, trimmed, `+tag` stripped, dots removed for gmail.com/googlemail.com) equals the author's — or, for moderation cases, a flagger's (D16). A decision that acts beyond its own case checks everyone it touches: hiding a report's file through a comment case also checks the report's flaggers; deactivation also checks the flaggers and comment authors of every case it closes (review Q3, Q4).

---

## 1. Shared vocabulary

```ts
// §3.1 — order is part of the contract (tabs, AI categories)
type PolicyCategory = "threat" | "harassment" | "hate" | "private_info" | "misleading" | "spam" | "graphic" | "other";
type LegacyFlagCode = "threatening" | "private_details" | "untrue";   // old rows only; normalised on read

type ModerationQueueTab = "all" | "ai" | "keyword" | "user" | "media" | PolicyCategory;
// Order: all, ai, keyword, user, media, threat, harassment, hate, private_info, misleading, spam, graphic, other

type ModerationTargetType = "report" | "comment";
type CaseState = "open" | "resolved";
type CaseResolution = "approved" | "rejected" | "auto_cleared" | "withdrawn" | "superseded";

type ReportModerationState = "pending" | "approved" | "held" | "rejected" | "deactivated";
type CommentModerationState = "pending" | "approved" | "held" | "rejected";
type CommentStatus = "visible" | "hidden" | "removed";
type EvidenceModerationState = "pending" | "approved" | "rejected";
type EvidenceApprovedScope = "full" | "thumbnail";

type ReportStatus = "draft" | "submitted" | "under_review" | "verified" | "dismissed";   // never "draft" here
type ReportCategory = "policing" | "profiling" | "housing" | "workplace" | "education" | "medical" | "digital" | "harassment" | "other";
type Visibility = "public" | "trusted" | "private";
type LocationPrecision = "exact" | "approximate" | "hidden";
type TimePrecision = "exact" | "day_part" | "unknown";
type DayPart = "morning" | "afternoon" | "evening" | "night";
type EvidenceKind = "photo" | "video" | "audio" | "document";
type UploadState = "pending" | "uploaded" | "sealed" | "failed";
type EvidenceStrength = "thin" | "fair" | "strong" | "very_strong";
type UserStatus = "active" | "suspended" | "deleted" | "banned";
type AdminRole = "superadmin" | "moderator" | "advocate" | "staff";
type FlagStatus = "open" | "resolved" | "dismissed";

type SafetyRisk = "none" | "self_harm" | "imminent_danger";
type AiStatus = "assessed" | "unavailable" | "blocked" | "skipped" | "error";
type AiRecommendation = "approve" | "review";
type AiSeverity = "low" | "medium" | "high";
type RunTrigger = "filed" | "edited" | "resubmitted" | "comment" | "flagged" | "manual" | "evidence";
type RunStatus = "queued" | "running" | "done" | "cancelled";
type RunOutcome = "approve" | "hold" | "hide" | "keep" | "noop";

type HoldReason =
  | "safety_risk" | "ai_violation" | "keyword_match" | "injection_suspected" | "ai_blocked"
  | "ai_low_confidence" | "ai_unavailable" | "content_unreadable" | "content_too_long"
  | "resubmission" | "author_banned" | "media_unassessed" | "user_flags" | "system_error";

type KeywordAction = "hold" | "signal" | "monitor";
type KeywordRuleKind = "system" | "custom";
type KeywordAppliesTo = "all" | "reports" | "comments";
type KeywordField = "title" | "body" | "locationLabel";

// Owner-facing display status (§3.2)
type DisplayStatus =
  | "checking" | "with_moderator" | "not_published" | "taken_down"
  | "published" | "private" | "under_review" | "verified" | "dismissed";

type AuditActorKind = "admin" | "system" | "ai" | "member";
type AuditTargetType = "report" | "comment" | "evidence" | "flag" | "case" | "keyword_rule" | "member";
type AuditAction =
  | "moderation.auto_approve" | "moderation.hold" | "moderation.auto_hide" | "moderation.keep" | "moderation.cancel"
  | "moderation.approve" | "moderation.reject" | "moderation.rerun" | "moderation.withdraw" | "moderation.supersede"
  | "evidence.approve" | "evidence.reject"
  | "keyword_rule.create" | "keyword_rule.update" | "keyword_rule.delete"
  | "member.ban" | "member.unban"
  | "incident.verify" | "incident.dismiss" | "incident.reopen" | "incident.deactivate"
  | "incident.reactivate" | "incident.assign" | "incident.note"
  | "report.file" | "report.edit" | "report.resubmit" | "report.delete"
  | "comment.create" | "comment.remove" | "flag.create" | "flag.resolve" | "flag.dismiss"
  | "self_action.refused";

// Reason catalogues (§3.3) — codes are sent; labels come back in responses
type RejectReasonCode = PolicyCategory;
type DismissReasonCode = "not_credible" | "duplicate" | "out_of_scope" | "insufficient_detail" | "withdrawn" | "other";
type DeactivateReasonCode = "reporter_request" | "legal" | "filed_in_error" | "other";
type BanReasonCode = "threats" | "harassment" | "hate" | "spam" | "repeat" | "other";

interface LabelledCode<C extends string = string> { code: C; label: string; }
interface AdminRef { id: string; name: string; role: string; }   // role: an AdminRole
```

Labels (the console may hard-code these; responses also carry them where noted):

| Catalogue | code → label |
|---|---|
| Tabs / categories (`ADMIN_TAB_LABELS`) | threat Direct Threat & Violence · harassment Harassment & Bullying · hate Hate Speech & Discrimination · private_info Private Details / Doxxing · misleading Misleading or Untrue Content · spam Spam or Advertising · graphic Graphic or Sexual Content · other Other |
| Reject (author sees) | threat Threatening content · harassment Harassment · hate Hate speech · private_info Exposes private details · misleading Fabricated, joke or trolling (not a genuine account) · spam Spam or advertising · graphic Graphic or sexual content · other Other |
| Dismiss (author sees) | not_credible Not credible on the evidence provided · duplicate Duplicate of an existing incident · out_of_scope Outside BlackNexa scope · insufficient_detail Insufficient detail to proceed · withdrawn Withdrawn by the reporter · other Other |
| Deactivate (author sees) | reporter_request Reporter requested removal · legal Legal or safeguarding instruction · filed_in_error Filed in error by the reporter · other Other |
| Ban (staff only) | threats Threats of violence · harassment Targeted harassment · hate Hate speech · spam Spam or automated abuse · repeat Repeated policy violations · other Other |
| Hold reasons (staff only) | safety_risk Safety risk · ai_violation AI found a violation · keyword_match Keyword match · injection_suspected Possible instruction injection · ai_blocked AI declined to assess · ai_low_confidence AI not confident · ai_unavailable AI unavailable · content_unreadable Content unreadable · content_too_long Too long for the AI to read in full · resubmission Resubmitted after rejection · author_banned Author banned · media_unassessed Media needs review · user_flags User flags · system_error System error |
| Admin roles | superadmin Super Admin · moderator Moderator · advocate Advocate · staff Support Staff |

---

## 2. Content Moderation — `/api/v1/admin/moderation`

A **case** is one queue item per target (a report, or a comment), opened by the automated pipeline (hold, auto-hide, media review) or by member flags, and closed by a human decision, the pipeline (`auto_cleared`), the author removing it (`withdrawn`) or deactivation (`superseded`). Rows are identified in the console by the report's `BNX-####` (comments: `· On BNX-####`).

### 2.1 `GET /cases` — the queue

Permission `moderation.view`. Paged.

Query:

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `25` | console offers 10/25/50/100 |
| `tab` | `ModerationQueueTab` | `all` | `ai` → AI flagged · `keyword` → keyword flagged · `user` → ≥ 1 user flag · `media` → media review · a policy code → the case's categories contain it |
| `state` | `open` \| `resolved` | `open` | |
| `targetType` | `report` \| `comment` | — | |
| `urgent` | boolean | — | `false` is a filter too |
| `search` | string ≤ 120 | — | case-insensitive substring of the report's `BNX-####`, the report title, or the author's display name / email |
| `sort` | `priority` \| `newest` \| `oldest` | `priority` | `priority`: priority desc, then oldest opened first. `newest`/`oldest`: by `openedAt` — on the Resolved view by `resolvedAt` |

Response `ApiSuccess<CaseListItem[]>` + `pagination`:

```ts
interface CaseSources { ai: boolean; keyword: boolean; user: boolean; media: boolean; }  // one "Flag By" badge each

interface CaseListItem {
  id: string;                                   // case id (route param for /cases/:id)
  targetType: ModerationTargetType;
  targetId: string;                             // report id or comment id
  title: string;                                // report title; comment cases: first 100 chars of the comment ("…" when clipped)
  report: { id: string; caseRef: string; title: string };   // the report (a comment's parent report)
  author: { id: string; displayName: string } | null;       // the target's author; null when the account is deleted/severed
  category: ReportCategory;                     // the report's category
  visibility: Visibility;
  location: string | null;                      // the report's area label
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
  submittedAt: string;                          // report filedAt, or the comment's createdAt
  openedAt: string;
  lastSignalAt: string;
  sources: CaseSources;
  userFlagCount: number;
  categories: PolicyCategory[];
  holdReasons: HoldReason[];
  priority: number;                             // §4.4: 0–~190
  targetState: ReportModerationState | CommentModerationState;   // the target's moderation_state now
  state: CaseState;
  resolution: CaseResolution | null;
  resolvedAt: string | null;
}
```

### 2.2 `GET /cases/summary` — tab counts

Permission `moderation.view`. No input. Counts **open** cases.

```ts
interface CaseSummary {
  open: number;                                   // = tabs.all
  tabs: Record<ModerationQueueTab, number>;       // all 13 keys always present
  urgent: number;
  safety: number;                                 // safetyRisk present and not "none"
  byTargetType: { report: number; comment: number };
}
```

The console hides the last three category tabs (`spam`, `graphic`, `other`) when their count is 0 (§8.2).

### 2.3 `GET /cases/:id` — everything needed to decide once

Permission `moderation.view`. Params `id` (uuid). Works for open and resolved cases.

```ts
interface CaseDetail {
  case: CaseView;
  target: {
    report: AdminReportView;          // the report the case is about — for a COMMENT case, the comment's parent report
    comment: AdminCommentView | null; // the comment, for comment cases; null for report cases
  };
  author: CaseAuthorView | null;      // the TARGET's author (the commenter on comment cases); null when deleted/severed
  ai: AiAssessmentView | null;        // latest finished run whose AI answered (assessed or blocked)
  keywordHits: KeywordHitView[];      // from the target's most recent finished run
  userFlags: UserFlagView[];          // EVERY flag ever raised on the target, across cases, newest first (≤ 200)
  previousRejection: PreviousRejectionView | null;   // most recent earlier case on this target resolved "rejected"
  history: HistoryItem[];             // audit rows about the target, its cases (and a report's files), newest first (≤ 100)
  runs: RunView[];                    // the target's 5 most recent runs, newest first
}

interface CaseView {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  commentId: string | null;
  state: CaseState;
  resolution: CaseResolution | null;
  resolutionReason: string | null;          // reject code when resolution = "rejected"
  resolutionReasonLabel: string | null;     // its label (rejected only)
  resolutionNote: string | null;            // author-visible note given with the decision
  internalNote: string | null;              // staff-only
  resolvedAt: string | null;
  resolvedBy: AdminRef | null;              // null for system resolutions
  sources: CaseSources;
  userFlagCount: number;
  categories: LabelledCode<PolicyCategory>[];
  holdReasons: LabelledCode<HoldReason>[];
  priority: number;
  urgent: boolean;
  safetyRisk: SafetyRisk | null;
  openedAt: string;
  lastSignalAt: string;
  latestRunId: string | null;
}

/** Staff projection of a report: full body, every file (no URLs), exact location. Shared with Incident Management. */
interface AdminReportView {
  id: string;
  caseRef: string;                          // "BNX-4471"
  title: string;
  body: string | null;                      // null only when the sealed body cannot be opened (bodyUnreadable)
  bodyUnreadable: boolean;
  category: ReportCategory;
  status: ReportStatus;
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;             // what the owner sees
  visibility: Visibility;
  anonymous: boolean;
  urgent: boolean;
  occurredAt: string;
  occurredPrecision: TimePrecision;
  occurredDayPart: DayPart | null;
  filedAt: string;
  publishedAt: string | null;
  moderatedAt: string | null;
  lastEditedAt: string | null;
  contentVersion: number;                   // send it back as `contentVersion` on approve/reject
  approvedContentVersion: number | null;    // last version an approval cleared; null again once a human rejects it (D19)
  humanReviewedVersion: number | null;      // = contentVersion once a human approved this version (D8)
  resubmissionCount: number;                // 0–3
  moderationReason: string | null;          // reject or deactivate code, per moderationState
  moderationReasonLabel: string | null;     // its label — only when moderationState is rejected or deactivated
  moderationNote: string | null;            // author-visible note
  location: AdminLocationView;
  evidence: AdminEvidenceView[];            // every file, sort order
  supportCount: number;
  commentCount: number;                     // visible + approved comments
  corroborationCount: number;
  evidenceStrength: EvidenceStrength;
}

interface AdminLocationView {
  label: string | null;
  precision: LocationPrecision;
  lat: number | null;                       // rounded, servable point (null when precision is "hidden")
  lng: number | null;
  exactLat: number | null;                  // true coordinates, unsealed; null when none recorded / unopenable
  exactLng: number | null;
}

/** One file. No URLs — ask GET …/evidence/:evidenceId on "View". */
interface AdminEvidenceView {
  id: string;
  kind: EvidenceKind;
  mime: string;
  bytes: number;
  durationMs: number | null;
  capturedAt: string | null;
  sealedAt: string | null;                  // "Integrity verified" = sealedAt && sha256
  sha256: string | null;
  uploadState: UploadState;                 // only "sealed" files can be viewed or approved
  moderationState: EvidenceModerationState;
  approvedScope: EvidenceApprovedScope | null;   // members get the full file only for "full"
  hasThumbnail: boolean;
  sortOrder: number;
}

interface AdminCommentView {
  id: string;
  reportId: string;
  parentId: string | null;                  // the comment it replies to
  body: string;
  anonymous: boolean;
  status: CommentStatus;
  moderationState: CommentModerationState;
  moderationReason: string | null;          // reject code
  moderationReasonLabel: string | null;
  createdAt: string;
  moderatedAt: string | null;
  likeCount: number;
  author: { id: string; displayName: string } | null;
}

/** D15: moderators see who wrote it, even when posted anonymously. */
interface CaseAuthorView {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  memberSince: string | null;
  anonymousOnThisItem: boolean;             // the target was posted anonymously
  stats: {
    reports: number;                        // reports filed and not deleted
    rejected: number;                       // their reports a moderator rejected (resolved cases)
    commentsRemoved: number;                // their comments a moderator removed
    flagsAgainst: number;                   // flags ever raised on their reports and comments
  };
}

interface AiCategoryView {
  code: PolicyCategory;
  label: string;                            // ADMIN_TAB_LABELS
  violation: boolean;
  confidence: number;                       // 0–1
  severity: AiSeverity;
  evidence: string | null;                  // ≤ 200 chars quoted from the content (violations)
  evidenceEnglish: string | null;           // English rendering when the content is not English
}

interface AiAssessmentView {
  runId: string;
  trigger: RunTrigger;
  aiStatus: "assessed" | "blocked";         // "blocked" → the engine declined; categories is then usually empty
  outcome: RunOutcome | null;
  recommendation: AiRecommendation | null;
  confidence: number | null;
  summary: string | null;                   // ≤ 600 chars, English, for the moderator
  language: string | null;                  // BCP-47
  safetyRisk: SafetyRisk | null;            // not "none" → show the safety banner
  injectionSuspected: boolean;
  blockReason: string | null;
  model: string | null;
  policyVersion: string | null;
  durationMs: number | null;
  imagesAssessed: number;
  categories: AiCategoryView[];             // all 8 in the fixed order when assessed
  holdReasons: LabelledCode<HoldReason>[];  // that run's reasons
  finishedAt: string | null;
}

interface KeywordHitView {
  ruleId: string | null;                    // null for built-in detectors (email, phone, SSN, card)
  ruleName: string;
  category: PolicyCategory;
  categoryLabel: string;
  term: string;                             // the rule term that matched; detectors: their label (e.g. "phone number"), never the value
  field: KeywordField;
  action: KeywordAction;
}

interface UserFlagView {
  id: string;
  flagRef: string;                          // "FLG-2209"
  category: PolicyCategory;                 // canonical (legacy codes normalised)
  categoryLabel: string;
  reason: string;                           // as stored — may be a LegacyFlagCode on old rows
  note: string | null;                      // the flagger's note (staff only)
  status: FlagStatus;
  resolution: string | null;                // text the reporter was emailed
  caseId: string | null;
  contentVersion: number | null;            // report version flagged
  createdAt: string;
  resolvedAt: string | null;
  /** D15: visible to moderators, never to the author. Null once the reporter deleted their account. */
  reporter: { id: string; displayName: string; memberSince: string | null; flagsFiled: number } | null;
}

interface PreviousRejectionView {
  caseId: string;
  reasonCode: string | null;
  reasonLabel: string | null;
  publicNote: string | null;
  internalNote: string | null;
  resolvedAt: string | null;
  resolvedBy: AdminRef | null;
}

interface HistoryItem {
  id: string;
  at: string;
  action: AuditAction;
  actorKind: AuditActorKind;
  actor: { id: string; name: string } | null;   // admins and members by name; null for system/ai and erased members
  targetType: AuditTargetType;
  targetId: string | null;
  caseId: string | null;
  reasonCode: string | null;
  note: string | null;                      // staff-only note
  metadata: Record<string, unknown> | null; // before/after states, run ids, counts — never member content
}

interface RunView {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  outcome: RunOutcome | null;
  reasons: HoldReason[];
  aiStatus: AiStatus | null;
  aiRecommendation: AiRecommendation | null;
  aiConfidence: number | null;
  safetyRisk: SafetyRisk | null;
  attempts: number;
  maxAttempts: number;
  contentVersion: number;
  error: string | null;                     // status + error type only
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  imagesAssessed: number | null;
  keywordHitCount: number;
}
```

Errors: 404 `"That moderation case does not exist."` · 404 `"The report this case is about no longer exists."`

### 2.4 `GET /cases/:id/evidence/:evidenceId` — open a file

Permission `moderation.view`. Params `id`, `evidenceId` (uuid). The file must belong to the case's report and be **sealed**. Staff links cover the original whatever its approval.

```ts
interface EvidenceLink {
  url: string;                              // presigned, short-lived (S3_PRESIGN_EXPIRES_SECONDS, default 900 s)
  thumbUrl: string | null;
}
```

Errors: 404 `"That file is not available on this case."` · 503 `"File storage is not configured on this server, so files can't be opened."` · 503 `"That file can't be opened right now. Try again in a moment."`

### 2.5 `POST /cases/:id/approve` — Approve & Publish · Keep Published · Keep Comment

Permission `moderation.decide`. Write-limited. Params `id`.

Body:

```ts
interface ApproveBody {
  internalNote?: string;                    // ≤ 2000, staff-only (stored on the case and the audit row)
  contentVersion?: number;                  // int ≥ 1 — send AdminReportView.contentVersion you rendered (report cases)
  evidenceIds?: string[];                   // ≤ 50 distinct UUIDs — the files the moderator saw rendered (report cases)
}
```

`evidenceIds` (review Q6): the ids of the files in `target.report.evidence` that the console rendered on the case — the sealed ones that are `pending`, or `approved` at scope `thumbnail`. Sealing a file never bumps `contentVersion`, and owners can add files to held, approved and rejected reports, so this list is what ties a human approval to the bytes a human saw. Absent or empty → **no file is approved**. Ids that are not sealed files of this report are ignored.

Effects:
- **Report case**: `moderationState → approved`, `moderatedAt`, `approvedContentVersion = humanReviewedVersion = contentVersion` (D8: that version is never auto-hidden again), `publishedAt` set on the first publish (never moved), reject reason/note cleared; the files in `evidenceIds` ∩ sealed ∩ this report approved at scope `full` (a thumbnail-scope approval among them upgraded to `full`); queued runs cancelled; then, if any sealed file of the report is **still pending** (sealed after the detail was rendered, or not in the list), an automated `evidence` run is queued for it — the report is approved now, so the late-evidence path applies (the AI assesses new photos; anything it cannot see waits in Media Review) — and the worker is woken after the commit. A file still uploading gets its own run when it seals. No file is ever published without that check or a human. Open flags → `dismissed` ("No action needed" email to each reporter after the commit); case resolved `approved`. The author is told "Your report is live" on the first publish, "Your report is live again" when it had been published before and was held; nothing when it was already live. A human approval also settles a resubmission debt (§2.6).
- **Comment case**: comment approved (counter kept exact); the report owner gets "Someone replied to your report" once, now; queued runs cancelled; flags dismissed; case resolved.

Response `CaseDecisionResult`:

```ts
interface CaseDecisionResult {
  caseId: string;
  resolution: "approved" | "rejected";
  targetType: ModerationTargetType;
  targetId: string;
  reportId: string;
  targetState: ReportModerationState | CommentModerationState;   // after the decision
  evidenceApproved: number;                 // files this approval approved/upgraded — only ones in evidenceIds (report approve only)
  flagsResolved: number;
  runsCancelled: number;
  firstPublish: boolean;                    // this approval published the report for the first time
}
```

Errors: 400 `"An approval can list at most 50 files."` / `"A file is listed twice."` / `"One of the listed files is not a valid id."` · 404 case · 403 D16 (`"You can't make decisions about content you posted yourself. Ask another moderator."` / `"You flagged this yourself, so another moderator has to decide it."`) · 409 `"This case has already been decided. Reload it to see the outcome."` · 409 `"This incident was deactivated, so its moderation case can't be decided. Reactivate it in Incident Management first."` · 409 `"The report this case is about has been deleted, so there is nothing left to decide."` · 409 `"That comment has been removed, so there is nothing left to decide."` · 409 `"The report was edited after you opened it. Reload it and review the new version before deciding."` (only when `contentVersion` is sent and stale) · 409 lock timeout.

Console copy (§8.2): "Publishing makes it visible in the community feed. It does not verify it — verification happens in Incident Management." Button: *Approve & Publish* when `target.report.moderationState !== "approved"`, *Keep Published* when it is; comment cases *Keep Comment*.

### 2.6 `POST /cases/:id/reject` — Reject · Reject & Take Down · Remove Comment

Permission `moderation.decide`. Write-limited. Params `id`.

```ts
interface RejectBody {
  reasonCode: RejectReasonCode;             // required
  publicNote?: string;                      // ≤ 512, shown to the author; REQUIRED when reasonCode = "other"
  internalNote?: string;                    // ≤ 2000, staff-only
  contentVersion?: number;                  // as on approve
}
```

Effects:
- **Report case**: `moderationState → rejected`, `moderationReason = reasonCode`, `moderationNote = publicNote`, `moderatedAt`, `approvedContentVersion → null`; queued runs cancelled; open flags → `resolved` ("Action taken" email after the commit); case resolved `rejected` with code, public and internal notes. The author is told "Your report wasn't published" — body `"Reason: <label>. <publicNote> Open it to see why and what you can do next."`. The author may edit and resubmit (always held for a human, max 3).
- **Resubmission debt (D19, review Q7)**: a human rejection is owed a human check. Whichever way the report later leaves `rejected` — an edit (a resubmission), or Reactivate (§3.6) — it carries a `resubmitted` run and no approved version, and until a moderator approves it **every** automated path holds it for a human: further edits, *Re-run AI*, late files, reconciler runs and a second deactivate/reactivate are all queued and decided as `resubmitted`, which always holds. This covers a report rejected on first submission, or rejected and taken down while live (`resubmissionCount` 0), too.
- **Comment case**: comment `moderationState → rejected` with the code (counter kept exact); the commenter gets a `moderation_notice` "Your comment was removed" — body `"Reason: <label>. <publicNote> A moderator removed a comment you posted because it breaks the community rules."`; flags resolved; case resolved.

Response `CaseDecisionResult` (`resolution: "rejected"`, `evidenceApproved: 0`, `firstPublish: false`).

Errors: as approve, plus 400 `"Choose one of the rejection reasons."` / `"Add a note that explains the reason when you choose “Other”."`.

### 2.7 `POST /cases/:id/evidence/:evidenceId/reject` — Hide from members

Permission `moderation.decide`. Write-limited. Params `id`, `evidenceId`. Hides one file from members permanently; the report and the case are unchanged (the case stays open for the decision on the rest). The file is the report's whichever case the call comes through, so on a comment case D16 also refuses a moderator who flagged the report itself (review Q3).

```ts
interface EvidenceRejectBody {
  reasonCode?: RejectReasonCode;
  internalNote?: string;                    // ≤ 2000; REQUIRED when reasonCode = "other"
}

interface EvidenceRejectResult {
  caseId: string;
  evidenceId: string;
  moderationState: "rejected";
  approvedScope: null;
}
```

Errors: 404 case / `"That file is not part of this case's report."` · 403 D16 · 409 already decided · 409 report deleted / deactivated · 409 `"That file is already hidden from members."`.

### 2.8 `POST /cases/:id/rerun` — Re-run AI

Permission `moderation.decide`. Write-limited. Params `id`. No body. Held → pending plus a queued run (`manual`, or `resubmitted` when the report still owes its post-rejection human check — including one Reactivate brought back from `rejected` (§2.6) — the outcome is then always a hold). The worker is woken after the commit. The case stays open; the run's result clears or updates it.

```ts
interface RerunResponse { caseId: string; runId: string; }
```

Errors: 404 case · 403 D16 · 409 already decided · 409 `"This incident was deactivated. Reactivate it in Incident Management first."` · 409 `"Only content that is held for a moderator can be re-run through the AI."` · 409 `"The content this case is about has been removed."` · 409 `"Private reports are never sent to the AI."`.

### 2.9 `POST /members/:id/ban` · `POST /members/:id/unban`

Permission `moderation.ban`. Write-limited. Params `id` = the member's **app-user** id (`CaseAuthorView.id`, `UserFlagView.reporter.id`).

```ts
interface BanBody {
  reasonCode: BanReasonCode;                // required
  note?: string;                            // ≤ 2000, staff-only; REQUIRED when reasonCode = "other"
  caseId?: string;                          // optional: the case it was issued from (links the audit row) — must be about this member
}
interface UnbanBody {
  note?: string;
  caseId?: string;
}

interface MemberStatusResult {
  memberId: string;
  status: UserStatus;                       // "banned" after ban, "active" after unban
  sessionsRevoked: number;                  // ban: sessions signed out; unban: 0
}
```

`caseId` (review Q5) must name a case about this member: they wrote its target (the report, or the comment) or flagged it on that case. The audit row appears in that case's History.

Ban: status `banned`, every session revoked (they are signed out everywhere; login/refresh refuse `banned`). Content decisions are unchanged — the pipeline holds a banned author's pending items (`author_banned`). **Their open flags stop steering anything (§7.9, review Q2)**: each is resolved `dismissed` ("Closed: the member who raised it was banned.", no email) and audited `flag.dismiss` on its case (`reasonCode: "reporter_banned"`, `metadata.by = "member.ban"`; the console's History reads it as "The member who raised it was banned"); each case they sat on has `userFlagCount`, priority and — when only flags raised it — its categories recounted from the flags still open (`user_flags` leaves `holdReasons` when none is left; the case stays open for a moderator); a queued flag re-check with no open flag from an active member left behind it is withdrawn (a live report's pending files then get their own `evidence` run). Flag re-checks also ignore flags from any reporter who is not `active`. The ban's audit metadata adds `flagsDismissed` and `recheckRunsCancelled`. Unban: `banned → active`; they sign in again; dismissed flags stay dismissed. Both audited with `before`/`after` status.

Errors: 404 `"That member does not exist."` (also for deleted accounts) · 404 case (bad `caseId`) · 400 `"That case is not about this member."` · 403 `"You can't take enforcement action on your own member account."` · 409 `"That member is already banned."` / `"That member is not banned."` · 400 reason.

### 2.10 Keyword rules

| Method & path | Permission | Write-limited |
|---|---|---|
| `GET /keyword-rules` | `moderation.view` | |
| `GET /keyword-rules/:id` | `moderation.view` | |
| `POST /keyword-rules` | `moderation.keywords` | ✓ |
| `PATCH /keyword-rules/:id` | `moderation.keywords` | ✓ |
| `DELETE /keyword-rules/:id` | `moderation.keywords` | ✓ |

```ts
interface KeywordRuleView {
  id: string;
  name: string;                             // unique among live rules, case-insensitive
  category: PolicyCategory;
  categoryLabel: string;
  terms: string[];                          // 1–50 (a disabled seed may have 0), each 2–80 chars; trailing "*" = prefix
  action: KeywordAction;                    // hold (always hold) · signal (hint to the AI; holds only if confirmed or AI unavailable) · monitor (record only)
  kind: KeywordRuleKind;                    // system rules are the seeds
  appliesTo: KeywordAppliesTo;
  enabled: boolean;
  detectedCount: number;
  lastDetectedAt: string | null;
  createdBy: string | null;                 // admin id
  updatedBy: string | null;                 // admin id
}
```

- `GET /keyword-rules` — query `page` (1), `limit` (1–100, 25), `search` (≤ 120; name or any term), `action`, `enabled` (boolean), `category`, `appliesTo`. Response `ApiSuccess<KeywordRuleView[]>` + `pagination`. Order: system rules first, then by name. Deleted rules never appear.
- `GET /keyword-rules/:id` → `KeywordRuleView`. 404 `"That keyword rule no longer exists."`
- `POST /keyword-rules` — body `{ name: string (2–80), category: PolicyCategory, terms: string[] (1–50 × 2–80), action?: KeywordAction = "signal", appliesTo?: KeywordAppliesTo = "all", enabled?: boolean = true }` → **201** `KeywordRuleView` (`kind: "custom"`). 409 `"A rule with that name already exists."`; 400 term problems (each 2–80 characters, a `*` only at the end with ≥ 2 characters before it, at least one letter or digit, 1–50 distinct terms).
- `PATCH /keyword-rules/:id` — body: any subset (≥ 1 field) of the create fields → `KeywordRuleView`. 400 `"Send at least one field to change."`; 400 `"Add at least one term before enabling this rule."`; 404; 409 name taken.
- `DELETE /keyword-rules/:id` — soft delete (disabled, then removed; detection history kept for audit) → `{ id: string; deleted: true }`. 404.

Every change is audited (`keyword_rule.create|update|delete`); the matcher's cache picks it up on the next run.

### 2.11 `GET /stats`

Permission `moderation.view`. No input. Also feeds the Phase 3 dashboard.

```ts
interface ModerationStats {
  openCases: number;
  bySource: { ai: number; keyword: number; user: number; media: number };   // open cases per source (overlapping)
  urgentOpen: number;
  safetyOpen: number;
  urgentUnassignedBreached: number;   // urgent reports still submitted & unassigned past slaMinutes (any moderation state)
  safetyFlagBreached: number;         // open cases with an open threat/private_info/graphic user flag older than safetyFlagSlaMinutes
  oldestOpenMinutes: number;          // 0 when the queue is empty
  runsQueued: number;
  runsFailedLastHour: number;         // runs finished in the last hour with AI unavailable/error or a system_error hold
  autoApprovedLast24h: number;
  heldLast24h: number;                // pipeline holds and auto-hides
  heldRateByLanguage: { language: string; assessed: number; held: number; rate: number }[];  // last 7 days, top 20; "und" = unknown; rate 0–1 (3 dp)
  slaMinutes: number;                 // MODERATION_URGENT_SLA_MINUTES (60)
  safetyFlagSlaMinutes: number;       // 60
  generatedAt: string;
}
```

### 2.12 Operations (superadmin)

| Method & path | Permission | Body | Result |
|---|---|---|---|
| `POST /broadcast` | `platform.operate` | `{ area: string (geohash prefix, 2–8 chars), title: string (1–120), body: string (1–400) }` | `{ recipients: number }` |
| `POST /maintenance` | `platform.operate` | none | `{ filesPurged: number; filesFailed: number; reportsPurged: number; countsCorrected: number; otpsRemoved: number; sessionsRemoved: number }` |

---

## 3. Incident Management — `/api/v1/admin/incidents`

An **incident** is a filed report (`reports`, `BNX-####`), seen from the case-verification side.

### 3.0 Access tiers (every route)

Every `/:id` route goes through `loadIncidentFor`; the list and summary apply the same scope.

```ts
type IncidentTier = "full" | "assigned" | "metadata";

interface IncidentAccess {
  tier: IncidentTier;
  assignedOnly: boolean;            // only incidents assigned to this operator exist for them
  seesContent: boolean;             // body, exact coordinates, evidence files
  seesAuthorEmail: boolean;         // a named author's email
  seesAnonymousIdentity: boolean;   // who filed an anonymous report (moderation.view or incidents.verify)
}
```

| Role | tier | assignedOnly | seesContent | seesAuthorEmail | seesAnonymousIdentity |
|---|---|:-:|:-:|:-:|:-:|
| superadmin, moderator | `full` | | ✓ | ✓ | ✓ |
| advocate | `assigned` | ✓ | ✓ | ✓ | |
| staff | `metadata` | | | | |

- Advocates: the list is forced to their assignments whatever `assignee` says; any other id (detail, evidence, notes, decisions) is **404** — the same answer as an id that does not exist.
- Staff: `report.body = null`, `report.contentRedacted = true`, exact coordinates null, author email null; the evidence endpoint answers **403**. File metadata (kind, size, hash, states) is still listed.
- An anonymous author is `{ id: null, displayName: "Anonymous", identityHidden: true }` for tiers without `seesAnonymousIdentity`; search by author name/email never matches anonymous reports for them.

### 3.1 `GET /` — the list

Permission `incidents.view`. Paged.

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–100 | `25` | |
| `status` | `all` \| `submitted` \| `under_review` \| `verified` \| `dismissed` \| `deactivated` | `all` | `deactivated` filters `moderationState = deactivated`; every other tab (incl. `all`) excludes deactivated incidents |
| `category` | `all` \| `ReportCategory` | — | includes `other` |
| `range` | `today` \| `week` \| `month` | — | UTC: since midnight today · last 7×24 h · since the 1st of this month. Wins over `from`/`to` |
| `from`, `to` | ISO date (`YYYY-MM-DD`) or date-time | — | inclusive; a bare date covers that whole UTC day (Custom Date) |
| `search` | string ≤ 120 | — | `BNX-####`, title, area label, author display name (and email for tiers that see it) |
| `sort` | `newest` \| `oldest` | `newest` | by `submittedAt` |
| `assignee` | `me` \| `unassigned` \| admin uuid | — | *My Assigned Cases* = `assignee=me`; ignored for advocates (always `me`) |
| `moderation` | `pending` \| `held` \| `approved` \| `rejected` | — | publication chip |
| `urgent` | boolean | — | |

Response `ApiSuccess<IncidentListItem[]>` + `pagination`:

```ts
interface IncidentAssigneeRef {
  id: string;
  name: string;
  role: string;                     // AdminRole
  roleLabel: string;                // "Advocate", "Moderator", …
}

interface IncidentAuthorRef {
  id: string | null;                // null when identity is hidden from this caller
  displayName: string;              // "Anonymous" when hidden
  anonymous: boolean;               // filed anonymously
  identityHidden: boolean;
}

interface IncidentListItem {
  id: string;
  caseRef: string;
  title: string;
  category: ReportCategory;
  location: string | null;          // area label
  status: ReportStatus;
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
  urgent: boolean;
  slaBreached: boolean;             // urgent, still submitted, unassigned, older than the SLA
  visibility: Visibility;
  submittedAt: string;              // filedAt
  assignee: IncidentAssigneeRef | null;
  assignedAt: string | null;
  author: IncidentAuthorRef | null; // null when the author's account is gone (anonymous community record)
  evidenceCount: number;            // sealed files
  openFlags: number;                // open flags on the report itself
  openCaseId: string | null;        // the report's open moderation case, if any (link to /moderation/:caseId)
}
```

### 3.2 `GET /summary` — tab counts

Permission `incidents.view`. Query `assignee?` (`me` | `unassigned` | uuid) — the same scope rules as the list (advocates: always their assignments).

```ts
interface IncidentSummary {
  all: number;                      // excludes deactivated
  submitted: number;
  under_review: number;
  verified: number;
  dismissed: number;
  deactivated: number;
  assignedToMe: number;             // not deactivated
  unassigned: number;               // not deactivated
  urgent: number;                   // not deactivated
  slaBreached: number;
}
```

### 3.3 `GET /assignees`

Permission `incidents.assign`. No input. Active admins whose role is `moderator` or `advocate` (D17), by name. Not paginated.

```ts
interface AssigneeOption {
  id: string;
  name: string;
  email: string;
  role: "moderator" | "advocate";
  roleLabel: string;
  openAssigned: number;             // submitted/under-review, not deactivated, currently assigned to them
}
```

### 3.4 `GET /:id` — detail

Permission `incidents.view`. Params `id` (uuid). Built in full, then cut to the caller's tier.

```ts
interface IncidentDetail {
  access: IncidentAccess;           // the caller's tier — drive what the page renders from it
  report: IncidentReportView;
  author: IncidentAuthorView | null;
  assignee: (IncidentAssigneeRef & { assignedAt: string | null; assignedBy: AdminRef | null }) | null;
  moderation: {
    state: ReportModerationState;
    displayStatus: DisplayStatus;
    reasonCode: string | null;      // reject/deactivate code
    reasonLabel: string | null;     // only when rejected or deactivated
    note: string | null;            // author-visible note
    moderatedAt: string | null;
    openCaseId: string | null;      // "Resolve the moderation case first" links to /moderation/:openCaseId
    preDeactivationState: ReportModerationState | null;
    reactivateRestores: "approved" | "pending" | null;   // what Reactivate would do now; null unless deactivated
  };
  verifiedBy: AdminRef | null;      // who moved it to verified most recently (Case Record)
  verifiedAt: string | null;
  timeline: IncidentTimelineItem[]; // oldest first
  notes: IncidentNoteView[];        // newest first
  counts: {
    evidence: number;               // sealed files
    openFlags: number;
    flags: number;
    comments: number;
    supports: number;
    corroborations: number;
    notes: number;
  };
  evidenceStrength: { strength: EvidenceStrength; rationale: string };
  actions: IncidentActions;
}

/** AdminReportView (§2.3) cut to the tier. */
interface IncidentReportView extends AdminReportView {
  contentRedacted: boolean;         // true for the metadata tier: body null, exactLat/exactLng null
}

interface IncidentAuthorView extends IncidentAuthorRef {
  email: string | null;             // only for tiers that see it, and only when identity is visible
  status: UserStatus | null;
  memberSince: string | null;
}

type IncidentTimelineKind = "status" | "moderation" | "assignment" | "author";

interface IncidentTimelineItem {
  id: string;
  at: string;
  kind: IncidentTimelineKind;
  action: string;                   // "status.<ReportStatus>" for case-status events, else the AuditAction
  label: string;                    // ready to print, e.g. "Approved and published by a moderator", "Assigned to R. Idris"
  status: ReportStatus | null;      // status events only
  actor: { kind: AuditActorKind; id: string | null; name: string | null };
                                    // admin → name; member → { id: null, name: "Author" }; ai → "AI check"; system → "System"
  reasonCode: string | null;
  reasonLabel: string | null;       // dismiss / reject / deactivate labels
  note: string | null;
  noteVisibility: "author" | "internal" | null;   // "author": the author sees it on their timeline
  moderationState: { before: string | null; after: string | null } | null;
  assignee: { id: string; name: string | null } | null;           // assignment events only
}

interface IncidentNoteView {
  id: string;
  body: string;
  createdAt: string;
  author: AdminRef | null;
}

/** Which workflow buttons the state allows. Combine with permissions in the console. */
interface IncidentActions {
  verify: boolean;                  // approved && (submitted | under_review)
  dismiss: boolean;                 // approved && (submitted | under_review)
  reopen: boolean;                  // approved && dismissed
  deactivate: boolean;              // not deactivated
  reactivate: boolean;              // deactivated
  assign: boolean;                  // always true
  resolveModerationFirst: boolean;  // not approved and not deactivated → "Resolve the moderation case first"
}
```

Errors: 404 `"That incident does not exist."` (also deleted, and advocates' unassigned incidents).

### 3.5 `GET /:id/evidence/:evidenceId`

Permission `incidents.view`. The file must belong to the incident and be sealed. Response `EvidenceLink` (§2.4).
Errors: 404 incident / `"That file is not available on this incident."` · 403 `"Your role can see an incident's details but not open its evidence files."` (staff) · 503 storage.

### 3.6 Decisions

All return `IncidentStateView` (except notes) and follow §0.6.

```ts
interface IncidentStateView {
  id: string;
  caseRef: string;
  status: ReportStatus;
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
  moderationReason: string | null;
  moderationReasonLabel: string | null;
  moderationNote: string | null;
  assignee: IncidentAssigneeRef | null;
  assignedAt: string | null;
  verifiedAt: string | null;
  runId: string | null;             // reactivate only: the run queued when it went back to a check
  changed: boolean;                 // false only when assign re-assigned the same person (nothing written)
}
```

Refetch `GET /:id` after a decision for the timeline and notes.

| Method & path | Permission | Body | Requires | Effect |
|---|---|---|---|---|
| `POST /:id/verify` | `incidents.verify` | `{ note?: string ≤ 2000 }` (internal) | `approved` and `submitted`/`under_review` | An **unassigned** incident is first assigned to the verifier when they are an active `moderator` or `advocate` (`assignee`, `assignedAt`, `assignedBy`; audited `incident.assign` with `metadata.by = "incident.verify"`, same transaction — review Q20); a superadmin verifier leaves it unassigned; an assigned incident keeps its assignee. Then `status → verified`, `verifiedAt`; the note is stored as an Internal Admin Note (never on the author's timeline); author told "Your report is verified". Publication unchanged ("…the content decision is unchanged"). |
| `POST /:id/dismiss` | `incidents.dismiss` | `{ reasonCode: DismissReasonCode, publicNote?: string ≤ 512 (required for "other"), internalNote?: string ≤ 2000 }` | `approved` and `submitted`/`under_review` | `status → dismissed` with the reason on the status event; the author sees the label (notification "Your report was dismissed — Reason: <label>…") and the public note on their timeline; the internal note becomes an Internal Admin Note. Dismissed reports stay visible (D20). |
| `POST /:id/reopen` | `incidents.dismiss` | `{ note: string 1–2000 }` (required, internal) | `approved` and `dismissed` | `status → under_review`; author told "Your report is being reviewed again"; note stored internally. |
| `POST /:id/deactivate` | `incidents.deactivate` | `{ reasonCode: DeactivateReasonCode, publicNote?: string ≤ 512 (required for "other"), internalNote?: string ≤ 2000 }` | anything but `deactivated` | From any state: `moderationState → deactivated`, `preDeactivationState/Version` remembered; every open moderation case on the report **and its comments** resolved `superseded` (their flags resolved, reporters emailed after the commit); queued runs cancelled; author told "Your report was taken down — Reason: <label>. Open it to see why." Gone from the feed; members get 404. Moderation decisions on it answer 409 until reactivated. D16 also refuses an operator who flagged the report or any of those comments, or wrote one of those comments (review Q4). Comments keep their state (review Q8): nothing reopens moderation on them while the report is deactivated — comment runs are dropped, the reconciler skips them, new comment flags are refused (404). |
| `POST /:id/reactivate` | `incidents.deactivate` | `{ note?: string ≤ 2000 }` (internal) | `deactivated` | Back to `approved` iff it was approved when taken down **and** `contentVersion` is unchanged (author told "Your report is live again"); a private report is approved outright. Otherwise → `pending` with a queued run (`manual`; `resubmitted` when it had been rejected or still owes a resubmission check — always held for a human) and the worker woken; `runId` set. From `rejected`, `approvedContentVersion → null`: the resubmission debt (§2.6) outlives this run, so a later edit or *Re-run AI* still holds for a human until a moderator approves (review Q7). Its comments' moderation resumes: the reconciler queues runs for pending comments and reopens cases for held ones on its next cycle (≤ 5 min). |
| `POST /:id/assign` | `incidents.assign` | `{ adminId: string \| null }` (required; `null` unassigns) | assignee = active admin with role `moderator` or `advocate`, not the incident's author | Sets `assignee`, `assignedAt`, `assignedBy`. An `approved` + `submitted` incident also moves to `under_review` (author told "Your report is under review"); otherwise assignment only. Same person again → `changed: false`, nothing written. |
| `POST /:id/notes` | `incidents.notes` | `{ body: string 1–2000 }` | — | **201** `IncidentNoteView`. Staff-only by construction. |

Errors (all decisions): 404 incident (advocates: not assigned to them) · 403 D16 `"You can't make decisions about content you posted yourself. Ask another moderator."` (self-refusals are audited) · 409 lock timeout, plus:

| Endpoint | 400 | 409 |
|---|---|---|
| verify | — | `"This incident isn't published yet. Resolve its moderation case in Content Moderation first."` · `"This incident is deactivated. Reactivate it before changing its case status."` · `"Only a submitted or under-review incident can be verified or dismissed."` |
| dismiss | `"Choose one of the dismissal reasons."` · `"Add a note that explains the reason when you choose “Other”."` | as verify |
| reopen | `"Say why the case is being reopened."` | publication messages as verify · `"Only a dismissed incident can be reopened."` |
| deactivate | `"Choose one of the deactivation reasons."` · the `other` note message | `"This incident is already deactivated."` |
| reactivate | — | `"Only a deactivated incident can be reactivated."` |
| assign | `"Choose an active moderator or advocate to assign the case to."` · `"That person filed this incident, so it can't be assigned to them."` | — |
| notes | `"Write the note first."` · `"Keep a note under 2,000 characters."` | — |

### 3.7 `GET /metrics` — dashboard figures

Permission `incidents.view`. Feeds the console dashboard's *Incident Activity* chart and *Incident Categories* breakdown (plan §11 Phase 3C); the dashboard's KPI tiles use `GET /summary` (§3.2) and `GET /admin/moderation/cases/summary` (§2.2). Same access-tier scope as the list (§3.0): an advocate's figures count only the incidents assigned to them; every other tier counts every incident. Aggregates only — no titles, bodies or identities — so staff see the same figures as anyone in their scope.

| Param | Type | Default | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | `7d` | 400 `"range must be one of 7d, 30d, 90d or 12m."` otherwise |

Buckets are **UTC** calendar days ending with today (`7d` = today and the six days before it; 7, 30 or 90 buckets), or UTC calendar months ending with the current month for `12m` (12 buckets). Every bucket is present, empty ones as zeros, oldest first. The console should print bucket dates in UTC (`date` is a day, not an instant).

Response `ApiSuccess<IncidentMetrics>`:

```ts
type IncidentMetricsRange = "7d" | "30d" | "90d" | "12m";

interface IncidentActivityPoint {
  date: string;                     // bucket start, "YYYY-MM-DD" (UTC); a month bucket is its 1st, e.g. "2026-09-01"
  filed: number;                    // reports filed in the bucket (filedAt)
  published: number;                // public/trusted reports that went live for the FIRST time (publishedAt, D11) — private reports never count
  held: number;                     // times a report moved into `held`: automated-check holds, flag re-check auto-hides, the terminal fallback
}

interface IncidentMetrics {
  range: IncidentMetricsRange;
  bucket: "day" | "month";          // day for 7d / 30d / 90d, month for 12m
  from: string;                     // ISO start of the first bucket (UTC midnight); the window runs to generatedAt
  activity: IncidentActivityPoint[];
  totals: { filed: number; published: number; held: number };   // sums of activity
  categories: { category: ReportCategory; label: string; count: number }[];
                                    // all nine categories, reports filed in the range, most first (ties in C1 order);
                                    // label from CATEGORY_LABELS ("Policing", "Housing", …)
  byStatus: {                       // where the reports filed in the range stand now; adds up to totals.filed
    submitted: number;
    under_review: number;
    verified: number;
    dismissed: number;
    deactivated: number;            // deactivated ones counted here only, as on the list's tabs
  };
  generatedAt: string;
}
```

What counts: deleted reports never; deactivated reports do (they were filed, published and held when they were). `held` reads the audit log (`moderation.hold` / `moderation.auto_hide` rows whose recorded `after` state is `held` and `before` was not), so an evidence-only run that sends files to Media Review while the report stays live is not a hold, and a report held twice (e.g. after an edit) counts twice. `published` is `publishedAt`, set once — a reactivation or a re-approval after an edit is not a new publication.

---

## 4. Removed endpoints (revision 2)

| Removed | Replaced by |
|---|---|
| `GET /admin/moderation` (server-rendered HTML queue) | the console |
| `GET /admin/moderation/reports`, `/reports/:id`, `/reports/:id/evidence/:evidenceId` | `/cases`, `/cases/:id`, `/cases/:id/evidence/:evidenceId` (moderation) and `/admin/incidents/*` |
| `POST /admin/moderation/reports/:id/status` | `/admin/incidents/:id/verify` · `/dismiss` · `/reopen` |
| `POST /admin/moderation/flags/:id/resolve` | a case decision resolves every open flag on its target |
| `POST /admin/moderation/comments/:id/hide` | `POST /cases/:id/reject` on the comment's case |

They answer `404 { success: false, message: "Not found.", path }`.

---

## 5. Notes for the console

- **Two moderators at once**: the second decision gets 409 "already decided" — reload the case.
- **Send `contentVersion`** on approve/reject for report cases: an owner edit between render and click then answers 409 instead of publishing a version nobody read.
- **Send `evidenceIds`** on approve for report cases: the ids of the files rendered on the case (sealed, `pending` or thumbnail-approved) — capture them with `contentVersion` when the dialog opens. Only those are approved; a file sealed later is checked automatically instead. Omitting it approves no file.
- **Resolved view**: `GET /cases?state=resolved&sort=newest` orders by decision time.
- **Previous / next** within a tab: page through `GET /cases` with the same filters; ids are stable.
- **Evidence tiles**: "View" → `GET …/evidence/:evidenceId` (only `uploadState === "sealed"`); *Hide from members* → `POST /cases/:id/evidence/:evidenceId/reject`. Show `moderationState` / `approvedScope` per tile.
- **Safety**: `ai.safetyRisk` / `case.safetyRisk` not `"none"` → the safety banner; the queue's SAFETY pill uses `CaseListItem.safetyRisk`.
- **Buttons from state**: moderation — `case.state === "open"` and `target.report.moderationState !== "deactivated"`; *Re-run AI* only when the target is `held`. Incidents — `IncidentDetail.actions`, AND the permission.
- **403 from a decision** with a D16 message is expected behaviour, not an error to retry: another operator must decide.
- **Assignment**: `GET /assignees` needs `incidents.assign` (superadmin); other roles render the assignee read-only from the detail.
- **Dashboard**: KPI tiles from `GET /admin/incidents/summary` and (with `moderation.view`) `GET /admin/moderation/cases/summary`, plus `GET /admin/contact/summary` (`contact.view`) and `GET /admin/staff/summary` (`staff.view`); the activity chart and category breakdown from `GET /admin/incidents/metrics?range=` (§3.7); urgent alerts from `GET /admin/moderation/cases` (priority order, filtered to urgent/safety cases; `moderation.view`) and `GET /admin/incidents?status=submitted&urgent=true&assignee=unassigned&sort=oldest` — for an advocate, whose scope is their assignments (so nothing is ever unassigned, and an assigned published incident is under review), `GET /admin/incidents?status=under_review&urgent=true&sort=oldest`. A report with an open urgent case is listed once, as the case.
