/**
 * Tipping controller.
 *
 * Response shapes match `TippingDashboard.tsx`: `{ creator }`, `{ balance }`,
 * `{ payout }`, `{ tip }`, `{ data }`. The dashboard also relies on a **404 for an
 * unregistered creator** — it treats that specific status as "not registered yet"
 * and auto-registers — so the 404 paths here are load-bearing, not incidental.
 *
 * `Idempotency-Key` is read from the header, never the body, matching the original.
 * A missing key is a 400: silently generating one server-side would defeat the
 * whole purpose, since a client retry would then create a second charge.
 */

import type { Request, Response } from "express";
import tippingService from "@/services/tipping.service";
import moderationService from "@/services/moderation.service";
import queueService from "@/services/queue.service";
import { legacyJson, legacyError } from "@/utils/response.util";
import { validatedBody, validatedParams, validatedQuery } from "@/middlewares/validate.middleware";
import { DEFAULTS, SUPPORTED_TIP_CURRENCIES } from "@/config/constants";
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  MAX_TIP_USD_CENTS,
  MIN_TIP_USD_CENTS,
  type PayoutDestination,
  type SendTipRequest,
  type StripeWebhookEvent,
} from "@/types/platform.interface";

/** Read the idempotency key from the header. */
function idempotencyKey(req: Request): string {
  const value = req.get("Idempotency-Key");
  return typeof value === "string" ? value.trim() : "";
}

class TippingController {
  /** `POST /platform/tipping/creator/register` → 201 `{ success, creator }` */
  async register(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{
      userId: string;
      displayName: string;
      handle: string;
      bio?: string;
      defaultCurrency?: string;
      stripeAccountId?: string;
    }>(req);

    const creator = await tippingService.upsertCreator({
      // Deterministic id derived from the user id — the client derives the same
      // string in `creatorIdFor()` and uses it in subsequent request paths.
      id: `creator_${body.userId}`,
      userId: body.userId,
      displayName: body.displayName,
      handle: body.handle,
      bio: body.bio ?? "",
      defaultCurrency: body.defaultCurrency ?? "USD",
      stripeAccountId: body.stripeAccountId,
      // Never granted by the request: verification requires moderation review.
      verified: false,
    });

    legacyJson(res, { creator }, 201);
  }

  /** `GET /platform/tipping/creator/:id` → `{ success, creator, balance }` */
  async getCreator(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const creatorId = decodeURIComponent(id);

    const creator = await tippingService.getCreator(creatorId);
    if (!creator) {
      legacyError(res, "Creator not found", 404);
      return;
    }
    const balance = await tippingService.getCreatorBalance(creatorId);
    legacyJson(res, { creator, balance });
  }

  /** `GET /platform/tipping/creators` → `{ success, data }` */
  async listCreators(req: Request, res: Response): Promise<void> {
    const { limit } = validatedQuery<{ limit: number }>(req);
    const data = await tippingService.listCreators(limit);
    legacyJson(res, { data });
  }

  /**
   * `POST /platform/tipping/send` → 201 `{ success, tip, cached }`
   *
   * A tip message passes through moderation first: a tip is a public interaction
   * with a creator, and the message would otherwise be an unmoderated channel.
   */
  async sendTip(req: Request, res: Response): Promise<void> {
    const key = idempotencyKey(req);
    if (!key) {
      legacyError(res, "Idempotency-Key header is required", 400);
      return;
    }

    const body = validatedBody<Omit<SendTipRequest, "idempotencyKey">>(req);

    if (body.message) {
      const approved = await moderationService.contentApproved(body.message);
      if (!approved) {
        legacyError(res, "Tip message failed content moderation.", 403);
        return;
      }
    }

    const result = await tippingService.processTip({ ...body, idempotencyKey: key });
    if (!result.success) {
      // Validation failures (unverified creator, amount out of range) are 400 with
      // the service's message, which the client displays.
      legacyError(res, result.error, 400);
      return;
    }

    legacyJson(res, { tip: result.tip, cached: result.cached }, 201);

    // Confirm the payment with the provider out of band.
    await queueService.enqueue("ledger-update", {
      tipId: result.tip.id,
      provider: result.tip.provider,
    });
  }

  /** `GET /platform/tipping/tip/:id` → `{ success, tip }` */
  async getTip(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const tip = await tippingService.getTip(decodeURIComponent(id));
    if (!tip) {
      legacyError(res, "Tip not found", 404);
      return;
    }
    legacyJson(res, { tip });
  }

  /** `GET /platform/tipping/creator/:id/tips` → `{ success, data }` */
  async creatorTips(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const { limit } = validatedQuery<{ limit?: number }>(req);
    const data = await tippingService.listCreatorTips(
      decodeURIComponent(id),
      limit ?? DEFAULTS.TIPS_LIMIT,
    );
    legacyJson(res, { data });
  }

  /**
   * `GET /platform/tipping/creator/:id/balance` → `{ success, balance }`
   *
   * The 404 here is what triggers auto-registration in the dashboard.
   */
  async creatorBalance(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const balance = await tippingService.getCreatorBalance(decodeURIComponent(id));
    if (!balance) {
      legacyError(res, "Creator not found", 404);
      return;
    }
    legacyJson(res, { balance });
  }

  /** `GET /platform/tipping/creator/:id/ledger` → `{ success, data }` */
  async creatorLedger(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const { limit } = validatedQuery<{ limit?: number }>(req);
    const data = await tippingService.getCreatorLedger(
      decodeURIComponent(id),
      limit ?? DEFAULTS.LEDGER_LIMIT,
    );
    legacyJson(res, { data });
  }

  /** `GET /platform/tipping/sender/:userId/tips` → `{ success, data }` */
  async senderTips(req: Request, res: Response): Promise<void> {
    const { userId } = validatedParams<{ userId: string }>(req);
    const { limit } = validatedQuery<{ limit: number }>(req);
    const data = await tippingService.listSenderTips(decodeURIComponent(userId), limit);
    legacyJson(res, { data });
  }

  /**
   * `POST /platform/tipping/webhook/stripe` → `{ success, handled, tipId? }`
   *
   * Always answers 200 for a well-formed event, even when unhandled, so Stripe
   * does not enter a retry loop over event types this service ignores.
   */
  async stripeWebhook(req: Request, res: Response): Promise<void> {
    const event = validatedBody<StripeWebhookEvent>(req);
    const result = await tippingService.handleStripeWebhook(event);
    legacyJson(res, { ...result });
  }

  /** `GET /platform/tipping/fees` → fee and limit disclosure */
  async fees(_req: Request, res: Response): Promise<void> {
    legacyJson(res, {
      platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
      minTipUsdCents: MIN_TIP_USD_CENTS,
      maxTipUsdCents: MAX_TIP_USD_CENTS,
      supportedCurrencies: [...SUPPORTED_TIP_CURRENCIES],
    });
  }

  /** `POST /platform/tipping/payout/request` → 201 `{ success, payout, cached }` */
  async requestPayout(req: Request, res: Response): Promise<void> {
    const key = idempotencyKey(req);
    if (!key) {
      legacyError(res, "Idempotency-Key header is required", 400);
      return;
    }

    const body = validatedBody<{ creatorId: string; destination?: PayoutDestination }>(req);

    const result = await tippingService.requestPayout({
      creatorId: body.creatorId,
      idempotencyKey: key,
      destination: body.destination ?? "stripe",
    });

    if (!result.success) {
      legacyError(res, result.error, 400);
      return;
    }

    legacyJson(res, { payout: result.payout, cached: result.cached }, 201);

    await queueService.enqueue("ledger-update", {
      payoutId: result.payout.id,
      destination: result.payout.destination,
      amountUsd: result.payout.amountUsd,
    });
  }

  /** `GET /platform/tipping/payout/:id` → `{ success, payout }` */
  async getPayout(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const payout = await tippingService.getPayout(decodeURIComponent(id));
    if (!payout) {
      legacyError(res, "Payout not found", 404);
      return;
    }
    legacyJson(res, { payout });
  }

  /** `GET /platform/tipping/creator/:id/payouts` → `{ success, data }` */
  async creatorPayouts(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const { limit } = validatedQuery<{ limit?: number }>(req);
    const data = await tippingService.listCreatorPayouts(
      decodeURIComponent(id),
      limit ?? DEFAULTS.PAYOUTS_LIMIT,
    );
    legacyJson(res, { data });
  }

  /**
   * `POST /platform/tipping/payout/:id/status` → `{ success, payout }`
   *
   * Admin-guarded: in the Worker this route was open, meaning anyone could mark a
   * payout `succeeded` and make the ledger disagree with reality.
   */
  async updatePayoutStatus(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{
      status: "requested" | "processing" | "succeeded" | "failed";
      providerTransferId?: string;
      failureReason?: string;
    }>(req);

    const updated = await tippingService.updatePayoutStatus(
      decodeURIComponent(id),
      body.status,
      body.providerTransferId,
      body.failureReason,
    );
    if (!updated) {
      legacyError(res, "Payout not found", 404);
      return;
    }
    legacyJson(res, { payout: updated });
  }
}

export const tippingController = new TippingController();
export default tippingController;
