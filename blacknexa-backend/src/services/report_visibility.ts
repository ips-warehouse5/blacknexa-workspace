/**
 * The read gate — one rule for every member read path.
 *
 * docs/INCIDENT_MODULE_PLAN.md §3.2 ("Visibility rule — one helper, every read
 * path"), §7.3, D2, D3 and D22. Before revision 2 there was no publication state
 * at all: `canRead`, the feed's `buildWhere`, the search-suggestion corpus and the
 * share page each restated "deleted? public? trusted?" in their own words, and
 * none of them could hide a report that had not been checked yet. Pre-moderation
 * makes that fatal — a single read path that forgets `moderation_state` publishes
 * unmoderated content — so the rule now lives here once:
 *
 *   A report is visible to someone other than its author iff
 *     `deleted_at IS NULL AND moderation_state = 'approved'`
 *   and the viewer's role admits its visibility (`public` for everyone;
 *   `trusted` additionally for advocates; `private` for nobody else).
 *
 *   The author always sees their own report and its state — including a
 *   deleted one, which the owner projection still answers for (D2's Vault).
 *
 * `isVisibleToMember` is the predicate for a row already loaded; `visibleWhere`
 * is the same predicate as a Sequelize `where` for the feed, facets and search;
 * `readableVisibilities` feeds the raw-SQL suggestion corpus. They are written
 * next to each other so they cannot drift.
 *
 * ── Who the viewer is ─────────────────────────────────────────────────────
 * A `Viewer` is always a *member* or nobody. `optionalAuth` only attaches
 * `req.user` for an `aud=user` token with a live session (§7.3), so an operator
 * token — whose admin role might be spelled `advocate` — can no longer pass as a
 * Trusted-Circle reader here. Staff read through `/admin/*`, never through these
 * helpers.
 *
 * ── Evidence (D22) ────────────────────────────────────────────────────────
 * A file has its own `moderation_state`. Non-owners get a working URL only for an
 * `approved` file; a file still `pending` is listed as "Awaiting review" with no
 * URL (so the report does not pretend to have fewer files than it has); a file a
 * moderator `rejected` — or an upload that `failed` — is not listed at all.
 *
 * An approval also names what it covered (`approved_scope`, review R5): the AI
 * usually assesses only a photo's sealed preview, so a file approved at
 * `thumbnail` scope is served to non-owners as its preview alone — no `url` —
 * until a human (or a full assessment) approves the original. Any approved row
 * without a recorded scope is treated the same way: failing towards the preview
 * means a code path that forgets to record a scope can never publish an
 * original nobody looked at. The owner and staff always get both.
 *
 * ── Share links (D10, §7.3) ───────────────────────────────────────────────
 * `shareLinkDecision` is what `POST /reports/:id/share-link` may do for a
 * caller, and `shareLinkResolves` is whether a stored token still opens the
 * page — both here, next to the read rule they depend on.
 *
 * This module imports nothing that reads the environment or the database, so the
 * unit tests load it without a `.env` (`npm test`).
 */

import { Op } from "sequelize";
import type { Visibility } from "@/types/user.interface";

/** The caller of a member route, as the guards leave it. `id: null` is anonymous. */
export interface Viewer {
  id: string | null;
  /** A member role (`member` / `advocate`), or null when anonymous. */
  role: string | null;
}

/** A signed-in member — the write routes, behind `userAuthGuard`. */
export interface MemberViewer extends Viewer {
  id: string;
}

export const ANONYMOUS_VIEWER: Viewer = Object.freeze({ id: null, role: null });

/** The fields of a report row the gate reads. A `Report` instance satisfies it. */
export interface ReportGateFields {
  user_id: string | null;
  deleted_at: string | null;
  moderation_state: string;
  visibility: string;
}

/** The fields of an evidence row the gate reads. */
export interface EvidenceGateFields {
  moderation_state: string;
  upload_state: string;
  /** `full` / `thumbnail` / NULL — see the file header (review R5). */
  approved_scope?: string | null;
}

/**
 * Visibilities this viewer may read in *someone else's* report. `private` is
 * never in the list — D3: a private report is its author's alone.
 */
export function readableVisibilities(viewer: Viewer): Visibility[] {
  return viewer.role === "advocate" ? ["public", "trusted"] : ["public"];
}

/** True when the viewer filed this report. A severed report (no owner) has none. */
export function isReportOwner(report: { user_id: string | null }, viewer: Viewer): boolean {
  return viewer.id !== null && report.user_id !== null && viewer.id === report.user_id;
}

/** The §3.2 rule for a non-owner, on a loaded row. */
export function isVisibleToMember(report: ReportGateFields, viewer: Viewer): boolean {
  if (report.deleted_at) return false;
  if (report.moderation_state !== "approved") return false;
  return (readableVisibilities(viewer) as string[]).includes(report.visibility);
}

/**
 * The full read rule: the author always, everyone else by `isVisibleToMember`.
 * A failure is answered with 404, never 403 — a 403 confirms the report exists,
 * which for a private or unpublished report is itself the disclosure.
 */
export function canReadReport(report: ReportGateFields, viewer: Viewer): boolean {
  return isReportOwner(report, viewer) || isVisibleToMember(report, viewer);
}

/**
 * `isVisibleToMember` as a Sequelize `where` fragment — the feed, facets and
 * search spread it into their own filters. Keys are column names.
 */
export function visibleWhere(viewer: Viewer): Record<string, unknown> {
  const visibilities = readableVisibilities(viewer);
  return {
    deleted_at: null,
    moderation_state: "approved",
    visibility: visibilities.length === 1 ? visibilities[0] : { [Op.in]: visibilities },
  };
}

/**
 * How one evidence file is presented to a viewer.
 *
 *   • `full`           — `url` and `thumbUrl`.
 *   • `thumbnail_only` — `thumbUrl` alone, flagged `fullResolutionPending`: the
 *                        approval covered the preview, not the original (R5).
 *   • `pending_review` — listed "Awaiting review", no URLs at all.
 *   • `hidden`         — not listed.
 */
export type EvidenceAccess = "full" | "thumbnail_only" | "pending_review" | "hidden";

/**
 * D22 for one file. The owner (and staff) always get the full row; everyone
 * else gets the bytes the approval actually covered — see the file header.
 */
export function evidenceAccessFor(row: EvidenceGateFields, ownerView: boolean): EvidenceAccess {
  if (ownerView) return "full";
  if (row.moderation_state === "rejected" || row.upload_state === "failed") return "hidden";
  if (row.moderation_state === "approved") {
    return row.approved_scope === "full" ? "full" : "thumbnail_only";
  }
  return "pending_review";
}

/** True when a viewer with this access may be sent a working URL of some kind. */
export function evidenceIsOpenable(access: EvidenceAccess): boolean {
  return access === "full" || access === "thumbnail_only";
}

/** What `POST /reports/:id/share-link` may do for this caller (D10, §7.3). */
export type ShareLinkDecision =
  /** The author, a published non-private report: mint a `?t=` token. */
  | { kind: "mint" }
  /**
   * A reader of a published *public* report: the plain `/r/<caseRef>` URL, no
   * token and no row — the page already serves a public report to anyone, so a
   * token would protect nothing (review R11).
   */
  | { kind: "plain" }
  | { kind: "refuse"; status: 403 | 404 | 409; message: string };

/**
 * The share rule. Tokens stay the author's alone (an advocate could otherwise
 * mint one exposing a Trusted-Circle report to anyone), but Share on a public
 * report works for every reader again — the shipped D1 sheet opens it for
 * viewers and asks for a link at once, and a 403 there broke Share for everyone
 * but the author (review R11).
 *
 *   deleted                         → 404
 *   private                         → 409 (only its author can see it, D3)
 *   not approved                    → 409 (shareable once published)
 *   author                          → mint
 *   anyone else, public             → plain
 *   anyone else, trusted            → 403
 *
 * Callers have already applied the read gate, so a non-owner never reaches
 * this for a report they cannot see.
 */
export function shareLinkDecision(report: ReportGateFields, viewer: Viewer): ShareLinkDecision {
  if (report.deleted_at) return { kind: "refuse", status: 404, message: "That report is not available." };
  if (report.visibility === "private") {
    return {
      kind: "refuse",
      status: 409,
      message: "Private reports can't be shared. Only you can see this one.",
    };
  }
  if (report.moderation_state !== "approved") {
    return { kind: "refuse", status: 409, message: "You can share this report once it is published." };
  }
  if (isReportOwner(report, viewer)) return { kind: "mint" };
  if (report.visibility === "public") return { kind: "plain" };
  return {
    kind: "refuse",
    status: 403,
    message: "Only the person who filed a Trusted Circle report can share it.",
  };
}

/**
 * Whether a stored share token still opens the page: live, and minted by the
 * report's current author (review R7). Before revision 2 any reader could mint a
 * token, so a link an advocate minted to a Trusted-Circle report would otherwise
 * keep showing it to anyone; a severed report (no author) resolves no token.
 */
export function shareLinkResolves(
  link: { created_by: string | null; revoked_at: string | null },
  report: { user_id: string | null },
): boolean {
  if (link.revoked_at) return false;
  return report.user_id !== null && link.created_by !== null && link.created_by === report.user_id;
}
