/**
 * Admin guards — who may act on an item, and the refusals every decision shares.
 *
 * docs/INCIDENT_MODULE_PLAN.md §8.1, §9.1, D15, D16, D17. Both admin surfaces —
 * Content Moderation (`moderation_admin.service.ts`) and Incident Management
 * (`incident_admin.service.ts`) — go through this file for the three rules that
 * must never differ between them:
 *
 *   1. **No self-dealing (D16).** An operator may not decide on their own
 *      content. The obvious check — `report.user_id === req.user.id` — is what
 *      the old queue did, and it never fired: members live in `app_users`,
 *      operators in `admin_users`, and an id from one table never equals an id
 *      from the other. The only thing the two accounts of one person share is an
 *      email address, so `assertNotSelf` compares *normalised* emails
 *      (`normaliseEmail`): lower-cased, trimmed, `+tag` stripped, and dots
 *      removed for Gmail, where `j.doe+mod@gmail.com` and `jdoe@googlemail.com`
 *      are the same inbox. It covers the author, and — for moderation cases — the
 *      members who flagged the item, so an operator cannot sit in judgement on a
 *      flag they raised themselves. Every refused attempt is written to the
 *      audit log as `self_action.refused`, *after* the refused transaction has
 *      rolled back (`adminTransaction`), so the refusal is on record even though
 *      nothing else is.
 *
 *   2. **Access tiers for incidents (D17, §9.1).** `loadIncidentFor` is the one
 *      door into an incident:
 *        • superadmin, moderator — every incident, everything on it;
 *        • advocate               — only incidents assigned to them; any other
 *                                   id is a 404, never a 403 (a 403 would confirm
 *                                   the incident exists), and that holds for its
 *                                   evidence, notes and summary counts as well;
 *        • staff                  — every incident, metadata only: no body, no
 *                                   exact location, no evidence URLs, no author
 *                                   email.
 *      Who filed an *anonymous* report is shown only to roles holding
 *      `moderation.view` or `incidents.verify` (C9: "Moderators can still see
 *      who filed it" — and nobody else). The tiers are data (`IncidentAccess`),
 *      so the list, the detail and the evidence endpoint read one answer.
 *
 *   3. **Reasons (§3.3).** Reject, dismiss, deactivate and ban each take a code
 *      from their own catalogue, and `other` always requires a note. Joi checks
 *      the same at the edge; `assertReason` is the service-side copy so no entry
 *      point can store a free-floating code.
 *
 * ── Why the self-check reads the admin row ────────────────────────────────
 * `adminAuthGuard` trusts the access token and never touches the database, so
 * `req.user.email` is the address at sign-in. An operator whose email was since
 * changed would otherwise be compared under the old one for up to fifteen
 * minutes. The row is read in the decision's transaction; the token's email is
 * only the fallback for a row that has vanished.
 *
 * The pure helpers (`normaliseEmail`, `findSelfRelation`, `incidentAccessFor`,
 * `canOpenIncident`, `reasonProblem`) are unit-tested in
 * `admin_guard.service.test.ts`.
 */

import { Op, type Transaction } from "sequelize";
import logger from "@/utils/logger.util";
import { Report } from "@/models/report.model";
import { AppUser } from "@/models/app_user.model";
import { AdminUser } from "@/models/admin_user.model";
import auditService from "@/services/audit.service";
import { lockedTransaction } from "@/services/report_tx";
import { HttpError, badRequest, forbidden, notFound } from "@/middlewares/error.middleware";
import { roleHasPermission } from "@/config/rbac.config";
import {
  BAN_REASONS,
  DEACTIVATE_REASONS,
  DISMISS_REASONS,
  REJECT_REASONS,
  requiresNote,
  type AuditAction,
  type AuditTargetType,
  type ReasonOption,
} from "@/types/moderation.interface";

/** The operator behind a request, as the admin controllers pass it down. */
export interface AdminActor {
  /** `admin_users.id`. */
  id: string;
  /** The email the access token was issued for — the fallback for the self-check. */
  email: string;
  /** An `AdminRole`; typed as a string because it arrives from a token claim. */
  role: string;
  /** For the audit row. */
  ip: string | null;
}

/** 409 with a client-safe message — the conflict every decision can end in. */
export function conflict(message: string): HttpError {
  return new HttpError(message, 409);
}

// ─────────────────────────────────────────────────────────────────────────────
// D16 — email normalisation and the self-check
// ─────────────────────────────────────────────────────────────────────────────

/** Domains where dots in the local part are ignored by the mail provider. */
const DOTLESS_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * One inbox, one string: lower-case, trimmed, `+tag` removed from the local
 * part, and — for Gmail — dots removed and `googlemail.com` folded into
 * `gmail.com`. Returns null for anything that is not an address, so an empty or
 * malformed value can never "match" another one.
 */
export function normaliseEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;

  let local = value.slice(0, at);
  let domain = value.slice(at + 1).replace(/\.+$/, "");
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (DOTLESS_DOMAINS.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  if (!local || !domain) return null;
  return `${local}@${domain}`;
}

/**
 * How an operator relates to the item they tried to act on:
 *   • `author`  — they wrote it (the report or the comment);
 *   • `flagger` — they flagged it, on the case being decided;
 *   • `member`  — it is their own member account (ban / unban).
 */
export type SelfRelation = "author" | "flagger" | "member";

export interface SelfCandidate {
  relation: SelfRelation;
  email: string | null | undefined;
}

/**
 * The first relation whose address is the operator's own, or null. Candidates
 * are checked in the order given, so callers list the author first — the most
 * serious conflict is the one recorded.
 */
export function findSelfRelation(
  adminEmail: string | null | undefined,
  candidates: readonly SelfCandidate[],
): SelfRelation | null {
  const mine = normaliseEmail(adminEmail);
  if (!mine) return null;
  for (const candidate of candidates) {
    if (normaliseEmail(candidate.email) === mine) return candidate.relation;
  }
  return null;
}

/** What an operator was trying to do, for the check and for the refusal's audit row. */
export interface SelfCheckSubject {
  /** The action that was refused, recorded in the audit metadata. */
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  reportId?: string | null;
  caseId?: string | null;
  /** App-user ids of the author(s): the report's owner, or the comment's writer. */
  authorIds?: readonly (string | null | undefined)[];
  /** App-user ids of the members who flagged the item on this case. */
  flaggerIds?: readonly (string | null | undefined)[];
  /** The member account a ban or unban targets. */
  memberId?: string | null;
}

const REFUSAL_MESSAGES: Readonly<Record<SelfRelation, string>> = {
  author: "You can't make decisions about content you posted yourself. Ask another moderator.",
  flagger: "You flagged this yourself, so another moderator has to decide it.",
  member: "You can't take enforcement action on your own member account.",
};

/**
 * A D16 refusal. Thrown inside a decision's transaction (so everything it did
 * rolls back) and turned into an audit row by `adminTransaction` once it has.
 */
export class SelfActionRefused extends HttpError {
  constructor(
    readonly actor: AdminActor,
    readonly subject: SelfCheckSubject,
    readonly relation: SelfRelation,
  ) {
    super(REFUSAL_MESSAGES[relation], 403);
    this.name = "SelfActionRefused";
  }
}

function presentIds(values: readonly (string | null | undefined)[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value): value is string => typeof value === "string" && value !== ""))];
}

/**
 * D16: throw `SelfActionRefused` when the operator is the author, one of the
 * flaggers, or the member being enforced against. Call it inside the decision's
 * transaction — after the target is loaded, before anything is written — and run
 * that transaction through `adminTransaction` so the refusal is audited.
 */
export async function assertNotSelf(
  tx: Transaction | null,
  actor: AdminActor,
  subject: SelfCheckSubject,
): Promise<void> {
  const authorIds = presentIds(subject.authorIds);
  const flaggerIds = presentIds(subject.flaggerIds);
  const memberIds = presentIds(subject.memberId ? [subject.memberId] : []);
  const memberLookups = [...new Set([...authorIds, ...flaggerIds, ...memberIds])];
  if (memberLookups.length === 0) return;

  const transaction = tx ?? undefined;
  const [admin, members] = await Promise.all([
    AdminUser.findByPk(actor.id, { attributes: ["id", "email"], paranoid: false, transaction }),
    // Soft-deleted accounts too: an operator's deleted member account is still theirs.
    AppUser.findAll({
      where: { id: { [Op.in]: memberLookups } },
      attributes: ["id", "email"],
      paranoid: false,
      transaction,
    }),
  ]);
  const emailOf = new Map(members.map((row) => [row.id, row.email]));

  const candidates: SelfCandidate[] = [
    ...memberIds.map((id) => ({ relation: "member" as const, email: emailOf.get(id) })),
    ...authorIds.map((id) => ({ relation: "author" as const, email: emailOf.get(id) })),
    ...flaggerIds.map((id) => ({ relation: "flagger" as const, email: emailOf.get(id) })),
  ];
  const relation = findSelfRelation(admin?.email ?? actor.email, candidates);
  if (relation) throw new SelfActionRefused(actor, subject, relation);
}

/**
 * Write the `self_action.refused` row for a refusal. Outside any transaction —
 * the decision's own transaction has rolled back by now — and never throwing:
 * the operator still gets their 403 if the audit write fails, and the failure
 * is logged instead.
 */
export async function recordSelfRefusal(err: SelfActionRefused): Promise<void> {
  try {
    await auditService.record(null, {
      actorKind: "admin",
      actorId: err.actor.id,
      action: "self_action.refused",
      targetType: err.subject.targetType,
      targetId: err.subject.targetId,
      reportId: err.subject.reportId ?? null,
      caseId: err.subject.caseId ?? null,
      reasonCode: err.relation,
      metadata: { attemptedAction: err.subject.action, relation: err.relation },
      ip: err.actor.ip,
    });
  } catch (auditErr) {
    logger.warn("[moderation] could not audit a refused self-action", {
      adminId: err.actor.id,
      action: err.subject.action,
      message: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }
  logger.warn("[moderation] self-action refused", {
    adminId: err.actor.id,
    action: err.subject.action,
    relation: err.relation,
    targetType: err.subject.targetType,
  });
}

/**
 * The transaction every admin decision runs in: `lockedTransaction` (5 s lock
 * timeout → 409, report_tx.ts) plus the D16 audit — a `SelfActionRefused`
 * thrown inside is recorded once the transaction has rolled back, then
 * rethrown as the 403 it is.
 */
export async function adminTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await lockedTransaction(work);
  } catch (err) {
    if (err instanceof SelfActionRefused) await recordSelfRefusal(err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D17 / §9.1 — incident access tiers
// ─────────────────────────────────────────────────────────────────────────────

/** `full` — everything; `assigned` — everything, on assigned incidents only; `metadata` — no content. */
export type IncidentTier = "full" | "assigned" | "metadata";

/** What one operator may see of incidents. Returned to the console with every detail. */
export interface IncidentAccess {
  tier: IncidentTier;
  /** Only incidents assigned to this operator exist for them (advocates). */
  assignedOnly: boolean;
  /** The body, exact coordinates and evidence URLs. */
  seesContent: boolean;
  /** A named author's email address. */
  seesAuthorEmail: boolean;
  /** Who filed an anonymous report (`moderation.view` or `incidents.verify`). */
  seesAnonymousIdentity: boolean;
}

/**
 * The §9.1 tier for a role. An unknown role gets the narrowest answer there is
 * — assigned-only, no content — so a role added to the matrix later sees less
 * until someone decides otherwise, never more.
 */
export function incidentAccessFor(role: string): IncidentAccess {
  const seesAnonymousIdentity =
    roleHasPermission(role, "moderation.view") || roleHasPermission(role, "incidents.verify");
  switch (role) {
    case "superadmin":
    case "moderator":
      return { tier: "full", assignedOnly: false, seesContent: true, seesAuthorEmail: true, seesAnonymousIdentity };
    case "advocate":
      return { tier: "assigned", assignedOnly: true, seesContent: true, seesAuthorEmail: true, seesAnonymousIdentity };
    case "staff":
      return { tier: "metadata", assignedOnly: false, seesContent: false, seesAuthorEmail: false, seesAnonymousIdentity };
    default:
      return { tier: "metadata", assignedOnly: true, seesContent: false, seesAuthorEmail: false, seesAnonymousIdentity: false };
  }
}

/** Whether this operator may open an incident with this assignee at all. */
export function canOpenIncident(
  access: IncidentAccess,
  adminId: string,
  assignedAdminId: string | null | undefined,
): boolean {
  if (!access.assignedOnly) return true;
  return typeof assignedAdminId === "string" && assignedAdminId === adminId;
}

const INCIDENT_GONE = "That incident does not exist.";

export interface LoadedIncident {
  report: Report;
  access: IncidentAccess;
}

export interface LoadIncidentOptions {
  transaction?: Transaction;
  /** Take the report row `FOR UPDATE` (decisions). Needs `transaction`. */
  lock?: boolean;
  /** Refuse (403) a tier that may not see content — the evidence endpoints. */
  requireContent?: boolean;
}

/**
 * The one door into an incident (§9.1). A deleted report, or one an advocate is
 * not assigned to, is a 404 — the same answer as an id that never existed.
 */
export async function loadIncidentFor(
  admin: AdminActor,
  reportId: string,
  options: LoadIncidentOptions = {},
): Promise<LoadedIncident> {
  const access = incidentAccessFor(admin.role);
  const tx = options.transaction;
  const report = await Report.findByPk(
    reportId,
    tx ? { transaction: tx, ...(options.lock ? { lock: tx.LOCK.UPDATE } : {}) } : {},
  );
  if (!report || report.deleted_at) throw notFound(INCIDENT_GONE);
  if (!canOpenIncident(access, admin.id, report.assigned_admin_id)) throw notFound(INCIDENT_GONE);
  if (options.requireContent && !access.seesContent) {
    throw forbidden("Your role can see an incident's details but not open its evidence files.");
  }
  return { report, access };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.3 — reason catalogues
// ─────────────────────────────────────────────────────────────────────────────

/** The four decisions that take a reason code. */
export type ReasonKind = "reject" | "dismiss" | "deactivate" | "ban";

const REASON_CATALOGUES: Readonly<Record<ReasonKind, readonly ReasonOption[]>> = {
  reject: REJECT_REASONS,
  dismiss: DISMISS_REASONS,
  deactivate: DEACTIVATE_REASONS,
  ban: BAN_REASONS,
};

const REASON_NOUNS: Readonly<Record<ReasonKind, string>> = {
  reject: "rejection",
  dismiss: "dismissal",
  deactivate: "deactivation",
  ban: "ban",
};

/**
 * Why a reason is not acceptable, or null when it is: the code must be in the
 * decision's own catalogue, and `other` needs a non-blank note (§3.3).
 */
export function reasonProblem(
  kind: ReasonKind,
  code: string | null | undefined,
  note: string | null | undefined,
): string | null {
  const catalogue = REASON_CATALOGUES[kind];
  if (!code || !catalogue.some((option) => option.code === code)) {
    return `Choose one of the ${REASON_NOUNS[kind]} reasons.`;
  }
  if (requiresNote(code) && !(typeof note === "string" && note.trim().length > 0)) {
    return "Add a note that explains the reason when you choose “Other”.";
  }
  return null;
}

/** `reasonProblem` as a 400. */
export function assertReason(
  kind: ReasonKind,
  code: string | null | undefined,
  note: string | null | undefined,
): void {
  const problem = reasonProblem(kind, code, note);
  if (problem) throw badRequest(problem);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared lookups
// ─────────────────────────────────────────────────────────────────────────────

/** An operator as the console shows one next to an action. */
export interface AdminRef {
  id: string;
  name: string;
  role: string;
}

/**
 * Names and roles for a set of admin ids, deleted accounts included — "decided
 * by" must keep resolving after the operator's account is removed.
 */
export async function loadAdminRefs(
  ids: readonly (string | null | undefined)[],
  tx?: Transaction,
): Promise<Map<string, AdminRef>> {
  const wanted = presentIds(ids);
  if (wanted.length === 0) return new Map();
  const rows = await AdminUser.findAll({
    where: { id: { [Op.in]: wanted } },
    attributes: ["id", "name", "role"],
    paranoid: false,
    transaction: tx,
  });
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, role: row.role }]));
}

/** An ORM timestamp (`created_on`) as the ISO string every wire field uses. */
export function isoOf(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

/** Escape `%`, `_` and `\` for an `ILIKE` pattern, and wrap it for a substring match. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
