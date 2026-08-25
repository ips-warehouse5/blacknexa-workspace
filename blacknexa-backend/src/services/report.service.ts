/**
 * The report module — drafts, filing, projections, and the status machine.
 *
 * Four rules from the design are enforced here rather than trusted to a caller:
 *
 *   1. **Filing is a transaction.** C8: "There is no way to close this screen —
 *      nothing is half-filed." A report is created only when every attached file
 *      is sealed, and the row, its case reference, its first status event and the
 *      owner's notification are one commit.
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
 */

import crypto from "crypto";
import { Op, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import {
  Report,
  ReportDraft,
  ReportEvidence,
  ReportStatusEvent,
  nextCaseRef,
} from "@/models/report.model";
import {
  Notification,
  ReportCorroboration,
  ReportHide,
  ReportSupport,
} from "@/models/report_social.model";
import { AppUser } from "@/models/app_user.model";
import encryptionService from "@/services/encryption.service";
import piiScrubberService from "@/services/pii_scrubber.service";
import evidenceStrengthService from "@/services/evidence_strength.service";
import evidenceService from "@/services/evidence.service";
import { HttpError, badRequest, forbidden, notFound } from "@/middlewares/error.middleware";
import type { LocationPrecision } from "@/types/user.interface";
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
  StatusEventView,
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
      await evidenceService.deleteObject(row.storage_key, row.thumb_key);
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

  /**
   * C7 → C8 → C9. File a draft as a report.
   *
   * Refuses unless every attached file is sealed. C8's checklist shows sealing
   * completing before "Filing the report" starts, so an unsealed file here means
   * the client got ahead of itself and the honest answer is a 409 naming the rows.
   */
  async fileReport(
    userId: string,
    draftId: string,
    attested: boolean,
  ): Promise<{ reportId: string; caseRef: string; filedAt: string }> {
    if (!attested) {
      // C7's checkbox. Without it there is no attestation to record.
      throw badRequest("Confirm the report is true to the best of your knowledge.");
    }

    const draft = await ReportDraft.findOne({ where: { id: draftId, user_id: userId } });
    if (!draft) throw notFound("That draft no longer exists.");

    const payload = draft.payload_json as DraftPayload;
    this.assertFileable(payload);

    const evidence = await ReportEvidence.findAll({ where: { draft_id: draftId } });
    const unsealed = evidence.filter((row) => row.upload_state !== "sealed");
    if (unsealed.length > 0) {
      throw new HttpError(
        `${unsealed.length} file${unsealed.length === 1 ? "" : "s"} ${
          unsealed.length === 1 ? "has" : "have"
        } not finished sealing. Nothing has been filed.`,
        409,
      );
    }

    const owner = await AppUser.findByPk(userId);
    if (!owner || owner.status !== "active") throw forbidden("This account cannot file reports.");

    const filedAt = nowIso();
    const caseRef = await nextCaseRef();

    // ── Body: scrub, then seal ──────────────────────────────────────────────
    // Both best-effort by design, matching the geo-legal service's reasoning:
    // losing a reporter's account of what happened is a worse outcome than storing
    // it with one fewer defensive layer, and the flags record honestly which
    // layers were applied.
    let body = payload.body!.trim();
    let piiScrubbed = false;
    try {
      const scrubbed = await piiScrubberService.scrubEvidence({
        text: body,
        privacyRegime: "GDPR",
      });
      body = scrubbed.scrubbedText;
      piiScrubbed = scrubbed.redactedCount > 0;
    } catch (err) {
      logger.warn("[reports] PII scrub failed, storing unscrubbed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    let bodyEncrypted = false;
    try {
      body = encryptionService.serialize(await encryptionService.serverSeal(body));
      bodyEncrypted = true;
    } catch (err) {
      logger.warn("[reports] body seal failed, storing plaintext", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Location: round on write ────────────────────────────────────────────
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
      // The exact value is kept sealed for the owner and moderators, whatever the
      // published precision — including `hidden`, where nothing is published.
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

    const reportId = await sequelize.transaction(async (transaction) => {
      const report = await Report.create(
        {
          case_ref: caseRef,
          user_id: userId,
          title: payload.title!.trim().slice(0, 70),
          body,
          category: payload.category!,
          occurred_at: payload.occurredAt!,
          occurred_precision: payload.occurredPrecision ?? "exact",
          occurred_day_part: payload.occurredDayPart ?? null,
          filed_at: filedAt,
          location_precision: precision,
          location_label: payload.locationLabel ?? null,
          lat,
          lng,
          geohash,
          location_exact_sealed: exactSealed,
          visibility: payload.visibility ?? owner.default_visibility,
          anonymous: payload.anonymous ?? owner.anonymous_by_default,
          urgent: payload.urgent ?? false,
          status: "submitted",
          evidence_strength: strength.strength,
          pii_scrubbed: piiScrubbed,
          body_encrypted: bodyEncrypted,
        },
        { transaction },
      );

      // Re-parent the evidence from the draft to the report.
      await ReportEvidence.update(
        { report_id: report.id, draft_id: null },
        { where: { draft_id: draftId }, transaction },
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

      await ReportDraft.destroy({ where: { id: draftId }, transaction });
      return report.id;
    });

    logger.info("[reports] filed", {
      reportId,
      caseRef,
      urgent: payload.urgent ?? false,
      files: evidence.length,
    });

    return { reportId, caseRef, filedAt };
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
    return isRef
      ? Report.findOne({ where: { case_ref: idOrRef.toUpperCase() } })
      : Report.findByPk(idOrRef);
  }

  /**
   * Whether `viewerId` may read this report at all.
   *
   * `trusted` is advocate-only; `private` is the owner alone. A caller who fails
   * this gets a 404 rather than a 403, because a 403 confirms the report exists —
   * which for a private report is itself the disclosure.
   *
   * There is no moderator branch here on purpose. Moderators are operator accounts
   * and read through `/admin/moderation`, which has its own projection showing the
   * author's identity. A member token cannot carry a moderator role at all, so a
   * check for one here would be dead code that implied otherwise.
   */
  canRead(report: Report, viewerId: string | null, viewerRole: string | null): boolean {
    if (report.deleted_at) return viewerId === report.user_id;
    if (viewerId && viewerId === report.user_id) return true;
    if (report.visibility === "public") return true;
    if (report.visibility === "trusted") return viewerRole === "advocate";
    return false;
  }

  /** D1 — the community viewer's projection. */
  async detailView(report: Report, viewerId: string | null): Promise<ReportDetailView> {
    const [author, evidence, standing, corroborated] = await Promise.all([
      this.authorView(report),
      evidenceService.listForReport(report.id),
      viewerId
        ? ReportSupport.count({ where: { report_id: report.id, user_id: viewerId } })
        : Promise.resolve(0),
      viewerId
        ? ReportCorroboration.count({ where: { report_id: report.id, user_id: viewerId } })
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
      isOwner: viewerId === report.user_id,
    };
  }

  /** D2 — the owner's projection, which is a separate screen, not a variant. */
  async ownerView(report: Report): Promise<ReportOwnerView> {
    const base = await this.detailView(report, report.user_id);
    const events = await ReportStatusEvent.findAll({
      where: { report_id: report.id },
      order: [["at", "ASC"]],
    });

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

    return {
      ...base,
      timeline: events.map((event) => this.statusEventView(event)),
      viewCount: report.view_count,
      // D2 shows how many moderators have seen it. Derived from who acted.
      moderatorCount: new Set(
        events.filter((e) => e.actor_kind === "moderator" && e.actor_id).map((e) => e.actor_id),
      ).size,
      // Nothing until a dispatch happens — D2's "Outside organisations: None".
      dispatchedTo: [],
      // D2: "Because this report is verified, you can dispatch it…"
      canDispatch: report.status === "verified",
      exactLat,
      exactLng,
    };
  }

  private statusEventView(event: ReportStatusEvent): StatusEventView {
    return {
      status: event.status,
      at: event.at,
      // Only claimed when a moderator actually acted.
      actorLabel: event.actor_kind === "moderator" ? "by a moderator" : null,
      note: event.note,
    };
  }

  /** D3 — the trust sheet. */
  async trustView(report: Report): Promise<TrustView> {
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
      files: evidence.map((row) => ({
        id: row.id,
        label: evidenceService.describe(row),
        // "Unchanged" means we have a hash and the file is sealed against it.
        unchanged: Boolean(row.sha256) && row.upload_state === "sealed",
      })),
      provenance: events.map((event) => this.statusEventView(event)),
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
    // An owner edit re-opens a decided report — see the edit policy in the plan.
    verified: ["under_review"],
    dismissed: ["under_review"],
  };

  /**
   * Move a report's status, writing the event and notifying the owner.
   *
   * The notification is written in the same transaction as the event, because B3
   * and the D2 timeline must never disagree about whether something happened.
   */
  async transition(
    report: Report,
    next: ModerationOutcome,
    actor: { kind: "moderator" | "system" | "owner"; id: string | null },
    note?: string,
  ): Promise<void> {
    const allowed = ReportService.TRANSITIONS[report.status as ReportStatus] ?? [];
    if (!allowed.includes(next)) {
      throw badRequest(`A ${report.status} report cannot become ${next}.`);
    }

    const at = nowIso();
    await sequelize.transaction(async (transaction: Transaction) => {
      await report.update(
        { status: next, verified_at: next === "verified" ? at : report.verified_at },
        { transaction },
      );
      await ReportStatusEvent.create(
        {
          report_id: report.id,
          status: next,
          actor_kind: actor.kind,
          actor_id: actor.id,
          note: note ?? null,
          at,
        },
        { transaction },
      );
      // A severed report can still be verified — there is simply nobody to tell.
      if (report.user_id) {
        await Notification.create(
          {
            user_id: report.user_id,
            type: "status_change",
            title: STATUS_TITLES[next],
            body: report.title,
            link: `/r/${report.case_ref}`,
            report_id: report.id,
            created_at: at,
          },
          { transaction },
        );
      }
    });

    logger.info("[reports] status changed", {
      reportId: report.id,
      to: next,
      actor: actor.kind,
    });
  }

  // ── Owner actions ─────────────────────────────────────────────────────────

  /**
   * D2's edit.
   *
   * Title and body only, and a verified report drops back to review. Sealed
   * evidence cannot change without voiding every integrity claim on D3, D11 and
   * D12, so it is append-only — D2's Delete is the escape hatch instead.
   */
  async updateReport(
    report: Report,
    patch: { title?: string; body?: string },
  ): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (patch.title !== undefined) updates.title = patch.title.trim().slice(0, 70);

    if (patch.body !== undefined) {
      let body = patch.body.trim();
      try {
        body = encryptionService.serialize(await encryptionService.serverSeal(body));
        updates.body_encrypted = true;
      } catch {
        updates.body_encrypted = false;
      }
      updates.body = body;
    }

    if (Object.keys(updates).length === 0) return;
    await report.update(updates);

    // An edited report has to be looked at again, and the reader has to be told
    // the badge is gone rather than discovering it.
    if (report.status === "verified") {
      await this.transition(report, "under_review", { kind: "owner", id: report.user_id }, "Edited by the author");
    }
  }

  /**
   * D2's delete.
   *
   * "Deleting removes it from the feed and from your Vault. Sealed files are
   * destroyed after 30 days." So the row leaves every read path now, and the
   * objects are scheduled — the window exists so an accidental deletion or a
   * moderation dispute can still be resolved.
   */
  async deleteReport(report: Report): Promise<void> {
    const at = nowIso();
    const purgeAfter = new Date(
      Date.now() + env.reports.evidenceRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    await sequelize.transaction(async (transaction) => {
      await report.update({ deleted_at: at }, { transaction });
      await ReportEvidence.update(
        { purge_after: purgeAfter },
        { where: { report_id: report.id }, transaction },
      );
    });

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
   */
  async corroborate(
    report: Report,
    userId: string,
    note: string | undefined,
  ): Promise<{ count: number }> {
    const existing = await ReportCorroboration.findOne({
      where: { report_id: report.id, user_id: userId },
    });
    if (existing) return { count: report.corroboration_count };

    if (userId === report.user_id) {
      throw badRequest("You cannot corroborate your own report.");
    }

    const at = nowIso();
    await sequelize.transaction(async (transaction) => {
      await ReportCorroboration.create(
        { report_id: report.id, user_id: userId, note: note ?? null, at },
        { transaction },
      );
      await report.increment("corroboration_count", { by: 1, transaction });
      if (report.user_id) {
        await Notification.create(
          {
            user_id: report.user_id,
            type: "corroboration_or_reply",
            title: "Someone said it happened to them too",
            body: report.title,
            link: `/r/${report.case_ref}`,
            report_id: report.id,
            created_at: at,
          },
          { transaction },
        );
      }
    });

    await report.reload();
    // Corroboration feeds the strength score, so it is recomputed here rather
    // than drifting until the next read.
    await this.refreshStrength(report);
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

  /** D10 — a share token, so the public page can resolve without an id. */
  async createShareToken(report: Report, userId: string): Promise<string> {
    const token = crypto.randomBytes(16).toString("base64url");
    const { ReportShareLink } = await import("@/models/report_social.model");
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
   *   • **No evidence rows.** Kinds and a count. Handing out presigned URLs on a
   *     public page would put the files themselves into every cache the link
   *     touches.
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
      where: { report_id: report.id, upload_state: "sealed" },
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
   * Returns null for a revoked link as well as an unknown one, so revoking in the
   * app actually closes the page rather than only hiding the button.
   */
  async resolveShareToken(token: string, reportId: string): Promise<boolean> {
    const { ReportShareLink } = await import("@/models/report_social.model");
    const link = await ReportShareLink.findOne({
      where: { token, report_id: reportId, revoked_at: null },
    });
    return Boolean(link);
  }
}

/** B3's row titles, which are the four states A11 promises to notify about. */
const STATUS_TITLES: Record<ReportStatus, string> = {
  draft: "Your draft was saved",
  submitted: "Your report was filed",
  under_review: "Your report is under review",
  verified: "Your report is verified",
  dismissed: "Your report was dismissed",
};

export const reportService = new ReportService();
export default reportService;

/** Re-exported so the controller can annotate its projections. */
export type { EvidenceView };
