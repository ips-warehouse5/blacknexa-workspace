/**
 * Enterprise Core Engine controller — `/api/v1/blacknexa/*`.
 *
 * Four of these endpoints carry **additive response fields** that the Worker did
 * not send, because the shipped clients require them and currently break without
 * them. In every case the original flat payload is still present, so anything
 * reading the raw enterprise shape is unaffected. Details in
 * `docs/MIGRATION_PLAN.md` §6.2–6.5:
 *
 *   • `publish-verified-story` — the app checks `body.success && body.article`;
 *     the Worker returned the bare `ArticleResponse`.
 *   • `artists/tip` — the app sends snake_case **query params with an empty body**
 *     and checks `json.success`; the Worker parsed JSON from the empty body and 500'd.
 *   • `hardware/beacon-trigger` — both apps send snake_case JSON and check
 *     `json.success`; the Worker read camelCase and 400'd.
 *   • `weather` — both apps read `json.data.currentWeather`; the Worker returned
 *     the payload flat.
 */

import type { Request, Response } from "express";
import enterpriseService, {
  type ArticleGenerationRequest,
  type VerifiedArticleRequest,
} from "@/services/enterprise.service";
import weatherService from "@/services/weather.service";
import { legacyJson, legacyError, rawJson } from "@/utils/response.util";
import { validatedBody, validatedQuery } from "@/middlewares/validate.middleware";
import { ENTERPRISE_ORIGIN, ENTERPRISE_VERSION } from "@/config/constants";

/** Body/query shape for the artist tip, accepting both key spellings. */
interface ArtistTipInput {
  artist_id?: string;
  supporter_user_id?: string;
  tip_amount_usd?: number;
  artistId?: string;
  supporterUserId?: string;
  tipAmountUsd?: number;
  message?: string;
}

/** Body shape for the beacon trigger, accepting both key spellings. */
interface BeaconInput {
  user_id?: string;
  device_mac_address?: string;
  trigger_type?: string;
  gps_coordinates?: { lat: number; lon: number };
  userId?: string;
  deviceMacAddress?: string;
  triggerType?: string;
  gpsCoordinates?: { lat: number; lon: number };
}

class EnterpriseController {
  /** `GET /blacknexa/categories` → `{ categories }` (no envelope, as before) */
  async categories(_req: Request, res: Response): Promise<void> {
    rawJson(res, { categories: enterpriseService.getCategories() });
  }

  /**
   * `POST /blacknexa/generate-story`
   *
   * The Worker returned the bare article on success and `{ detail }` on failure.
   * Both are preserved; `success` and `article` are added so a client can branch on
   * them without inspecting the shape.
   */
  async generateStory(req: Request, res: Response): Promise<void> {
    const body = validatedBody<ArticleGenerationRequest>(req);
    const result = await enterpriseService.generateStory(body);

    if (!result.success) {
      // `detail` is the key the original used for this engine's errors.
      rawJson(res, { success: false, detail: result.error }, result.status);
      return;
    }
    rawJson(res, { ...result.article, success: true, article: result.article }, result.status);
  }

  /**
   * `POST /blacknexa/publish-verified-story`
   *
   * The 422 body keeps the exact "Truth Guardrail Error" text the app surfaces to
   * the user, and adds `error` alongside `detail` since `NewsProvider` reads
   * `body.error` for its message.
   */
  async publishVerifiedStory(req: Request, res: Response): Promise<void> {
    const body = validatedBody<VerifiedArticleRequest>(req);
    const result = await enterpriseService.publishVerifiedStory(body);

    if (!result.success) {
      rawJson(
        res,
        { success: false, detail: result.error, error: result.error },
        result.status,
      );
      return;
    }
    rawJson(res, { ...result.article, success: true, article: result.article }, result.status);
  }

  /** `GET /blacknexa/feed` → `{ totalStories, articles }` (no envelope, as before) */
  async feed(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{ location?: string; category?: string }>(req);
    const articles = await enterpriseService.queryFeed({
      location: query.location || undefined,
      category: query.category || undefined,
    });
    rawJson(res, { totalStories: articles.length, articles });
  }

  /** `GET /blacknexa/stats` → engine stats */
  async stats(_req: Request, res: Response): Promise<void> {
    const count = await enterpriseService.articleCount();
    legacyJson(res, {
      totalEnterpriseArticles: count,
      categories: enterpriseService.getCategories(),
      origin: ENTERPRISE_ORIGIN,
      version: ENTERPRISE_VERSION,
    });
  }

  /**
   * `POST /blacknexa/artists/tip`
   *
   * Fields are merged from the query string and the body, in either casing, because
   * `ArtistTippingSheet.tsx` sends them as query parameters with no body at all.
   */
  async artistTip(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<ArtistTipInput>(req);
    const body = validatedBody<ArtistTipInput>(req);

    // Body wins where both are present; otherwise the query supplies the value.
    const artistId = body.artistId ?? body.artist_id ?? query.artistId ?? query.artist_id;
    const supporterUserId =
      body.supporterUserId ??
      body.supporter_user_id ??
      query.supporterUserId ??
      query.supporter_user_id;
    const tipAmountUsd =
      body.tipAmountUsd ?? body.tip_amount_usd ?? query.tipAmountUsd ?? query.tip_amount_usd;
    const message = body.message ?? query.message ?? "";

    if (!artistId || !supporterUserId || tipAmountUsd === undefined) {
      const detail = "artistId, supporterUserId, and tipAmountUsd are required.";
      rawJson(res, { success: false, detail, error: detail, message: detail }, 400);
      return;
    }

    const result = await enterpriseService.processArtistTip({
      artistId,
      supporterUserId,
      tipAmountUsd,
      message,
    });

    if (!result.success) {
      rawJson(
        res,
        { success: false, detail: result.error, error: result.error, message: result.error },
        result.status,
      );
      return;
    }

    // `success` and `record` are what the sheet checks; the flat record is retained.
    rawJson(res, { ...result.record, success: true, record: result.record }, result.status);
  }

  /**
   * `POST /blacknexa/hardware/beacon-trigger`
   *
   * Accepts snake_case (what both apps send) and camelCase. Coordinates are
   * optional and default to 0,0 — a panic press with no location fix must still be
   * logged rather than rejected.
   */
  async beaconTrigger(req: Request, res: Response): Promise<void> {
    const body = validatedBody<BeaconInput>(req);

    const userId = body.userId ?? body.user_id;
    const deviceMacAddress = body.deviceMacAddress ?? body.device_mac_address;
    const triggerType = body.triggerType ?? body.trigger_type;
    const gpsCoordinates = body.gpsCoordinates ?? body.gps_coordinates ?? { lat: 0, lon: 0 };

    if (!userId || !deviceMacAddress || !triggerType) {
      const detail = "userId, deviceMacAddress, and triggerType are required.";
      rawJson(res, { success: false, detail, error: detail }, 400);
      return;
    }

    const result = await enterpriseService.handleBeaconTrigger({
      userId,
      deviceMacAddress,
      triggerType,
      gpsCoordinates,
    });

    if (!result.success) {
      rawJson(res, { success: false, detail: result.error, error: result.error }, result.status);
      return;
    }

    rawJson(
      res,
      {
        success: true,
        status: "ARMED_AND_LOGGED",
        secureVaultSync: true,
        record: result.record,
      },
      result.status,
    );
  }

  /**
   * `GET /blacknexa/weather`
   *
   * Returns the payload both nested under `data` (what the clients read) and flat
   * (what the original returned).
   */
  async weather(req: Request, res: Response): Promise<void> {
    const { lat, lon } = validatedQuery<{ lat: number; lon: number }>(req);
    const result = await weatherService.getGlobalWeather(lat, lon);

    if (!result.success) {
      rawJson(res, { success: false, detail: result.error, error: result.error }, result.status);
      return;
    }

    rawJson(
      res,
      {
        success: true,
        data: result.data,
        coordinates: result.data.coordinates,
        currentWeather: result.data.currentWeather,
      },
      result.status,
    );
  }
}

export const enterpriseController = new EnterpriseController();
export default enterpriseController;
