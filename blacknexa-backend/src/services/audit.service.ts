/**
 * The audit log — every AI, system, member and staff decision, append-only.
 *
 * docs/INCIDENT_MODULE_PLAN.md §0 principle 9, §4.6 and §7.8. Before this
 * table the only trace of a moderation action was a `report_status_events` row
 * for status changes; flag resolutions, comment hides and keyword verdicts left
 * no actor at all. Now every decision writes one `audit_events` row, in the same
 * transaction as the decision itself, so the log and the state it describes can
 * never disagree.
 *
 * ── Append-only, with exactly two documented exceptions ───────────────────
 * `record()` is the only writer in normal operation; nothing updates or
 * deletes a row. The two mutations below exist because erasure law outranks an
 * audit trail's completeness, and they are the *only* ones permitted (§7.8):
 *
 *   1. `redactForReport(tx, reportIds)` — when `purgeDeletedReports` destroys a
 *      report after its retention window, its audit rows lose their free text
 *      (`note`) and their `metadata`, which is replaced by a redaction marker.
 *      Actor, action, target, reason code and time survive: the log still says
 *      *that* a moderator rejected BNX-4471 on a date, not what was in it.
 *   2. `nullMemberActor(tx, memberId)` — when a member deletes their account,
 *      the rows where *they* were the actor (`actor_kind = 'member'`) lose the
 *      link to them (`actor_id`) and the IP address they acted from. Rows about
 *      them written by staff keep the target id, which no longer resolves.
 *
 * Anything else that wants to change an audit row is a bug.
 *
 * ── What goes in a row ────────────────────────────────────────────────────
 * Ids, codes, before/after states and run ids. Never member content — no
 * titles, bodies, comment text or evidence quotes — so the log itself never
 * needs moderating and can be shown to any operator with `audit.view`.
 * `note` is the operator's internal note, staff-only.
 */

import type { Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import { nowIso } from "@/models/model_options";
import { AuditEvent } from "@/models/moderation.model";
import type {
  AuditAction,
  AuditActorKind,
  AuditTargetType,
} from "@/types/moderation.interface";

export interface AuditRecordInput {
  actorKind: AuditActorKind;
  /** Admin id for `admin`, app-user id for `member`; omit for `system` / `ai`. */
  actorId?: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  /** The report the action concerns — also for comment, evidence and flag targets. */
  reportId?: string | null;
  caseId?: string | null;
  reasonCode?: string | null;
  /** Internal, staff-only note. */
  note?: string | null;
  /** Before/after states, run ids, counts. Never content. */
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

const NOTE_MAX = 2000;
const IP_MAX = 64;
const REASON_MAX = 32;

class AuditService {
  /**
   * Append one row. Pass the decision's transaction so the row commits (or
   * rolls back) with the decision; `null` only for events that have no
   * transaction of their own, such as a refused self-action (D16).
   */
  async record(tx: Transaction | null, input: AuditRecordInput): Promise<string> {
    const row = await AuditEvent.create(
      {
        actor_kind: input.actorKind,
        actor_id: input.actorId ?? null,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        report_id: input.reportId ?? null,
        case_id: input.caseId ?? null,
        reason_code: input.reasonCode ? input.reasonCode.slice(0, REASON_MAX) : null,
        note: input.note ? input.note.slice(0, NOTE_MAX) : null,
        metadata: input.metadata ?? null,
        ip: input.ip ? input.ip.slice(0, IP_MAX) : null,
        at: nowIso(),
      },
      { transaction: tx ?? undefined },
    );
    return row.id;
  }

  /**
   * Erasure redaction 1 of 2 — see the file header. Called by
   * `purgeDeletedReports` in the transaction that destroys the reports.
   * Returns the number of rows redacted.
   */
  async redactForReport(tx: Transaction, reportIds: readonly string[]): Promise<number> {
    if (reportIds.length === 0) return 0;
    const [, affected] = await sequelize.query(
      `UPDATE audit_events
          SET note = NULL,
              metadata = jsonb_build_object('redacted', true, 'redactedAt', CAST(:now AS text)),
              updated_on = now()
        WHERE report_id IN (:reportIds)`,
      { replacements: { reportIds: [...reportIds], now: nowIso() }, transaction: tx },
    );
    return rowCount(affected);
  }

  /**
   * Erasure redaction 2 of 2 — see the file header. Called by account deletion
   * in its transaction. Returns the number of rows unlinked.
   */
  async nullMemberActor(tx: Transaction, memberId: string): Promise<number> {
    const [, affected] = await sequelize.query(
      `UPDATE audit_events
          SET actor_id = NULL, ip = NULL, updated_on = now()
        WHERE actor_kind = 'member' AND actor_id = :memberId`,
      { replacements: { memberId }, transaction: tx },
    );
    return rowCount(affected);
  }
}

/**
 * `sequelize.query` on Postgres resolves an UPDATE to `[rows, result]`, where
 * `result` is the pg driver's result object (with `rowCount`) — or, depending
 * on the query type, a bare number. Accept both rather than trust one shape.
 */
function rowCount(affected: unknown): number {
  if (typeof affected === "number") return affected;
  if (affected && typeof affected === "object" && "rowCount" in affected) {
    const count = (affected as { rowCount: unknown }).rowCount;
    return typeof count === "number" ? count : 0;
  }
  return 0;
}

export const auditService = new AuditService();
export default auditService;
