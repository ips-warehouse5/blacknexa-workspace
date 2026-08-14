/**
 * Geo-Legal controller.
 *
 * Response shapes match `GeoLegalProvider.tsx` exactly: `{ success, profile }`,
 * `{ success, validation }`, the dispatch result spread at the top level, and
 * `{ success, incidentId }`.
 *
 * `humanConfirmed` is validated as a literal `true` in the schema, so the 403
 * paths here are defence in depth rather than the only gate — nothing is ever
 * routed to an agency or the press without the reporter's explicit confirmation.
 */

import type { Request, Response } from "express";
import geoLegalService from "@/services/geo_legal.service";
import { legacyJson, legacyError } from "@/utils/response.util";
import { validatedBody, validatedParams, validatedQuery } from "@/middlewares/validate.middleware";
import { ENGINE_INFO, GLOBAL_RESOURCE_REGIONS } from "@/data/global_regions.data";
import type {
  CreateIncidentRequest,
  DispatchRequest,
  ReportDraft,
  ValidationResult,
} from "@/types/geo_legal.interface";

class GeoLegalController {
  /**
   * `GET /api/v1/geo-legal/regions` → `{ success, engine, regions }`
   *
   * Static curated data, served without a database read — the app mirrors it
   * locally (`constants/geo-legal.ts`) so the hub renders instantly offline.
   */
  async regions(_req: Request, res: Response): Promise<void> {
    legacyJson(res, { engine: ENGINE_INFO, regions: GLOBAL_RESOURCE_REGIONS });
  }

  /** `GET /api/v1/geo-legal/lookup` → `{ success, profile }` */
  async lookup(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      country: string;
      lat?: number;
      lng?: number;
      lang: string;
    }>(req);

    const profile = await geoLegalService.lookup(query);
    if (!profile) {
      legacyError(res, `Could not resolve jurisdiction for ${query.country}.`, 404);
      return;
    }
    legacyJson(res, { profile });
  }

  /** `POST /api/v1/geo-legal/validate` → `{ success, validation }` */
  async validate(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      reportDraft: ReportDraft;
      countryCode: string;
      lat?: number;
      lng?: number;
    }>(req);

    const validation = await geoLegalService.validate(body);
    legacyJson(res, { validation });
  }

  /**
   * `POST /api/v1/geo-legal/dispatch` → `{ success, dispatchedTo, auditId }`
   *
   * The result is spread at the top level, matching the original, because the
   * client reads `data.dispatchedTo` directly rather than a nested object.
   */
  async dispatch(req: Request, res: Response): Promise<void> {
    const body = validatedBody<DispatchRequest & { incidentId?: string }>(req);

    if (!body.humanConfirmed) {
      legacyError(res, "Human confirmation is required before dispatch.", 403);
      return;
    }

    const result = await geoLegalService.dispatch(body);
    if (!result.ok) {
      legacyError(res, result.error, result.status);
      return;
    }
    legacyJson(res, { ...result.result });
  }

  /** `POST /api/v1/geo-legal/incident/create` → `{ success, incidentId }` */
  async createIncident(req: Request, res: Response): Promise<void> {
    const body = validatedBody<CreateIncidentRequest>(req);

    if (!body.humanConfirmed) {
      legacyError(res, "Human confirmation is required.", 403);
      return;
    }

    const { incidentId } = await geoLegalService.createIncident(body);
    legacyJson(res, { incidentId });
  }

  /**
   * `GET /api/v1/geo-legal/incident/:id` → `{ success, incident, evidence, dispatchAudit }`
   *
   * `incident.sealedPayload` is the client-sealed blob: the server layer is peeled
   * off, but the inner layer can only be opened with the reporter's device key.
   * Evidence blobs are never returned — only their metadata.
   */
  async getIncident(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const detail = await geoLegalService.getIncident(decodeURIComponent(id));

    if (!detail) {
      legacyError(res, "Incident not found.", 404);
      return;
    }
    legacyJson(res, { ...detail });
  }

  /**
   * `DELETE /api/v1/geo-legal/incident/:id` — GDPR/CCPA right-to-erasure.
   *
   * A genuine hard delete of the incident, its evidence, and its audit trail.
   */
  async deleteIncident(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const incidentId = decodeURIComponent(id);
    const deleted = await geoLegalService.deleteIncident(incidentId);

    if (!deleted) {
      legacyError(res, "Incident not found.", 404);
      return;
    }
    legacyJson(res, {
      message:
        "Incident and all associated evidence permanently deleted (GDPR/CCPA right-to-erasure).",
      incidentId,
    });
  }

  /** `POST /api/v1/geo-legal/refresh` → `{ success, refreshed, total, message }` */
  async refresh(_req: Request, res: Response): Promise<void> {
    const result = await geoLegalService.refreshCuratedJurisdictions();
    legacyJson(res, result);
  }
}

export const geoLegalController = new GeoLegalController();
export default geoLegalController;
