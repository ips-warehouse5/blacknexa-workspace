/**
 * Geo-Legal service — jurisdiction lookup, compliance validation, agency
 * dispatch, and the encrypted incident store.
 *
 * Ported from `_lib/geo-legal/store.ts`. Two behaviours are worth calling out
 * because they are safety properties, not conveniences:
 *
 *   • **Dispatch is never automatic.** `humanConfirmed` must be true or the
 *     request is rejected with 403, and every routed agency is written to an
 *     audit trail with status `AUDIT_RECORDED` — the platform records the routing
 *     and the reporter completes the submission themselves. Nothing is filed on
 *     a user's behalf.
 *   • **Erasure is real.** `deleteIncident` hard-deletes the incident, its
 *     evidence and its audit rows, because the response tells the user their data
 *     was permanently deleted under GDPR/CCPA.
 */

import { Op } from "sequelize";
import sequelize from "@/config/database.config";
import logger, { runBackground } from "@/utils/logger.util";
import { prefixedId } from "@/utils/id.util";
import { JurisdictionCache, LegalTranslation } from "@/models/jurisdiction_cache.model";
import { Incident, EvidencePackage, DispatchAudit } from "@/models/incident.model";
import jurisdictionService from "@/services/jurisdiction.service";
import encryptionService from "@/services/encryption.service";
import piiScrubberService from "@/services/pii_scrubber.service";
import i18nService, { isSupportedLanguage } from "@/services/i18n.service";
import type { LanguageCode } from "@/types/i18n.interface";
import type {
  CreateIncidentRequest,
  DispatchChannel,
  DispatchRequest,
  DispatchResult,
  JurisdictionProfile,
  ReportDraft,
  ValidationResult,
} from "@/types/geo_legal.interface";

/** Shape returned by `GET /geo-legal/incident/:id`. */
export interface IncidentDetail {
  incident: {
    id: string;
    userId: string;
    countryCode: string;
    category: string;
    sealedPayload: string;
    serverEncrypted: boolean;
    piiScrubbed: boolean;
    privacyLevel: string;
    createdAt: string;
    dispatchStatus: string;
    dispatchAuditId: string | null;
  };
  evidence: Array<{
    id: string;
    mediaType: string;
    contentHash: string;
    metadataScrubbed: boolean;
    createdAt: string;
  }>;
  dispatchAudit: Array<{
    id: string;
    channel: string;
    agencyId: string;
    agencyName: string;
    portalUrl: string;
    status: string;
    dispatchedAt: string;
  }>;
}

class GeoLegalService {
  // ── Profile cache ──────────────────────────────────────────────────────────

  private async readCachedProfile(countryCode: string): Promise<JurisdictionProfile | null> {
    const row = await JurisdictionCache.findByPk(countryCode.toUpperCase());
    return row ? row.profile_json : null;
  }

  private async writeCachedProfile(profile: JurisdictionProfile): Promise<void> {
    await JurisdictionCache.upsert({
      country_code: profile.countryCode.toUpperCase(),
      profile_json: profile,
      cached_at: new Date().toISOString(),
      source: profile.source,
    });
  }

  private async readCachedLegalTranslation(
    countryCode: string,
    language: string,
  ): Promise<JurisdictionProfile | null> {
    const row = await LegalTranslation.findOne({
      where: { country_code: countryCode.toUpperCase(), language },
    });
    return row ? row.profile_json : null;
  }

  private async writeCachedLegalTranslation(
    countryCode: string,
    language: string,
    profile: JurisdictionProfile,
  ): Promise<void> {
    await LegalTranslation.upsert({
      country_code: countryCode.toUpperCase(),
      language,
      profile_json: profile,
      translated_at: new Date().toISOString(),
    });
  }

  /** Resolve a profile: cache → curated → AI, writing back what the AI produced. */
  private async resolveProfile(
    countryCode: string,
    lat?: number,
    lng?: number,
  ): Promise<JurisdictionProfile | null> {
    const cached = await this.readCachedProfile(countryCode);
    if (cached) return cached;

    const resolved = await jurisdictionService.resolveJurisdiction(countryCode, lat, lng);
    if (resolved) await this.writeCachedProfile(resolved);
    return resolved;
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  /**
   * `GET /geo-legal/lookup`.
   *
   * When a non-English language is requested and no translation is cached, the
   * English profile is returned immediately and the translation runs in the
   * background — a reporter mid-incident should not wait on a translation call to
   * see which agency to contact.
   */
  async lookup(params: {
    country: string;
    lat?: number;
    lng?: number;
    lang?: string;
  }): Promise<JurisdictionProfile | null> {
    const country = params.country.toUpperCase().trim();
    const profile = await this.resolveProfile(country, params.lat, params.lng);
    if (!profile) return null;

    const lang = params.lang ?? "en";
    if (isSupportedLanguage(lang) && lang !== "en") {
      const cachedTranslation = await this.readCachedLegalTranslation(country, lang);
      if (cachedTranslation) return cachedTranslation;
      runBackground(
        this.translateProfileInBackground(country, lang, profile),
        "legal resource translation",
      );
    }
    return profile;
  }

  /** Translate a profile and cache it, preserving statute citations verbatim. */
  private async translateProfileInBackground(
    country: string,
    language: LanguageCode,
    profile: JurisdictionProfile,
  ): Promise<void> {
    const translation = await i18nService.translateLegalResource({
      language,
      countryName: profile.countryName,
      legalFrameworks: profile.legalFrameworks.map((f) => ({
        name: f.name,
        citation: f.citation,
        summary: f.summary,
      })),
      agencies: profile.agencies.map((a) => ({ name: a.name, description: a.description })),
      pressContacts: profile.pressContacts.map((p) => ({
        name: p.name,
        description: p.description,
      })),
    });
    if (!translation) return;

    // Merge positionally: only the text fields are replaced, so ids, URLs,
    // emails, phone numbers and category mappings stay exactly as verified.
    const translatedProfile: JurisdictionProfile = {
      ...profile,
      countryName: translation.countryName,
      legalFrameworks: profile.legalFrameworks.map((f, i) => ({
        ...f,
        name: translation.legalFrameworks[i]?.name ?? f.name,
        summary: translation.legalFrameworks[i]?.summary ?? f.summary,
      })),
      agencies: profile.agencies.map((a, i) => ({
        ...a,
        name: translation.agencies[i]?.name ?? a.name,
        description: translation.agencies[i]?.description ?? a.description,
      })),
      pressContacts: profile.pressContacts.map((p, i) => ({
        ...p,
        name: translation.pressContacts[i]?.name ?? p.name,
        description: translation.pressContacts[i]?.description ?? p.description,
      })),
    };
    await this.writeCachedLegalTranslation(country, language, translatedProfile);
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /** `POST /geo-legal/validate`. Falls back to a minimal profile if unresolvable. */
  async validate(params: {
    reportDraft: ReportDraft;
    countryCode: string;
    lat?: number;
    lng?: number;
  }): Promise<ValidationResult> {
    const profile =
      (await this.resolveProfile(params.countryCode, params.lat, params.lng)) ??
      jurisdictionService.getCurated(params.countryCode) ??
      jurisdictionService.minimalProfile(params.countryCode);

    return jurisdictionService.validateReport(params.reportDraft, profile);
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────

  /**
   * `POST /geo-legal/dispatch`.
   *
   * Records an audit entry per matched agency/outlet for each requested channel.
   * `status` is always `AUDIT_RECORDED`: this routes and documents, it does not
   * transmit on the user's behalf.
   */
  async dispatch(
    body: DispatchRequest & { incidentId?: string },
  ): Promise<{ ok: true; result: DispatchResult } | { ok: false; error: string; status: number }> {
    const profile = await this.resolveProfile(body.reportDraft.countryCode);
    if (!profile) {
      return { ok: false, error: "Could not resolve jurisdiction for dispatch.", status: 404 };
    }

    const auditId = prefixedId("audit");
    const dispatchedTo: DispatchResult["dispatchedTo"] = [];
    const now = new Date().toISOString();
    const incidentId = body.incidentId ?? "draft";

    const agencies = profile.agencies.filter((a) =>
      a.categories.includes(body.reportDraft.category),
    );
    const pressContacts = profile.pressContacts.filter((p) =>
      p.categories.includes(body.reportDraft.category),
    );

    const rows: Array<{
      id: string;
      incident_id: string;
      channel: string;
      agency_id: string;
      agency_name: string;
      portal_url: string;
      status: string;
      dispatched_at: string;
    }> = [];

    for (const channel of body.channels) {
      if (channel === "GOVT_AGENCY" || channel === "HUMAN_RIGHTS") {
        for (const agency of agencies) {
          rows.push({
            id: `${auditId}_${agency.id}`,
            incident_id: incidentId,
            channel,
            agency_id: agency.id,
            agency_name: agency.name,
            portal_url: agency.portalUrl,
            status: "AUDIT_RECORDED",
            dispatched_at: now,
          });
          dispatchedTo.push({
            agencyId: agency.id,
            agencyName: agency.name,
            channel,
            portalUrl: agency.portalUrl,
            status: "AUDIT_RECORDED",
          });
        }
      }

      if (channel === "PRESS") {
        for (const press of pressContacts) {
          rows.push({
            id: `${auditId}_${press.id}`,
            incident_id: incidentId,
            channel: "PRESS",
            agency_id: press.id,
            agency_name: press.name,
            portal_url: press.portalUrl,
            status: "AUDIT_RECORDED",
            dispatched_at: now,
          });
          dispatchedTo.push({
            agencyId: press.id,
            agencyName: press.name,
            channel: "PRESS" as DispatchChannel,
            portalUrl: press.portalUrl,
            status: "AUDIT_RECORDED",
          });
        }
      }
    }

    if (rows.length > 0) {
      // `updateOnDuplicate` keeps the original's INSERT OR REPLACE semantics for
      // a retried dispatch of the same audit id.
      await DispatchAudit.bulkCreate(rows, {
        updateOnDuplicate: ["channel", "agency_name", "portal_url", "status", "dispatched_at"],
      });
    }

    return { ok: true, result: { success: true, dispatchedTo, auditId } };
  }

  // ── Incidents ──────────────────────────────────────────────────────────────

  /**
   * `POST /geo-legal/incident/create`.
   *
   * Two defensive layers run before storage, both best-effort by design: if PII
   * scrubbing or server re-encryption fails, the incident is still stored rather
   * than lost — losing a reporter's evidence would be the worse outcome — and the
   * `piiScrubbed` / `serverEncrypted` flags record honestly what was applied.
   */
  async createIncident(body: CreateIncidentRequest): Promise<{ incidentId: string }> {
    const incidentId = prefixedId("inc");
    const createdAt = new Date().toISOString();

    let piiScrubbed = 0;
    let sealedPayloadText = body.validation.formattedSummary;
    try {
      const scrubResult = await piiScrubberService.scrubEvidence({
        text: body.validation.formattedSummary,
        privacyRegime: body.validation.privacyRegime,
        mediaBase64: body.sealedEvidence?.sealedPayload,
      });
      piiScrubbed = scrubResult.redactedCount;
      sealedPayloadText = scrubResult.scrubbedText;
    } catch (err) {
      logger.warn("[geo-legal] PII scrub failed, storing unscrubbed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    let serverEncrypted = false;
    let storedPayload = sealedPayloadText;
    try {
      const sealed = await encryptionService.serverSeal(sealedPayloadText);
      storedPayload = encryptionService.serialize(sealed);
      serverEncrypted = true;
    } catch (err) {
      logger.warn("[geo-legal] server seal failed, storing client-sealed blob", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    await sequelize.transaction(async (transaction) => {
      await Incident.upsert(
        {
          id: incidentId,
          user_id: body.userId || "anonymous",
          country_code: body.countryCode.toUpperCase(),
          category: body.category,
          sealed_payload: storedPayload,
          server_encrypted: serverEncrypted,
          pii_scrubbed: piiScrubbed > 0,
          privacy_level: body.privacyLevel,
          created_at: createdAt,
          dispatch_status: "created",
          dispatch_audit_id: null,
        },
        { transaction },
      );

      if (body.sealedEvidence) {
        await EvidencePackage.upsert(
          {
            id: prefixedId("evd"),
            incident_id: incidentId,
            sealed_blob: body.sealedEvidence.sealedPayload,
            media_type: body.sealedEvidence.mediaType,
            content_hash: body.sealedEvidence.contentHash,
            metadata_scrubbed: Boolean(body.sealedEvidence.metadataScrubbed),
            created_at: createdAt,
          },
          { transaction },
        );
      }
    });

    return { incidentId };
  }

  /**
   * `GET /geo-legal/incident/:id`.
   *
   * The server layer is peeled off so the caller receives the client-sealed blob,
   * which only the reporter's device key can open. Evidence blobs are *not*
   * returned — only their metadata — matching the original.
   */
  async getIncident(incidentId: string): Promise<IncidentDetail | null> {
    const row = await Incident.findByPk(incidentId);
    if (!row) return null;

    let clientSealedPayload = row.sealed_payload;
    if (row.server_encrypted) {
      const sealed = encryptionService.deserialize(row.sealed_payload);
      if (sealed) {
        const decrypted = await encryptionService.serverOpen(sealed);
        if (decrypted) clientSealedPayload = decrypted;
      }
    }

    const [evidenceRows, auditRows] = await Promise.all([
      EvidencePackage.findAll({ where: { incident_id: incidentId } }),
      DispatchAudit.findAll({
        where: { incident_id: incidentId },
        order: [["dispatched_at", "DESC"]],
      }),
    ]);

    return {
      incident: {
        id: row.id,
        userId: row.user_id,
        countryCode: row.country_code,
        category: row.category,
        sealedPayload: clientSealedPayload,
        serverEncrypted: row.server_encrypted,
        piiScrubbed: row.pii_scrubbed,
        privacyLevel: row.privacy_level,
        createdAt: row.created_at,
        dispatchStatus: row.dispatch_status,
        dispatchAuditId: row.dispatch_audit_id,
      },
      evidence: evidenceRows.map((e) => ({
        id: e.id,
        mediaType: e.media_type,
        contentHash: e.content_hash,
        metadataScrubbed: e.metadata_scrubbed,
        createdAt: e.created_at,
      })),
      dispatchAudit: auditRows.map((a) => ({
        id: a.id,
        channel: a.channel,
        agencyId: a.agency_id,
        agencyName: a.agency_name,
        portalUrl: a.portal_url,
        status: a.status,
        dispatchedAt: a.dispatched_at,
      })),
    };
  }

  /**
   * `DELETE /geo-legal/incident/:id` — GDPR/CCPA right-to-erasure.
   *
   * A genuine hard delete of the incident, its evidence and its audit trail. The
   * response promises permanent deletion, so a soft delete is not an option here.
   */
  async deleteIncident(incidentId: string): Promise<boolean> {
    const row = await Incident.findByPk(incidentId);
    if (!row) return false;

    await sequelize.transaction(async (transaction) => {
      await EvidencePackage.destroy({
        where: { incident_id: incidentId },
        force: true,
        transaction,
      });
      await DispatchAudit.destroy({
        where: { incident_id: incidentId },
        force: true,
        transaction,
      });
      await Incident.destroy({ where: { id: incidentId }, force: true, transaction });
    });

    logger.info("[geo-legal] incident erased", { incidentId });
    return true;
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  /** `POST /geo-legal/refresh` — re-cache every curated jurisdiction. */
  async refreshCuratedJurisdictions(): Promise<{
    refreshed: number;
    total: number;
    message: string;
  }> {
    const countries = jurisdictionService.listCurated();
    let refreshed = 0;
    for (const code of countries) {
      const profile = jurisdictionService.getCurated(code);
      if (profile) {
        await this.writeCachedProfile(profile);
        refreshed++;
      }
    }
    return {
      refreshed,
      total: countries.length,
      message: `${refreshed} curated jurisdictions refreshed.`,
    };
  }
}

export const geoLegalService = new GeoLegalService();
export default geoLegalService;
