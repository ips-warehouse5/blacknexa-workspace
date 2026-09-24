/**
 * The report module — drafts, filing, projections, and the status machine.
 *
 * Four rules from the design are enforced here rather than trusted to a caller:
 *
 *   1. **Filing is a transaction.** C8: "There is no way to close this screen —
 *      nothing is half-filed." A report is created only when every attached file
 *      is sealed, and the row, its case reference, its first status event, its
 *      evidence re-parenting and — for a public or trusted report — the
 *      moderation run that will decide whether it is published are one commit.
 *
 *   2. **Location is rounded on write.** C4 lets someone publish an exact, an
 *      approximate or a hidden location. The rounded value is what gets stored in
 *      the servable columns, so a bug in a read path cannot leak a home address —
 *      the precise value never sits in a column a viewer projection reads.
 *
 *   3. **Anonymity is a projection.** C9: "Moderators can still see who filed it."
 *      `user_id` is never serialised; the author block is resolved to a name or the
 *      word "Anonymous" before it leaves this service.
 *
 *   4. **Every status change writes an event.** D2's timeline and B3's rows both
 *      read `report_status_events`, so a status that changed without a row would
 *      be invisible to the user in two places at once.
 *
 * ── Revision 2: pre-moderation (docs/INCIDENT_MODULE_PLAN.md §7.1–§7.4) ─────
 * Publication is its own axis (D1): `moderation_state`. A public or trusted
 * report is filed `pending` together with a queued `moderation_runs` row in the
 * same transaction (D13), and only the author and staff can see it until the
 * pipeline approves it. A private report is never sent to the AI (D3): it is
 * filed `approved` and no run is ever queued for it — `needsModeration()` guards
 * every enqueue point in this file.
 *
 *   • **Idempotent filing (D12).** The draft id is the idempotency key. The draft
 *     row is locked for the whole filing, re-posting a consumed draft answers
 *     with the report it became (200), and a concurrent duplicate that slips past
 *     the lock hits `uq_reports_source_draft` and is answered the same way —
 *     caught *outside* the rolled-back transaction.
 *   • **Edits (D19)** bump `content_version` in SQL under the row lock and send
 *     moderated content back to `pending` with a run: approved/held → `edited`,
 *     rejected → `resubmitted` (always a human; at most three), deactivated →
 *     refused. Verified and dismissed reports drop back to `under_review` through
 *     `transition()` in the *same* transaction.
 *   • **Reads** go through `report_visibility.ts`: a report is visible to anyone
 *     but its author only when it is approved (§3.2).
 *   • **PII (D14).** Filing and edits scrub title and body with the deterministic
 *     regex scrub only. The synchronous Node → AI toolkit call that used to sit
 *     on the filing path is gone.
 *   • **Notifications (D18)** are written inside the transaction with
 *     `notificationService.createInTx` and pushed only after it has committed.
 */

import crypto from "crypto";
import { Op, QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Report, ReportDraft, ReportEvidence, ReportStatusEvent } from "@/models/report.model";
import {
  ReportCorroboration,
  ReportFlag,
  ReportHide,
  ReportShareLink,
  ReportSupport,
} from "@/models/report_social.model";
import { AuditEvent } from "@/models/moderation.model";
import { AppUser } from "@/models/app_user.model";
import encryptionService from "@/services/encryption.service";
import evidenceStrengthService from "@/services/evidence_strength.service";
import evidenceService, { awaitsResubmissionCheck } from "@/services/evidence.service";
import notificationService, { type PendingPush } from "@/services/notification.service";
import moderationCaseService, { type ResolvedFlagRow } from "@/services/moderation_case.service";
import { cancelRunsForReport, enqueueRun, maxAttemptsFor } from "@/services/moderation_enqueue";
import { pokeModeration } from "@/services/moderation_signal";
import auditService from "@/services/audit.service";
import flagService, { AUTHOR_REMOVED, type FlagClosure } from "@/services/flag.service";
import { scrubReportText } from "@/services/report_scrub";
import {
  evidenceAccessFor,
  isReportOwner,
  isVisibleToMember,
  shareLinkDecision,
  shareLinkResolves,
  type Viewer,
} from "@/services/report_visibility";
import { isUniqueViolation, lockedTransaction, nextRefInTx } from "@/services/report_tx";
import {
  OWNER_TIMELINE_ACTIONS,
  buildOwnerTimeline,
  statusEventView,
} from "@/services/report_timeline";
import { HttpError, badRequest, forbidden, notFound } from "@/middlewares/error.middleware";
import type { LocationPrecision } from "@/types/user.interface";
import {
  MAX_RESUBMISSIONS,
  OWNER_NOTIFICATIONS,
  RUN_PRIORITY,
  dismissReasonLabel,
  displayStatusOf,
  isAuthorVisibleModerationState,
  needsModeration,
  ownerReasonLabel,
  resubmissionsLeft,
  type DisplayStatus,
  type OwnerModerationView,
  type ReportModerationState,
  type RunTrigger,
} from "@/types/moderation.interface";
import type {
  AuthorView,
  DraftPayload,
  EvidenceKind,
  EvidenceStrength,
  EvidenceView,
  LocationView,
  ModerationOutcome,
  ReportDetailView,
  ReportOwnerView,
  ReportStatus,
  TrustView,
} from "@/types/report.interface";

/**
 * How coarse each precision publishes.
 *
 * ~500 m for approximate is what C4's copy promises ("Approximate — about 500 m").
 * Exact still rounds to ~100 m: a report is a public document, and a metre-accurate
 * pin on a residential street identifies a household.
 */
const PRECISION_METRES: Record<LocationPrecision, number | null> = {
  exact: 100,
  approximate: 500,
  hidden: null,
};

/** Degrees of latitude per metre. Longitude is scaled by latitude at use. */
const DEG_PER_METRE = 1 / 111_320;

const TITLE_MAX = 70;
const EVENT_NOTE_MAX = 512;

/** C9's receipt. The first three fields are all the shipped client reads. */
export interface FilingReceipt {
  reportId: string;
  caseRef: string;
  filedAt: string;
  /** Additive (§7.4): what C9's stepper shows next. */
  moderationState: ReportModerationState;
  displayStatus: DisplayStatus;
}

export interface FilingResult {
  receipt: FilingReceipt;
  /** False when a consumed draft was re-posted and the existing report returned (D12). */
  created: boolean;
}

/** Who moved a report's status. `id` is an app-user id for `owner`, an admin id for `moderator`. */
export interface TransitionActor {
  kind: "moderator" | "system" | "owner";
  id: string | null;
}

interface TransitionBase {
  /** Shown on the owner's timeline (never on the trust sheet). */
  note?: string | null;
  /** Stored on the status event (e.g. a dismiss reason, §4.2). */
  reasonCode?: string | null;
  /**
   * Refuse with 409 unless the *locked* row is in one of these publication
   * states — e.g. Verify requires `approved` (§9.1).
   */
  requireModerationStates?: readonly ReportModerationState[];
}

/**
 * `transition()` options. With a `transaction` the caller owns the commit, so it
 * must also own the push list and dispatch it once the transaction resolves.
 */
export type TransitionOptions = TransitionBase &
  (
    | { transaction: Transaction; pendingPushes: PendingPush[] }
    | { transaction?: undefined; pendingPushes?: undefined }
  );

/** Thrown inside the filing transaction when the locked draft is already gone. */
class DraftConsumedError extends Error {
  constructor() {
    super("draft consumed");
    this.name = "DraftConsumedError";
  }
}

class ReportService {
  // ── Location ──────────────────────────────────────────────────────────────

  /**
   * Snap a coordinate to a grid whose cell is roughly `metres` across.
   *
   * A grid snap rather than random jitter, so the same place always publishes the
   * same point — jitter would let someone average repeated reports back toward the
   * true location.
   */
  private roundCoordinate(
    lat: number,
    lng: number,
    metres: number,
  ): { lat: number; lng: number } {
    const latStep = metres * DEG_PER_METRE;
    // Longitude degrees shrink toward the poles, so the step has to widen.
    const lngStep = latStep / Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    return {
      lat: Math.round(lat / latStep) * latStep,
      lng: Math.round(lng / lngStep) * lngStep,
    };
  }

  /** Short geohash, enough for a bounding-box "near me" without PostGIS. */
  private geohash(lat: number, lng: number, precision = 6): string {
    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    let minLat = -90;
    let maxLat = 90;
    let minLng = -180;
    let maxLng = 180;
    let hash = "";
    let bits = 0;
    let bit = 0;
    let even = true;

    while (hash.length < precision) {
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (lng >= mid) {
          bits = (bits << 1) + 1;
          minLng = mid;
        } else {
          bits <<= 1;
          maxLng = mid;
        }
      } else {
        const mid = (minLat + maxLat) / 2;
        if (lat >= mid) {
          bits = (bits << 1) + 1;
          minLat = mid;
        } else {
          bits <<= 1;
          maxLat = mid;
        }
      }
      even = !even;
      if (++bit === 5) {
        hash += BASE32[bits];
        bits = 0;
        bit = 0;
      }
    }
    return hash;
  }

  /** What a viewer is allowed to see of a report's location. */
  private locationView(report: Report): LocationView {
    return {
      precision: report.location_precision,
      label: report.location_label,
      // Hidden publishes an area label and nothing else — no coordinates at all.
      lat: report.location_precision === "hidden" ? null : report.lat,
      lng: report.location_precision === "hidden" ? null : report.lng,
      radiusMetres: PRECISION_METRES[report.location_precision as LocationPrecision],
    };
  }

  // ── Author ────────────────────────────────────────────────────────────────

  private initialsFrom(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  }

  /**
   * Resolve the author block.
   *
   * An anonymous report never carries a name or initials, and it never carries an
   * id either — so a client cannot correlate two anonymous reports back to one
   * person, which is the failure mode a bare `authorId` would quietly introduce.
   */
  async authorView(report: Report): Promise<AuthorView> {
    // No owner means the account was deleted and the report kept as record. It
    // presents exactly like any other anonymous report, which is the promise the
    // deletion screen made.
    if (report.anonymous || !report.user_id) {
      return { name: "Anonymous", initials: null, anonymous: true };
    }
    const owner = await AppUser.findByPk(report.user_id, {
      attributes: ["display_name", "email"],
    });
    const name = owner?.display_name?.trim() || "Anonymous";
    return {
      name,
      initials: this.initialsFrom(name),
      anonymous: name === "Anonymous",
    };
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  /**
   * Upsert the wizard's draft.
   *
   * Local-first: the app's own store is the source of the "Draft saved" timestamp
   * the C1–C7 header shows, and this is the sync target. So a failure here must
   * never surface as a blocked step, which is why the controller treats it as
   * best-effort.
   */
  async saveDraft(
    userId: string,
    draftId: string | undefined,
    step: number,
    payload: DraftPayload,
  ): Promise<{ draftId: string; updatedAt: string }> {
    const updatedAt = nowIso();

    if (draftId) {
      const existing = await ReportDraft.findOne({ where: { id: draftId, user_id: userId } });
      if (existing) {
        await existing.update({
          step,
          payload_json: payload as unknown as Record<string, unknown>,
          updated_at: updatedAt,
        });
        return { draftId: existing.id, updatedAt };
      }
    }

    const created = await ReportDraft.create({
      user_id: userId,
      step,
      payload_json: payload as unknown as Record<string, unknown>,
      updated_at: updatedAt,
    });
    return { draftId: created.id, updatedAt };
  }

  /** The Vault's draft list, and C10's resume path. */
  async listDrafts(userId: string): Promise<
    { id: string; step: number; payload: DraftPayload; updatedAt: string; evidenceCount: number }[]
  > {
    const drafts = await ReportDraft.findAll({
      where: { user_id: userId },
      order: [["updated_at", "DESC"]],
      limit: 20,
    });

    // C10's sheet names the file count ("2 files"), so it has to be real.
    const counts = await ReportEvidence.findAll({
      where: { draft_id: { [Op.in]: drafts.map((d) => d.id) } },
      attributes: ["draft_id"],
    });

    return drafts.map((draft) => ({
      id: draft.id,
      step: draft.step,
      payload: draft.payload_json as DraftPayload,
      updatedAt: draft.updated_at,
      evidenceCount: counts.filter((row) => row.draft_id === draft.id).length,
    }));
  }

  /**
   * C11 — discard.
   *
   * Deletes the draft, its evidence rows and the stored objects. C11 promises
   * "Everything you wrote and both attached files are deleted. This cannot be
   * undone", so this is a real delete rather than a status change.
   */
  async discardDraft(userId: string, draftId: string): Promise<boolean> {
    const draft = await ReportDraft.findOne({ where: { id: draftId, user_id: userId } });
    if (!draft) return false;

    const evidence = await ReportEvidence.findAll({ where: { draft_id: draftId } });
    for (const row of evidence) {
      // Sealed keys for a sealed file, upload keys (preview included) otherwise.
      await evidenceService.deleteObjectsOf(row);
    }
    await ReportEvidence.destroy({ where: { draft_id: draftId } });
    await draft.destroy();
    return true;
  }

  // ── Filing ────────────────────────────────────────────────────────────────

  /** Validate that a draft holds everything C1–C6 required before C7 can file. */
  private assertFileable(payload: DraftPayload): void {
    const missing: string[] = [];
    if (!payload.category) missing.push("a category");
    if (!payload.title?.trim()) missing.push("a title");
    if (!payload.body?.trim()) missing.push("what happened");
    if (!payload.occurredAt) missing.push("when it happened");
    if (missing.length > 0) {
      // Named rather than generic, so the wizard can jump to the right step.
      throw badRequest(`This report still needs ${missing.join(", ")}.`);
    }
  }

  /** The report a draft became, if it has been filed (D12). */
  private async findFiledFromDraft(userId: string, draftId: string): Promise<Report | null> {
    return Report.findOne({ where: { source_draft_id: draftId, user_id: userId } });
  }

  private filingReceipt(report: Report, created: boolean): FilingResult {
    return {
      receipt: {
        reportId: report.id,
        caseRef: report.case_ref,
        filedAt: report.filed_at,
        moderationState: report.moderation_state,
        displayStatus: displayStatusOf({
          moderationState: report.moderation_state,
          status: report.status,
          visibility: report.visibility,
        }),
      },
      created,
    };
  }

  /** Seal a string with the server key, or keep it plain (recorded honestly). */
  private async sealBody(body: string): Promise<{ body: string; encrypted: boolean }> {
    try {
      return {
        body: encryptionService.serialize(await encryptionService.serverSeal(body)),
        encrypted: true,
      };
    } catch (err) {
      // Best-effort by design: losing a reporter's account of what happened is a
      // worse outcome than storing it with one fewer defensive layer.
      logger.warn("[reports] body seal failed, storing plaintext", {
        message: err instanceof Error ? err.message : String(err),
      });
      return { body, encrypted: false };
    }
  }

  /**
   * C7 → C8 → C9. File a draft as a report (§7.1).
   *
   * Refuses unless every attached file is sealed. C8's checklist shows sealing
   * completing before "Filing the report" starts, so an unsealed file here means
   * the client got ahead of itself and the honest answer is a 409 naming the rows.
   *
   * Re-posting a draft that was already filed returns that report with
   * `created: false` (the controller answers 200) — a lost response or a double
   * tap is not a second report.
   */
  async fileReport(userId: string, draftId: string, attested: boolean): Promise<FilingResult> {
    if (!attested) {
      // C7's checkbox. Without it there is no attestation to record.
      throw badRequest("Confirm the report is true to the best of your knowledge.");
    }

    // D12: a consumed draft answers with the report it became.
    const alreadyFiled = await this.findFiledFromDraft(userId, draftId);
    if (alreadyFiled) return this.filingReceipt(alreadyFiled, false);

    // Cheap refusals before any lock or crypto work.
    const preview = await ReportDraft.findOne({ where: { id: draftId, user_id: userId } });
    if (!preview) throw notFound("That draft no longer exists.");
    this.assertFileable(preview.payload_json as DraftPayload);

    const owner = await AppUser.findByPk(userId);
    if (!owner || owner.status !== "active") throw forbidden("This account cannot file reports.");

    let filed: { report: Report; runQueued: boolean; files: number };
    try {
      filed = await lockedTransaction(async (transaction) => {
        // The same row presign and commit lock, so no file can be attached,
        // sealed or removed while this draft is being filed (§7.1, §7.9).
        const draft = await ReportDraft.findOne({
          where: { id: draftId, user_id: userId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!draft) throw new DraftConsumedError();

        // Everything below reads the *locked* payload, not the preview.
        const payload = draft.payload_json as DraftPayload;
        this.assertFileable(payload);

        const evidence = await ReportEvidence.findAll({ where: { draft_id: draftId }, transaction });
        const unsealed = evidence.filter((row) => row.upload_state !== "sealed");
        if (unsealed.length > 0) {
          throw new HttpError(
            `${unsealed.length} file${unsealed.length === 1 ? "" : "s"} ${
              unsealed.length === 1 ? "has" : "have"
            } not finished sealing. Nothing has been filed.`,
            409,
          );
        }

        const filedAt = nowIso();

        // ── Text: regex scrub (D14), then seal the body ──────────────────
        const title = scrubReportText(payload.title!.trim());
        const scrubbedBody = scrubReportText(payload.body!.trim());
        const sealed = await this.sealBody(scrubbedBody.text);

        // ── Location: round on write ──────────────────────────────────────
        const precision: LocationPrecision = payload.locationPrecision ?? owner.default_precision;
        let lat: number | null = null;
        let lng: number | null = null;
        let geohash: string | null = null;
        let exactSealed: string | null = null;

        if (typeof payload.lat === "number" && typeof payload.lng === "number") {
          const metres = PRECISION_METRES[precision];
          if (metres !== null) {
            const rounded = this.roundCoordinate(payload.lat, payload.lng, metres);
            lat = rounded.lat;
            lng = rounded.lng;
            geohash = this.geohash(rounded.lat, rounded.lng);
          }
          // The exact value is kept sealed for the owner and moderators, whatever
          // the published precision — including `hidden`, where nothing is published.
          try {
            exactSealed = encryptionService.serialize(
              await encryptionService.serverSeal(JSON.stringify({ lat: payload.lat, lng: payload.lng })),
            );
          } catch {
            // Better to lose the precise copy than to store it in the clear.
            exactSealed = null;
          }
        }

        const strength = evidenceStrengthService.evaluate({
          evidence: evidence.map((row) => ({
            kind: row.kind,
            capturedAt: row.captured_at,
            deviceId: null,
          })),
          occurredAt: payload.occurredAt!,
          corroborationCount: 0,
          corroboratedWithEvidence: false,
        });

        const visibility = payload.visibility ?? owner.default_visibility;
        const urgent = payload.urgent ?? false;
        // D3: the one predicate. A private report is approved at filing and
        // never reaches the AI; everything else waits for the pipeline.
        const moderated = needsModeration({ visibility });
        const caseRef = await nextRefInTx(transaction, "case");

        const report = await Report.create(
          {
            case_ref: caseRef,
            user_id: userId,
            title: title.text.slice(0, TITLE_MAX),
            body: sealed.body,
            category: payload.category!,
            occurred_at: payload.occurredAt!,
            occurred_precision: payload.occurredPrecision ?? "exact",
            occurred_day_part: payload.occurredDayPart ?? null,
            filed_at: filedAt,
            location_precision: precision,
            location_label: payload.locationLabel?.trim() || null,
            lat,
            lng,
            geohash,
            location_exact_sealed: exactSealed,
            visibility,
            anonymous: payload.anonymous ?? owner.anonymous_by_default,
            urgent,
            status: "submitted",
            evidence_strength: strength.strength,
            pii_scrubbed: title.redactedCount + scrubbedBody.redactedCount > 0,
            body_encrypted: sealed.encrypted,
            // Written explicitly on both paths — never the column default (§4.1).
            moderation_state: moderated ? "pending" : "approved",
            content_version: 1,
            // A private report is "published" to its only reader at filing.
            published_at: moderated ? null : filedAt,
            approved_content_version: moderated ? null : 1,
            source_draft_id: draftId,
          },
          { transaction },
        );

        // Re-parent the (all sealed) evidence. Non-owners see only approved
        // files (D22), so a moderated report's files wait for the pipeline too.
        // A private report's files are approved whole (only its owner and staff
        // see them); a pending file has no scope until an approval names one (R5).
        await ReportEvidence.update(
          {
            report_id: report.id,
            draft_id: null,
            moderation_state: moderated ? "pending" : "approved",
            approved_scope: moderated ? null : "full",
          },
          { where: { draft_id: draftId, upload_state: "sealed" }, transaction },
        );

        // The first timeline node, and what C9's stepper reads.
        await ReportStatusEvent.create(
          {
            report_id: report.id,
            status: "submitted",
            actor_kind: "owner",
            actor_id: userId,
            at: filedAt,
          },
          { transaction },
        );

        // D13: the run is written with the report, so a pending report can never
        // exist without the run that will decide it.
        if (moderated) {
          await enqueueRun(transaction, {
            targetType: "report",
            targetId: report.id,
            reportId: report.id,
            contentVersion: 1,
            trigger: "filed",
            priority: urgent ? RUN_PRIORITY.urgent : RUN_PRIORITY.normal,
            maxAttempts: maxAttemptsFor(urgent),
          });
        }

        await auditService.record(transaction, {
          actorKind: "member",
          actorId: userId,
          action: "report.file",
          targetType: "report",
          targetId: report.id,
          reportId: report.id,
          metadata: {
            after: { moderationState: report.moderation_state, status: "submitted" },
            visibility,
            urgent,
            files: evidence.length,
            contentVersion: 1,
          },
        });

        await ReportDraft.destroy({ where: { id: draftId }, transaction });
        return { report, runQueued: moderated, files: evidence.length };
      });
    } catch (err) {
      // Outside the transaction, which has rolled back: a concurrent filing of
      // the same draft won, and its report is the answer (§7.1).
      if (err instanceof DraftConsumedError || isUniqueViolation(err, "uq_reports_source_draft")) {
        const winner = await this.findFiledFromDraft(userId, draftId);
        if (winner) return this.filingReceipt(winner, false);
        throw notFound("That draft no longer exists.");
      }
      throw err;
    }

    // Only after the commit: a poke inside the transaction would let the worker
    // look before the run is visible.
    if (filed.runQueued) pokeModeration();

    logger.info("[reports] filed", {
      reportId: filed.report.id,
      caseRef: filed.report.case_ref,
      moderationState: filed.report.moderation_state,
      urgent: filed.report.urgent,
      files: filed.files,
    });

    return this.filingReceipt(filed.report, true);
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  /** Open the sealed body for display. Falls back to the stored value. */
  private async openBody(report: Report): Promise<string> {
    if (!report.body_encrypted) return report.body;
    const sealed = encryptionService.deserialize(report.body);
    if (!sealed) return report.body;
    return (await encryptionService.serverOpen(sealed)) ?? report.body;
  }

  /** Look a report up by id or by its `BNX-####` reference. */
  async findByIdOrRef(idOrRef: string): Promise<Report | null> {
    const isRef = /^BNX-/i.test(idOrRef);
    if (isRef) return Report.findOne({ where: { case_ref: idOrRef.toUpperCase() } });
    // Anything else must be a UUID; a malformed id is "not found", not a 500
    // from Postgres refusing to cast it.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef)) return null;
    return Report.findByPk(idOrRef);
  }

  /**
   * Whether `viewer` may read this report at all — §3.2, via the one helper in
   * `report_visibility.ts`: the author always; anyone else only when it is not
   * deleted, is **approved**, and its visibility admits them (`trusted` is
   * advocate-only; `private` is the owner alone). A caller who fails this gets a
   * 404 rather than a 403, because a 403 confirms the report exists.
   *
   * There is no moderator branch here on purpose. Moderators are operator accounts
   * and read through `/admin/*`, which has its own projection. `optionalAuth` only
   * accepts member tokens, so an operator token cannot reach this check either.
   */
  canRead(report: Report, viewer: Viewer): boolean {
    if (isReportOwner(report, viewer)) return true;
    return isVisibleToMember(report, viewer);
  }

  /** D1 — the community viewer's projection. */
  async detailView(
    report: Report,
    viewer: Viewer,
    options: { ownerProjection?: boolean } = {},
  ): Promise<ReportDetailView> {
    const owner = options.ownerProjection === true || isReportOwner(report, viewer);
    const signedInOther = viewer.id !== null && !owner;

    const [author, evidence, standing, corroborated, flagged] = await Promise.all([
      this.authorView(report),
      evidenceService.listForReport(report.id, { owner }),
      viewer.id
        ? ReportSupport.count({ where: { report_id: report.id, user_id: viewer.id } })
        : Promise.resolve(0),
      viewer.id
        ? ReportCorroboration.count({ where: { report_id: report.id, user_id: viewer.id } })
        : Promise.resolve(0),
      // "You flagged this" (§7.4): the caller's open flag on the report itself.
      signedInOther
        ? ReportFlag.count({
            where: { report_id: report.id, comment_id: null, reporter_id: viewer.id, status: "open" },
          })
        : Promise.resolve(0),
    ]);

    return {
      id: report.id,
      caseRef: report.case_ref,
      title: report.title,
      body: await this.openBody(report),
      category: report.category,
      status: report.status,
      urgent: report.urgent,
      visibility: report.visibility,
      occurredAt: report.occurred_at,
      occurredPrecision: report.occurred_precision,
      occurredDayPart: report.occurred_day_part,
      filedAt: report.filed_at,
      author,
      location: this.locationView(report),
      evidence,
      supportCount: report.support_count,
      commentCount: report.comment_count,
      corroborationCount: report.corroboration_count,
      evidenceStrength: report.evidence_strength,
      standingWith: standing > 0,
      corroborated: corroborated > 0,
      isOwner: owner,
      flaggedByMe: flagged > 0,
    };
  }

  /**
   * The owner's view of the publication axis (§7.4). A reason and note only for
   * `rejected` and `deactivated` — hold reasons are staff-only (§3.2). A
   * rejected report also says how many resubmissions are left, so D2 hides
   * *Edit and resubmit* once the next attempt would be refused (§10, D19).
   */
  ownerModeration(report: Report): OwnerModerationView {
    const state = report.moderation_state;
    const view: OwnerModerationView = {
      state,
      displayStatus: displayStatusOf({
        moderationState: state,
        status: report.status,
        visibility: report.visibility,
      }),
      at: this.moderationAt(report),
    };
    if (isAuthorVisibleModerationState(state)) {
      view.reasonCode = report.moderation_reason ?? null;
      view.reasonLabel = ownerReasonLabel(state, report.moderation_reason);
      view.note = report.moderation_note ?? null;
    }
    // Only a moderated report counts resubmissions (`updateReport`); a private
    // one is never rejected by the pipeline, so it has nothing to say here.
    if (state === "rejected" && needsModeration(report)) {
      view.resubmissionsLeft = resubmissionsLeft(report.resubmission_count);
    }
    return view;
  }

  /** When the current publication state was reached. */
  private moderationAt(report: Report): string | null {
    if (report.moderation_state === "pending") return report.last_edited_at ?? report.filed_at;
    if (report.moderated_at) return report.moderated_at;
    // Approved without a decision: a private report, or one filed before revision 2.
    return report.moderation_state === "approved" ? report.published_at ?? report.filed_at : null;
  }

  /** D2 — the owner's projection, which is a separate screen, not a variant. */
  async ownerView(report: Report): Promise<ReportOwnerView> {
    const ownerViewer: Viewer = { id: report.user_id, role: null };
    const [base, events, audits] = await Promise.all([
      this.detailView(report, ownerViewer, { ownerProjection: true }),
      ReportStatusEvent.findAll({
        where: { report_id: report.id },
        order: [["at", "ASC"]],
      }),
      // Owner-safe moderation events are derived from the audit log (§7.4). The
      // internal `note` column is deliberately not selected.
      AuditEvent.findAll({
        where: {
          report_id: report.id,
          target_type: "report",
          action: { [Op.in]: [...OWNER_TIMELINE_ACTIONS] },
        },
        attributes: ["action", "actor_kind", "actor_id", "reason_code", "metadata", "at"],
        order: [["at", "ASC"]],
      }),
    ]);

    let exactLat: number | null = null;
    let exactLng: number | null = null;
    if (report.location_exact_sealed) {
      const sealed = encryptionService.deserialize(report.location_exact_sealed);
      if (sealed) {
        const opened = await encryptionService.serverOpen(sealed);
        if (opened) {
          try {
            const parsed = JSON.parse(opened) as { lat: number; lng: number };
            exactLat = parsed.lat;
            exactLng = parsed.lng;
          } catch {
            /* a corrupt envelope is treated as absent */
          }
        }
      }
    }

    // `timeline` stays case-status events only — what the shipped D2 renders;
    // the moderation nodes travel in the additive `moderationTimeline` (R14).
    const { timeline, moderationTimeline, moderatorIds } = buildOwnerTimeline({
      moderated: needsModeration(report),
      statusEvents: events,
      auditEvents: audits,
    });

    return {
      ...base,
      timeline,
      moderationTimeline,
      viewCount: report.view_count,
      // D2 shows how many moderators have seen it. Derived from who acted.
      moderatorCount: moderatorIds.size,
      // Nothing until a dispatch happens — D2's "Outside organisations: None".
      dispatchedTo: [],
      // D2: "Because this report is verified, you can dispatch it…"
      canDispatch: report.status === "verified",
      exactLat,
      exactLng,
      moderation: this.ownerModeration(report),
    };
  }

  /**
   * D3 — the trust sheet. Readable by anyone who can read the report, so it
   * carries **no notes** (§7.3): a status-event note is written for the author,
   * and a moderator's words are not for every reader. Files a non-owner may not
   * know about (a rejected file, a failed upload) are not listed.
   */
  async trustView(report: Report, viewer: Viewer): Promise<TrustView> {
    const owner = isReportOwner(report, viewer);
    const [evidence, events, corroborations] = await Promise.all([
      ReportEvidence.findAll({ where: { report_id: report.id }, order: [["sort_order", "ASC"]] }),
      ReportStatusEvent.findAll({ where: { report_id: report.id }, order: [["at", "ASC"]] }),
      ReportCorroboration.findAll({ where: { report_id: report.id } }),
    ]);

    const strength = evidenceStrengthService.evaluate({
      evidence: evidence.map((row) => ({
        kind: row.kind,
        capturedAt: row.captured_at,
        deviceId: null,
      })),
      occurredAt: report.occurred_at,
      corroborationCount: corroborations.length,
      corroboratedWithEvidence: corroborations.some((row) => row.has_evidence),
    });

    const verifiedEvent = events.find((event) => event.status === "verified");

    return {
      verifiedAt: verifiedEvent?.at ?? null,
      verifiedBy: verifiedEvent?.actor_kind === "moderator" ? "a moderator" : null,
      files: evidence
        .filter((row) => evidenceAccessFor(row, owner) !== "hidden")
        .map((row) => ({
          id: row.id,
          label: evidenceService.describe(row),
          // "Unchanged" means we have a hash and the file is sealed against it.
          unchanged: Boolean(row.sha256) && row.upload_state === "sealed",
        })),
      provenance: events.map((event) => statusEventView(event, { withNote: false })),
      strength: strength.strength,
      rationale: strength.rationale,
    };
  }

  // ── Status machine ────────────────────────────────────────────────────────

  /** Legal transitions. Anything absent here is refused rather than logged. */
  private static readonly TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
    draft: ["submitted"],
    /*
     * `submitted → verified` is allowed, not just `submitted → under_review`.
     *
     * C9's stepper draws three stops, which is what the *owner* is shown, but it
     * does not follow that the machine must be walked one stop at a time. A
     * moderator who has read the report and opened its files has reviewed it —
     * making them record "reviewing" first and "verified" second adds no
     * information, and the queue offers all three decisions on one row, so a map
     * that refused two of them would be a UI offering actions the API rejects.
     *
     * `under_review` keeps its meaning as a real state: a moderator has this open
     * and is not finished with it. The timeline then says what actually happened —
     * filed, then verified — rather than a synthetic intermediate stamped at the
     * same second.
     */
    submitted: ["under_review", "verified", "dismissed"],
    under_review: ["verified", "dismissed"],
    // An owner edit re-opens a decided report (D19); Reopen moves dismissed back (D20).
    verified: ["under_review"],
    dismissed: ["under_review"],
  };

  /**
   * Move a report's status, writing the event and notifying the owner (§7.2).
   *
   * With `options.transaction` it runs inside the caller's transaction — it never
   * opens a nested one — and appends the owner's push to `options.pendingPushes`
   * for the caller to dispatch after its commit. Without one it opens its own
   * locked transaction and dispatches the push itself.
   *
   * Either way the report is **re-read `FOR UPDATE`**, and the allowed move and
   * every precondition are checked on the locked row, never on the caller's
   * possibly stale instance. Returns the locked, updated row.
   *
   * A bare string is still accepted as the note, for the pre-revision-2 callers.
   */
  async transition(
    report: Report,
    next: ModerationOutcome,
    actor: TransitionActor,
    options?: string | TransitionOptions,
  ): Promise<Report> {
    const opts: TransitionOptions =
      typeof options === "string" ? { note: options } : (options ?? {});

    if (opts.transaction) {
      return this.transitionLocked(opts.transaction, report.id, next, actor, opts, opts.pendingPushes);
    }

    const pendingPushes: PendingPush[] = [];
    const updated = await lockedTransaction((transaction) =>
      this.transitionLocked(transaction, report.id, next, actor, opts, pendingPushes),
    );
    notificationService.dispatchPushes(pendingPushes);
    return updated;
  }

  private async transitionLocked(
    transaction: Transaction,
    reportId: string,
    next: ModerationOutcome,
    actor: TransitionActor,
    opts: TransitionBase,
    pendingPushes: PendingPush[],
  ): Promise<Report> {
    const locked = await Report.findByPk(reportId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked || locked.deleted_at) throw notFound("That report is not available.");

    if (
      opts.requireModerationStates &&
      !opts.requireModerationStates.includes(locked.moderation_state)
    ) {
      throw new HttpError(
        "This report's publication has to be resolved before its case can change.",
        409,
      );
    }

    const from = locked.status as ReportStatus;
    const allowed = ReportService.TRANSITIONS[from] ?? [];
    if (!allowed.includes(next)) {
      throw badRequest(`A ${from} report cannot become ${next}.`);
    }

    const at = nowIso();
    await locked.update(
      { status: next, verified_at: next === "verified" ? at : locked.verified_at },
      { transaction },
    );
    await ReportStatusEvent.create(
      {
        report_id: locked.id,
        status: next,
        actor_kind: actor.kind,
        actor_id: actor.id,
        note: opts.note ? opts.note.slice(0, EVENT_NOTE_MAX) : null,
        reason_code: opts.reasonCode ?? null,
        at,
      },
      { transaction },
    );

    // A severed report can still change status — there is simply nobody to tell.
    if (locked.user_id) {
      const copy = statusNotification(from, next, actor.kind, opts.reasonCode ?? null);
      await notificationService.createInTx(
        transaction,
        {
          userId: locked.user_id,
          type: "status_change",
          title: copy.title,
          body: copy.body,
          link: `/r/${locked.case_ref}`,
          reportId: locked.id,
        },
        pendingPushes,
      );
    }

    logger.info("[reports] status changed", {
      reportId: locked.id,
      from,
      to: next,
      actor: actor.kind,
    });
    return locked;
  }

  // ── Owner actions ─────────────────────────────────────────────────────────

  /**
   * D2's edit — §7.2, D19. Title and body only; sealed evidence is append-only.
   *
   * One transaction: lock the report, check the D19 rules on the locked row,
   * scrub (D14), write, bump `content_version` in SQL, change publication state,
   * upsert the run, and — for a verified or dismissed report — move it back to
   * `under_review` through `transition()` in the same transaction.
   *
   *   approved / held   → pending + `edited` run (priority 50 if it was live)
   *   rejected          → pending + `resubmitted` run, `resubmission_count + 1`;
   *                       a fourth resubmission is refused (409 "Contact support")
   *   pending           → stays pending; the queued run takes the new version
   *   deactivated       → refused (409) — only Reactivate leaves it (D10)
   *   private           → stays approved; no run, ever (D3)
   *
   * Returns the updated report.
   */
  async updateReport(
    report: Report,
    actorId: string,
    patch: { title?: string; body?: string },
  ): Promise<Report> {
    const pendingPushes: PendingPush[] = [];

    const outcome = await lockedTransaction(async (transaction) => {
      const locked = await Report.findByPk(report.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked || locked.deleted_at) throw notFound("That report is not available.");
      if (locked.user_id !== actorId) throw forbidden("That is not your report.");

      const before = locked.moderation_state;
      if (before === "deactivated") {
        throw new HttpError(
          "This report was taken down, so it can't be edited. Contact support if you think that is a mistake.",
          409,
        );
      }

      const moderated = needsModeration(locked);
      let trigger: RunTrigger | null = null;
      let priority: number = RUN_PRIORITY.normal;
      let resubmission = false;

      if (moderated) {
        if (before === "rejected") {
          if (locked.resubmission_count >= MAX_RESUBMISSIONS) {
            throw new HttpError(
              "This report has been resubmitted the most times allowed. Contact support to have it looked at again.",
              409,
            );
          }
          trigger = "resubmitted";
          resubmission = true;
        } else if (await awaitsResubmissionCheck(transaction, locked)) {
          // D19: still waiting for the human check the last resubmission
          // promised, so a further edit stays `resubmitted` — an `edited` run
          // could be approved by the AI alone and undo a moderator's rejection.
          // The same query guards late evidence (evidence.service.ts, R1).
          trigger = "resubmitted";
        } else {
          trigger = "edited";
          if (before === "approved") priority = RUN_PRIORITY.editedApproved;
        }
        if (locked.urgent) priority = Math.max(priority, RUN_PRIORITY.urgent);
      }

      // ── Write the new text (scrubbed, body sealed) ────────────────────────
      const updates: Record<string, unknown> = {};
      let redacted = 0;
      if (patch.title !== undefined) {
        const title = scrubReportText(patch.title.trim());
        updates.title = title.text.slice(0, TITLE_MAX);
        redacted += title.redactedCount;
      }
      if (patch.body !== undefined) {
        const body = scrubReportText(patch.body.trim());
        const sealed = await this.sealBody(body.text);
        updates.body = sealed.body;
        updates.body_encrypted = sealed.encrypted;
        redacted += body.redactedCount;
      }
      if (Object.keys(updates).length === 0) return null;

      const editedAt = nowIso();
      await locked.update(
        {
          ...updates,
          last_edited_at: editedAt,
          pii_scrubbed: locked.pii_scrubbed || redacted > 0,
          ...(moderated ? { moderation_state: "pending" as const } : {}),
          ...(resubmission
            ? {
                resubmission_count: locked.resubmission_count + 1,
                // The rejection's author-visible reason belongs to the version
                // that was rejected; the case keeps it for moderators.
                moderation_reason: null,
                moderation_note: null,
              }
            : {}),
        },
        { transaction },
      );

      // In SQL, under the row lock: the version the run and every later
      // decision are fenced on (§5.3).
      const bumped = await sequelize.query<{ content_version: number }>(
        `UPDATE reports SET content_version = content_version + 1, updated_on = now()
          WHERE id = :id
          RETURNING content_version`,
        { replacements: { id: locked.id }, type: QueryTypes.SELECT, transaction },
      );
      const contentVersion = Number(bumped[0]?.content_version);
      if (!Number.isFinite(contentVersion)) throw new Error("content_version bump returned no row");

      if (trigger) {
        await enqueueRun(transaction, {
          targetType: "report",
          targetId: locked.id,
          reportId: locked.id,
          contentVersion,
          trigger,
          priority,
          maxAttempts: maxAttemptsFor(locked.urgent),
        });
      }

      // The existing machine: an edit re-opens a decided case (D19).
      if (locked.status === "verified" || locked.status === "dismissed") {
        await this.transition(
          locked,
          "under_review",
          { kind: "owner", id: actorId },
          { note: "Edited by the author", transaction, pendingPushes },
        );
      }

      await auditService.record(transaction, {
        actorKind: "member",
        actorId,
        action: resubmission ? "report.resubmit" : "report.edit",
        targetType: "report",
        targetId: locked.id,
        reportId: locked.id,
        metadata: {
          before: { moderationState: before },
          after: { moderationState: moderated ? "pending" : before },
          contentVersion,
          fields: Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined),
          trigger,
        },
      });

      return { runQueued: trigger !== null, contentVersion, trigger };
    });

    notificationService.dispatchPushes(pendingPushes);
    if (outcome?.runQueued) pokeModeration();
    if (outcome) {
      logger.info("[reports] edited", {
        reportId: report.id,
        contentVersion: outcome.contentVersion,
        trigger: outcome.trigger,
      });
    }

    const reloaded = await Report.findByPk(report.id);
    if (!reloaded) throw notFound("That report is not available.");
    return reloaded;
  }

  /**
   * Withdraw every piece of moderation work about a report that is going away
   * (owner delete, account erasure — §5.4, §7.8): its comments' open cases and
   * flags, its own open case and flags, and every queued run for it and its
   * comments. Returns the resolved flags so the caller can email the reporters
   * once its transaction has committed. Call with the report row locked.
   */
  async closeModerationForRemovedReport(
    transaction: Transaction,
    reportId: string,
    closure: FlagClosure = AUTHOR_REMOVED,
  ): Promise<ResolvedFlagRow[]> {
    const resolved: ResolvedFlagRow[] = [];

    // Comments first: an open case or open flag on any comment of this report.
    const commentTargets = await sequelize.query<{ target_id: string }>(
      `SELECT target_id FROM moderation_cases
        WHERE report_id = :reportId AND target_type = 'comment' AND state = 'open'
       UNION
       SELECT f.comment_id AS target_id
         FROM report_flags f
         JOIN report_comments c ON c.id = f.comment_id
        WHERE c.report_id = :reportId AND f.status = 'open'`,
      { replacements: { reportId }, type: QueryTypes.SELECT, transaction },
    );
    for (const { target_id: commentId } of commentTargets) {
      const closed = await moderationCaseService.closeForTarget(transaction, {
        targetType: "comment",
        targetId: commentId,
        resolution: "withdrawn",
        flagOutcome: closure.outcome,
      });
      resolved.push(...closed.flags);
    }

    const own = await moderationCaseService.closeForTarget(transaction, {
      targetType: "report",
      targetId: reportId,
      resolution: "withdrawn",
      flagOutcome: closure.outcome,
    });
    resolved.push(...own.flags);

    // Comment runs carry their report's id; one statement withdraws them all.
    await cancelRunsForReport(transaction, reportId);
    return resolved;
  }

  /**
   * D2's delete.
   *
   * "Deleting removes it from the feed and from your Vault. Sealed files are
   * destroyed after 30 days." So the row leaves every read path now, and the
   * objects are scheduled — the window exists so an accidental deletion or a
   * moderation dispute can still be resolved. Its moderation work is withdrawn
   * in the same transaction (§7.8) and flaggers are told after it commits.
   */
  async deleteReport(report: Report, actorId: string): Promise<void> {
    const purgeAfter = new Date(
      Date.now() + env.reports.evidenceRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const flags = await lockedTransaction(async (transaction) => {
      const locked = await Report.findByPk(report.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked) throw notFound("That report is not available.");
      if (locked.user_id !== actorId) throw forbidden("That is not your report.");
      // Already deleted: the promise has been kept, nothing more to do.
      if (locked.deleted_at) return [] as ResolvedFlagRow[];

      await locked.update({ deleted_at: nowIso() }, { transaction });
      await ReportEvidence.update(
        { purge_after: purgeAfter },
        { where: { report_id: locked.id }, transaction },
      );
      const resolved = await this.closeModerationForRemovedReport(transaction, locked.id);

      await auditService.record(transaction, {
        actorKind: "member",
        actorId,
        action: "report.delete",
        targetType: "report",
        targetId: locked.id,
        reportId: locked.id,
        metadata: { before: { moderationState: locked.moderation_state }, flagsResolved: resolved.length },
      });
      return resolved;
    });

    flagService.notifyReporters(flags, AUTHOR_REMOVED.mail);

    logger.info("[reports] deleted, evidence scheduled for purge", {
      reportId: report.id,
      purgeAfter,
    });
  }

  // ── Social ────────────────────────────────────────────────────────────────

  /** D1's "Stand with". Idempotent — a unique pair, toggled. */
  async toggleSupport(report: Report, userId: string): Promise<{ standing: boolean; count: number }> {
    const existing = await ReportSupport.findOne({
      where: { report_id: report.id, user_id: userId },
    });

    await sequelize.transaction(async (transaction) => {
      if (existing) {
        await existing.destroy({ transaction });
        await report.decrement("support_count", { by: 1, transaction });
      } else {
        await ReportSupport.create(
          { report_id: report.id, user_id: userId, at: nowIso() },
          { transaction },
        );
        await report.increment("support_count", { by: 1, transaction });
      }
    });

    await report.reload();
    return { standing: !existing, count: report.support_count };
  }

  /**
   * "It happened to me too."
   *
   * Not a toggle: withdrawing a corroboration would silently weaken a report's
   * evidence strength, and the design offers no affordance for it. Repeating it is
   * a no-op instead.
   *
   * The owner's notification is written in the transaction and pushed after it
   * commits (§7.7). Its body is the report's title — approved text, since only a
   * published report can be corroborated by someone else — and never the
   * corroborator's note, which nobody has moderated.
   */
  async corroborate(
    report: Report,
    userId: string,
    note: string | undefined,
  ): Promise<{ count: number }> {
    if (userId === report.user_id) {
      throw badRequest("You cannot corroborate your own report.");
    }

    const pendingPushes: PendingPush[] = [];
    const outcome = await lockedTransaction(async (transaction) => {
      // Locked, so the existence check and the insert cannot race a double tap.
      const locked = await Report.findByPk(report.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!locked || locked.deleted_at || locked.moderation_state !== "approved") {
        throw notFound("That report is not available.");
      }

      const existing = await ReportCorroboration.findOne({
        where: { report_id: locked.id, user_id: userId },
        transaction,
      });
      if (existing) return { created: false };

      await ReportCorroboration.create(
        { report_id: locked.id, user_id: userId, note: note?.trim() || null, at: nowIso() },
        { transaction },
      );
      await locked.increment("corroboration_count", { by: 1, transaction });
      if (locked.user_id) {
        await notificationService.createInTx(
          transaction,
          {
            userId: locked.user_id,
            type: "corroboration_or_reply",
            title: "Someone said it happened to them too",
            body: locked.title,
            link: `/r/${locked.case_ref}`,
            reportId: locked.id,
          },
          pendingPushes,
        );
      }
      return { created: true };
    });

    notificationService.dispatchPushes(pendingPushes);
    await report.reload();
    // Corroboration feeds the strength score, so it is recomputed here rather
    // than drifting until the next read.
    if (outcome.created) await this.refreshStrength(report);
    return { count: report.corroboration_count };
  }

  /** Recompute and persist strength after something that feeds it changes. */
  async refreshStrength(report: Report): Promise<void> {
    const [evidence, corroborations] = await Promise.all([
      ReportEvidence.findAll({ where: { report_id: report.id } }),
      ReportCorroboration.findAll({ where: { report_id: report.id } }),
    ]);
    const result = evidenceStrengthService.evaluate({
      evidence: evidence.map((row) => ({
        kind: row.kind,
        capturedAt: row.captured_at,
        deviceId: null,
      })),
      occurredAt: report.occurred_at,
      corroborationCount: corroborations.length,
      corroboratedWithEvidence: corroborations.some((row) => row.has_evidence),
    });
    if (result.strength !== report.evidence_strength) {
      await report.update({ evidence_strength: result.strength });
    }
  }

  /** D9's "Hide this report from my feed" — offered, never assumed. */
  async hideFromFeed(reportId: string, userId: string): Promise<void> {
    await ReportHide.findOrCreate({
      where: { report_id: reportId, user_id: userId },
      defaults: { report_id: reportId, user_id: userId, at: nowIso() },
    });
  }

  /** Roll a view into the daily counter. Never one row per view. */
  async recordView(report: Report, viewerId: string | null): Promise<void> {
    // The owner reading their own report is not a view; D2 shows this count as
    // "who has seen this", and counting yourself makes it a lie.
    if (viewerId && viewerId === report.user_id) return;
    await report.increment("view_count", { by: 1 });
  }

  /**
   * D10 — the link `POST /reports/:id/share-link` hands back (review R11).
   *
   *   • the author of a published, non-private report → a minted `?t=` token
   *     (`minted: true`, 201);
   *   • any other reader of a published *public* report → the plain
   *     `/r/<caseRef>` URL: no token, no row (`minted: false`, 200). The page
   *     already serves a public report to anyone, and the shipped D1 sheet asks
   *     for a link the moment a viewer opens Share — refusing them protected
   *     nothing and broke Share for everyone but the author;
   *   • a non-owner of a Trusted-Circle report → 403 (a token would expose it to
   *     anyone); private or unpublished → 409.
   *
   * The rule is `shareLinkDecision` in `report_visibility.ts`.
   */
  async shareLinkFor(report: Report, viewer: Viewer): Promise<{ url: string; minted: boolean }> {
    const decision = shareLinkDecision(report, viewer);
    const base = `${env.publicSiteOrigin}/r/${report.case_ref}`;
    switch (decision.kind) {
      case "plain":
        return { url: base, minted: false };
      case "mint": {
        const token = await this.createShareToken(report, viewer.id as string);
        return { url: `${base}?t=${token}`, minted: true };
      }
      default:
        throw decision.status === 404
          ? notFound(decision.message)
          : decision.status === 403
            ? forbidden(decision.message)
            : new HttpError(decision.message, decision.status);
    }
  }

  /**
   * D10 — a share token, so the public page can resolve without an id.
   *
   * Minted only by the author, only for a published report, and never for a
   * private one (§7.3, D3). A share link used to be available to any reader —
   * an advocate could mint one exposing a Trusted-Circle report to anyone — and
   * was the only way a private report could reach other people at all.
   */
  async createShareToken(report: Report, userId: string): Promise<string> {
    const decision = shareLinkDecision(report, { id: userId, role: null });
    if (decision.kind === "refuse") {
      throw decision.status === 404
        ? notFound(decision.message)
        : new HttpError(decision.message, decision.status === 403 ? 403 : 409);
    }
    if (decision.kind !== "mint") {
      throw forbidden("Only the person who filed a report can share it.");
    }

    const token = crypto.randomBytes(16).toString("base64url");
    await ReportShareLink.create({
      report_id: report.id,
      token,
      created_by: userId,
      created_at: nowIso(),
    });
    return token;
  }

  /**
   * What a shared link may show — D10's card, as a projection.
   *
   * A separate method rather than a filtered `detailView`, because the redactions
   * are the point and they belong next to the other projections where they can be
   * read together. Three things are missing on purpose:
   *
   *   • **No author, in any form.** Not the name, not the initials, not an
   *     `anonymous` flag that would reveal the report was *not* anonymous. A link
   *     cannot be recalled once it has travelled.
   *   • **No coordinates.** Only the rounded label, so the page cannot be turned
   *     into a map pin.
   *   • **No evidence rows.** Kinds and a count — of approved, sealed files only
   *     (D22), at either approval scope: the page links none of them, so a file
   *     approved on its preview alone (R5) is counted exactly as D1 lists it.
   *     Handing out presigned URLs on a public page would put the files
   *     themselves into every cache the link touches.
   */
  async shareView(report: Report): Promise<{
    caseRef: string;
    title: string;
    body: string;
    category: string;
    status: ReportStatus;
    evidenceStrength: EvidenceStrength;
    occurredAt: string;
    filedAt: string;
    locationLabel: string | null;
    locationPrecision: LocationPrecision;
    evidenceKinds: EvidenceKind[];
    supportCount: number;
    corroborationCount: number;
    indexable: boolean;
  }> {
    const evidence = await ReportEvidence.findAll({
      where: { report_id: report.id, upload_state: "sealed", moderation_state: "approved" },
      attributes: ["kind"],
      order: [["sort_order", "ASC"]],
    });

    return {
      caseRef: report.case_ref,
      title: report.title,
      body: await this.openBody(report),
      category: report.category,
      status: report.status,
      evidenceStrength: report.evidence_strength,
      occurredAt: report.occurred_at,
      filedAt: report.filed_at,
      locationLabel: report.location_label,
      locationPrecision: report.location_precision as LocationPrecision,
      evidenceKinds: evidence.map((row) => row.kind),
      supportCount: report.support_count,
      corroborationCount: report.corroboration_count,
      // Only a public report belongs in a search index. Anything reached through a
      // token is `noindex`, or the token stops being the gate.
      indexable: report.visibility === "public",
    };
  }

  /**
   * Resolve a share token to its report.
   *
   * Returns false for a revoked link as well as an unknown one, so revoking in the
   * app actually closes the page rather than only hiding the button — and for a
   * link minted by anyone but the report's author (review R7): before revision 2
   * any reader could mint one, and an advocate's link to a Trusted-Circle report
   * must not keep opening it for anyone who has it. The migration revokes those
   * rows too; this check means none can ever resolve.
   */
  async resolveShareToken(token: string, report: Pick<Report, "id" | "user_id">): Promise<boolean> {
    const link = await ReportShareLink.findOne({
      where: { token, report_id: report.id, revoked_at: null },
    });
    return Boolean(link) && shareLinkResolves(link as ReportShareLink, report);
  }
}

/**
 * B3's copy for a status change (§7.7). Fixed wording only — never the report's
 * text, which may be unmoderated at this moment (an owner edit is `pending`
 * when it re-opens a case), and no unmoderated member text leaves the platform
 * in a push (§0).
 */
function statusNotification(
  from: ReportStatus,
  next: ModerationOutcome,
  actor: TransitionActor["kind"],
  reasonCode: string | null,
): { title: string; body: string } {
  if (next === "under_review") {
    if (actor === "owner") {
      return { title: "Your report is under review", body: "You edited it, so it will be reviewed again." };
    }
    if (from === "dismissed") {
      return {
        title: OWNER_NOTIFICATIONS.reviewedAgain.title,
        body: OWNER_NOTIFICATIONS.reviewedAgain.body,
      };
    }
    return { title: "Your report is under review", body: "A moderator is reviewing it." };
  }
  if (next === "verified") {
    return {
      title: "Your report is verified",
      body: "A moderator reviewed it and the material attached to it.",
    };
  }
  const label = dismissReasonLabel(reasonCode);
  return {
    title: "Your report was dismissed",
    body: label ? `Reason: ${label}. Open it to see the details.` : "Open it to see the details.",
  };
}

export const reportService = new ReportService();
export default reportService;

/** Re-exported so the controller can annotate its projections. */
export type { EvidenceView };
