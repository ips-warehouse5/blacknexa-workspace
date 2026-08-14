/**
 * Global Creator Tipping & Seed Drop engine.
 *
 * Ported from `platform/tipping.ts`. This is the money path, so the invariants
 * are stated plainly:
 *
 *   • **All amounts are integer USD cents.** Never floats. The platform
 *     reconciles across 14 currencies and float drift in a ledger is unacceptable.
 *   • **Idempotency is enforced by a UNIQUE constraint**, not just by the replay
 *     table. A retried request returns the original response; it cannot create a
 *     second charge even under a race.
 *   • **The ledger is append-only.** A refund, failed payment, or failed payout is
 *     a new compensating entry, never an edit or a delete.
 *   • **The platform never holds funds.** Rows here record what regulated
 *     providers (Stripe/Apple/Google) actually move — see the Technology Provider
 *     Protection disclaimer in `tos.service.ts`.
 *
 * Hardening over the original: the tip write and its ledger entry now run inside
 * a transaction, and the running balance is read `FOR UPDATE`. DO-SQLite gave
 * that atomicity implicitly through single-threaded execution; Postgres needs it
 * declared, otherwise two concurrent tips to the same creator could compute the
 * same `balance_after_usd`.
 */

import { Op, QueryTypes, type Transaction } from "sequelize";
import sequelize from "@/config/database.config";
import logger from "@/utils/logger.util";
import Creator from "@/models/creator.model";
import Tip from "@/models/tip.model";
import LedgerEntry from "@/models/ledger_entry.model";
import Payout from "@/models/payout.model";
import { IdempotencyReplay } from "@/models/platform_cache.model";
import platformCacheService, { CACHE_TTL } from "@/services/platform_cache.service";
import { prefixedId } from "@/utils/id.util";
import { DEFAULTS } from "@/config/constants";
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  MAX_TIP_USD_CENTS,
  MIN_TIP_USD_CENTS,
  PAYOUT_FEE_USD_CENTS,
  type CreatorBalance,
  type CreatorProfile,
  type CurrencyCode,
  type LedgerEntry as LedgerEntryDto,
  type PaymentProvider,
  type Payout as PayoutDto,
  type PayoutDestination,
  type PayoutRequest,
  type PayoutStatus,
  type SendTipRequest,
  type StripeWebhookEvent,
  type Tip as TipDto,
  type TipStatus,
} from "@/types/platform.interface";

/**
 * Conservative fixed rates to USD. In production these would come from a rates
 * API; the original used static values updated periodically and the same table is
 * kept so historical amounts remain comparable.
 */
const USD_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0067,
  KES: 0.0078,
  NGN: 0.00067,
  ZAR: 0.054,
  BRL: 0.2,
  INR: 0.012,
  CNY: 0.14,
  GHS: 0.077,
  ETB: 0.018,
};

export type SendTipResult =
  | { success: true; tip: TipDto; cached: boolean }
  | { success: false; error: string };

export type PayoutResult =
  | { success: true; payout: PayoutDto; cached: boolean }
  | { success: false; error: string };

class TippingService {
  // ── Currency ───────────────────────────────────────────────────────────────

  /** Convert a minor-unit amount in `currency` to USD cents. */
  toUsdCents(amount: number, currency: CurrencyCode): number {
    const rate = USD_RATES[currency.toUpperCase()] ?? 1.0;
    return Math.round(amount * rate);
  }

  /** Convert USD cents back to a display amount in `currency`. */
  fromUsdCents(usdCents: number, currency: CurrencyCode): number {
    const rate = USD_RATES[currency.toUpperCase()] ?? 1.0;
    return Math.round((usdCents / rate) * 100) / 100;
  }

  /** Format USD cents for a user-facing message. */
  private formatUsd(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  // ── Idempotency ────────────────────────────────────────────────────────────

  private async getReplay<T>(key: string): Promise<T | null> {
    const row = await IdempotencyReplay.findByPk(key);
    return row ? (row.response_json as T) : null;
  }

  private async setReplay(
    key: string,
    response: Record<string, unknown>,
    transaction?: Transaction,
  ): Promise<void> {
    await IdempotencyReplay.upsert(
      { key, response_json: response, created_at: new Date().toISOString() },
      { transaction },
    );
  }

  // ── Creators ───────────────────────────────────────────────────────────────

  /**
   * Register or update a creator.
   *
   * `verified` defaults to false — verification requires moderation review, so a
   * self-registration cannot immediately start receiving tips.
   */
  async upsertCreator(
    profile: Omit<CreatorProfile, "createdAt" | "verified"> & { verified?: boolean },
  ): Promise<CreatorProfile> {
    const id = profile.id || prefixedId("creator");
    const now = new Date().toISOString();

    await Creator.upsert({
      id,
      user_id: profile.userId,
      display_name: profile.displayName,
      handle: profile.handle,
      bio: profile.bio ?? "",
      default_currency: profile.defaultCurrency ?? "USD",
      stripe_account_id: profile.stripeAccountId ?? null,
      verified: profile.verified ?? false,
      created_at: now,
    });

    return {
      id,
      userId: profile.userId,
      displayName: profile.displayName,
      handle: profile.handle,
      bio: profile.bio ?? "",
      defaultCurrency: profile.defaultCurrency ?? "USD",
      stripeAccountId: profile.stripeAccountId,
      verified: profile.verified ?? false,
      createdAt: now,
    };
  }

  async getCreator(creatorId: string): Promise<CreatorProfile | null> {
    const row = await Creator.findByPk(creatorId);
    return row ? this.rowToCreator(row) : null;
  }

  async getCreatorByHandle(handle: string): Promise<CreatorProfile | null> {
    const row = await Creator.findOne({ where: { handle } });
    return row ? this.rowToCreator(row) : null;
  }

  /** Verified creators only — this feeds a public discovery list. */
  async listCreators(limit = DEFAULTS.CREATORS_LIMIT): Promise<CreatorProfile[]> {
    const rows = await Creator.findAll({
      where: { verified: true },
      order: [["created_at", "DESC"]],
      limit,
    });
    return rows.map((r) => this.rowToCreator(r));
  }

  private rowToCreator(r: Creator): CreatorProfile {
    return {
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      handle: r.handle,
      bio: r.bio,
      defaultCurrency: r.default_currency,
      stripeAccountId: r.stripe_account_id ?? undefined,
      verified: r.verified,
      createdAt: r.created_at,
    };
  }

  // ── Tips ───────────────────────────────────────────────────────────────────

  /**
   * Process a tip: idempotency → creator validation → amount validation → fee
   * split → insert → ledger append → cache invalidation, all in one transaction.
   */
  async processTip(req: SendTipRequest): Promise<SendTipResult> {
    // 1. Replay an already-processed key rather than charging twice.
    const replay = await this.getReplay<{ success: true; tip: TipDto }>(req.idempotencyKey);
    if (replay?.tip) {
      return { success: true, tip: replay.tip, cached: true };
    }

    // 2. The creator must exist and be verified — unless this is a platform-funded
    //    Seed Drop, which is how a new creator receives their first micro-grant.
    const creator = await this.getCreator(req.creatorId);
    if (!creator) return { success: false, error: "Creator not found." };
    if (!creator.verified && !req.isSeedDrop) {
      return { success: false, error: "Creator is not verified to receive tips." };
    }

    // 3. Amount bounds, in USD cents. The upper bound is an anti-fraud limit.
    const amountUsdCents = this.toUsdCents(req.amount, req.currency);
    if (amountUsdCents < MIN_TIP_USD_CENTS) {
      return { success: false, error: `Minimum tip amount is $${MIN_TIP_USD_CENTS / 100} USD.` };
    }
    if (amountUsdCents > MAX_TIP_USD_CENTS) {
      return { success: false, error: `Maximum tip amount is $${MAX_TIP_USD_CENTS / 100} USD.` };
    }

    // 4. Fee split.
    const platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT;
    const platformFeeUsd = Math.round((amountUsdCents * platformFeePercent) / 100);
    const netToCreatorUsd = amountUsdCents - platformFeeUsd;

    const tipId = prefixedId("tip");
    const now = new Date().toISOString();
    const provider: PaymentProvider = "stripe"; // the webhook confirms the status

    const tip: TipDto = {
      id: tipId,
      idempotencyKey: req.idempotencyKey,
      senderUserId: req.senderUserId,
      creatorId: req.creatorId,
      amount: Math.round(req.amount),
      currency: req.currency.toUpperCase(),
      amountUsd: amountUsdCents,
      platformFeePercent,
      platformFeeUsd,
      netToCreatorUsd,
      provider,
      status: "pending",
      message: req.message,
      isSeedDrop: req.isSeedDrop ?? false,
      createdAt: now,
    };

    try {
      await sequelize.transaction(async (transaction) => {
        await Tip.create(
          {
            id: tipId,
            idempotency_key: req.idempotencyKey,
            sender_user_id: req.senderUserId,
            creator_id: req.creatorId,
            amount: Math.round(req.amount),
            currency: req.currency.toUpperCase(),
            amount_usd: amountUsdCents,
            platform_fee_percent: platformFeePercent,
            platform_fee_usd: platformFeeUsd,
            net_to_creator_usd: netToCreatorUsd,
            provider_transaction_id: null,
            provider,
            status: "pending",
            message: req.message ?? null,
            is_seed_drop: req.isSeedDrop ?? false,
            created_at: now,
            settled_at: null,
          },
          { transaction },
        );

        await this.appendLedgerEntry(
          {
            creatorId: req.creatorId,
            tipId,
            type: "credit",
            amountUsd: netToCreatorUsd,
            description: req.isSeedDrop
              ? "Seed Drop micro-grant"
              : `Tip from ${req.senderUserId.slice(0, 8)}`,
            createdAt: now,
          },
          transaction,
        );

        await this.setReplay(req.idempotencyKey, { success: true, tip }, transaction);
      });
    } catch (err) {
      // The UNIQUE constraint on idempotency_key is the real double-spend guard:
      // if two identical requests race, one insert loses and we replay the winner.
      const existing = await Tip.findOne({ where: { idempotency_key: req.idempotencyKey } });
      if (existing) {
        return { success: true, tip: this.rowToTip(existing), cached: true };
      }
      throw err;
    }

    await platformCacheService.delete(platformCacheService.creatorBalanceKey(req.creatorId));
    return { success: true, tip, cached: false };
  }

  /**
   * Update a tip's status, normally from the Stripe webhook.
   *
   * A failure or refund appends a compensating debit rather than reversing the
   * original credit, so the ledger remains a complete history.
   */
  async updateTipStatus(
    tipId: string,
    status: TipStatus,
    providerTransactionId?: string,
  ): Promise<TipDto | null> {
    const settledAt =
      status === "succeeded" || status === "failed" ? new Date().toISOString() : null;

    const existing = await Tip.findByPk(tipId);
    if (!existing) return null;

    await Tip.update(
      {
        status,
        provider_transaction_id: providerTransactionId ?? existing.provider_transaction_id,
        settled_at: settledAt ?? existing.settled_at,
      },
      { where: { id: tipId } },
    );

    if (status === "failed" || status === "refunded") {
      const tip = await this.getTip(tipId);
      if (tip) {
        await sequelize.transaction(async (transaction) => {
          await this.appendLedgerEntry(
            {
              creatorId: tip.creatorId,
              tipId,
              type: "debit",
              amountUsd: -tip.netToCreatorUsd,
              description: `${status === "refunded" ? "Refund" : "Failed payment"} reversal`,
              createdAt: new Date().toISOString(),
            },
            transaction,
          );
        });
        await platformCacheService.delete(
          platformCacheService.creatorBalanceKey(tip.creatorId),
        );
      }
    }

    return this.getTip(tipId);
  }

  async getTip(tipId: string): Promise<TipDto | null> {
    const row = await Tip.findByPk(tipId);
    return row ? this.rowToTip(row) : null;
  }

  async listCreatorTips(creatorId: string, limit = DEFAULTS.TIPS_LIMIT): Promise<TipDto[]> {
    const rows = await Tip.findAll({
      where: { creator_id: creatorId },
      order: [["created_at", "DESC"]],
      limit,
    });
    return rows.map((r) => this.rowToTip(r));
  }

  async listSenderTips(senderUserId: string, limit = DEFAULTS.TIPS_LIMIT): Promise<TipDto[]> {
    const rows = await Tip.findAll({
      where: { sender_user_id: senderUserId },
      order: [["created_at", "DESC"]],
      limit,
    });
    return rows.map((r) => this.rowToTip(r));
  }

  private rowToTip(r: Tip): TipDto {
    return {
      id: r.id,
      idempotencyKey: r.idempotency_key,
      senderUserId: r.sender_user_id,
      creatorId: r.creator_id,
      amount: r.amount,
      currency: r.currency,
      amountUsd: r.amount_usd,
      platformFeePercent: r.platform_fee_percent,
      platformFeeUsd: r.platform_fee_usd,
      netToCreatorUsd: r.net_to_creator_usd,
      providerTransactionId: r.provider_transaction_id ?? undefined,
      provider: r.provider,
      status: r.status,
      message: r.message ?? undefined,
      isSeedDrop: r.is_seed_drop,
      createdAt: r.created_at,
      settledAt: r.settled_at ?? undefined,
    };
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────

  /**
   * Append an immutable ledger entry, carrying the running balance forward.
   *
   * The prior balance is read with `FOR UPDATE` inside the caller's transaction so
   * two concurrent writes for the same creator serialise instead of both reading
   * the same `balance_after_usd`.
   */
  private async appendLedgerEntry(
    entry: {
      creatorId: string;
      tipId: string;
      referenceId?: string;
      type: LedgerEntryDto["type"];
      amountUsd: number;
      description: string;
      createdAt: string;
    },
    transaction: Transaction,
  ): Promise<void> {
    const rows = await sequelize.query<{ balance_after_usd: number }>(
      `SELECT balance_after_usd
         FROM ledger
        WHERE creator_id = :creatorId
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      {
        replacements: { creatorId: entry.creatorId },
        type: QueryTypes.SELECT,
        transaction,
      },
    );

    const currentBalance = rows[0]?.balance_after_usd ?? 0;
    const newBalance = currentBalance + entry.amountUsd;

    await LedgerEntry.create(
      {
        id: prefixedId("led"),
        creator_id: entry.creatorId,
        // Payout entries carry the payout id here, matching the original layout.
        tip_id: entry.tipId || entry.referenceId || "",
        type: entry.type,
        amount_usd: entry.amountUsd,
        balance_after_usd: newBalance,
        description: entry.description,
        created_at: entry.createdAt,
      },
      { transaction },
    );
  }

  /** The creator's ledger, newest first — this is the transparency surface. */
  async getCreatorLedger(
    creatorId: string,
    limit = DEFAULTS.LEDGER_LIMIT,
  ): Promise<LedgerEntryDto[]> {
    const rows = await LedgerEntry.findAll({
      where: { creator_id: creatorId },
      order: [["created_at", "DESC"]],
      limit,
    });
    return rows.map((r) => ({
      id: r.id,
      creatorId: r.creator_id,
      tipId: r.tip_id,
      type: r.type,
      amountUsd: r.amount_usd,
      balanceAfterUsd: r.balance_after_usd,
      description: r.description,
      createdAt: r.created_at,
    }));
  }

  // ── Balance ────────────────────────────────────────────────────────────────

  /**
   * Balance summary, cached for 30 seconds and invalidated on every write.
   *
   * `available` counts only succeeded tips; pending tips are reported separately
   * so a creator is never shown money they cannot withdraw yet.
   */
  async getCreatorBalance(creatorId: string): Promise<CreatorBalance | null> {
    const cacheKey = platformCacheService.creatorBalanceKey(creatorId);
    const cached = await platformCacheService.get<CreatorBalance>(cacheKey);
    if (cached) return cached;

    const creator = await this.getCreator(creatorId);
    if (!creator) return null;

    const [succeeded, pending, total] = await Promise.all([
      Tip.sum("net_to_creator_usd", { where: { creator_id: creatorId, status: "succeeded" } }),
      Tip.sum("net_to_creator_usd", { where: { creator_id: creatorId, status: "pending" } }),
      Tip.findAndCountAll({
        where: { creator_id: creatorId, status: { [Op.in]: ["succeeded", "pending"] } },
        attributes: ["amount_usd"],
      }),
    ]);

    const totalReceivedUsd = total.rows.reduce((sum, r) => sum + r.amount_usd, 0);

    const balance: CreatorBalance = {
      creatorId,
      // Sequelize's SUM returns null for an empty set.
      availableUsd: succeeded ?? 0,
      pendingUsd: pending ?? 0,
      totalReceivedUsd,
      totalTips: total.count,
      currency: creator.defaultCurrency,
    };

    await platformCacheService.set(cacheKey, balance, CACHE_TTL.CREATOR_BALANCE);
    return balance;
  }

  // ── Payouts ────────────────────────────────────────────────────────────────

  /** Sum of payouts that are requested, processing, or already paid. */
  private async getTotalPayoutsUsd(creatorId: string): Promise<number> {
    const total = await Payout.sum("amount_usd", {
      where: {
        creator_id: creatorId,
        status: { [Op.in]: ["requested", "processing", "succeeded"] },
      },
    });
    return total ?? 0;
  }

  /**
   * Withdrawable balance: succeeded tips minus everything already claimed.
   *
   * Counting in-flight payouts is what prevents a creator from withdrawing the
   * same balance twice before the first transfer settles.
   */
  private async computeAvailableForPayout(creatorId: string): Promise<number> {
    const succeeded = await Tip.sum("net_to_creator_usd", {
      where: { creator_id: creatorId, status: "succeeded" },
    });
    const alreadyPaidOut = await this.getTotalPayoutsUsd(creatorId);
    return (succeeded ?? 0) - alreadyPaidOut;
  }

  /**
   * Request a withdrawal of the full available balance.
   *
   * The client-supplied idempotency key prevents a retried tap from creating two
   * transfers; the UNIQUE constraint backs it up under a race.
   */
  async requestPayout(req: PayoutRequest): Promise<PayoutResult> {
    const replayKey = `payout:${req.idempotencyKey}`;
    const replay = await this.getReplay<{ success: true; payout: PayoutDto }>(replayKey);
    if (replay?.payout) {
      return { success: true, payout: replay.payout, cached: true };
    }

    const creator = await this.getCreator(req.creatorId);
    if (!creator) return { success: false, error: "Creator not found." };

    const availableUsd = await this.computeAvailableForPayout(req.creatorId);
    if (availableUsd <= 0) {
      return { success: false, error: "No available balance to withdraw." };
    }

    const amountUsd = availableUsd;
    const payoutFeeUsd = PAYOUT_FEE_USD_CENTS;
    const netAmountUsd = amountUsd - payoutFeeUsd;

    if (netAmountUsd <= 0) {
      return {
        success: false,
        error: `Available balance (${this.formatUsd(amountUsd)}) is too low to cover the withdrawal fee (${this.formatUsd(payoutFeeUsd)}).`,
      };
    }

    const payoutId = prefixedId("payout");
    const now = new Date().toISOString();
    const destination: PayoutDestination = req.destination;

    const payout: PayoutDto = {
      id: payoutId,
      creatorId: req.creatorId,
      amountUsd,
      payoutFeeUsd,
      netAmountUsd,
      destination,
      status: "requested",
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
    };

    try {
      await sequelize.transaction(async (transaction) => {
        await Payout.create(
          {
            id: payoutId,
            creator_id: req.creatorId,
            amount_usd: amountUsd,
            payout_fee_usd: payoutFeeUsd,
            net_amount_usd: netAmountUsd,
            destination,
            provider_transfer_id: null,
            status: "requested",
            idempotency_key: req.idempotencyKey,
            created_at: now,
            processed_at: null,
            failure_reason: null,
          },
          { transaction },
        );

        await this.appendLedgerEntry(
          {
            creatorId: req.creatorId,
            tipId: "",
            referenceId: payoutId,
            type: "payout",
            amountUsd: -amountUsd,
            description: `Payout to ${destination} (${this.formatUsd(netAmountUsd)} net)`,
            createdAt: now,
          },
          transaction,
        );

        await this.setReplay(replayKey, { success: true, payout }, transaction);
      });
    } catch (err) {
      const existing = await Payout.findOne({
        where: { idempotency_key: req.idempotencyKey },
      });
      if (existing) {
        return { success: true, payout: this.rowToPayout(existing), cached: true };
      }
      throw err;
    }

    await platformCacheService.delete(platformCacheService.creatorBalanceKey(req.creatorId));
    return { success: true, payout, cached: false };
  }

  async listCreatorPayouts(
    creatorId: string,
    limit = DEFAULTS.PAYOUTS_LIMIT,
  ): Promise<PayoutDto[]> {
    const rows = await Payout.findAll({
      where: { creator_id: creatorId },
      order: [["created_at", "DESC"]],
      limit,
    });
    return rows.map((r) => this.rowToPayout(r));
  }

  async getPayout(payoutId: string): Promise<PayoutDto | null> {
    const row = await Payout.findByPk(payoutId);
    return row ? this.rowToPayout(row) : null;
  }

  /**
   * Transition a payout's status. A failure restores the balance with a
   * compensating `adjustment` entry rather than deleting the payout debit.
   */
  async updatePayoutStatus(
    payoutId: string,
    status: PayoutStatus,
    providerTransferId?: string,
    failureReason?: string,
  ): Promise<PayoutDto | null> {
    const existing = await Payout.findByPk(payoutId);
    if (!existing) return null;

    const processedAt =
      status === "succeeded" || status === "failed" ? new Date().toISOString() : null;

    await Payout.update(
      {
        status,
        provider_transfer_id: providerTransferId ?? existing.provider_transfer_id,
        processed_at: processedAt ?? existing.processed_at,
        failure_reason: failureReason ?? existing.failure_reason,
      },
      { where: { id: payoutId } },
    );

    if (status === "failed") {
      const payout = await this.getPayout(payoutId);
      if (payout) {
        await sequelize.transaction(async (transaction) => {
          await this.appendLedgerEntry(
            {
              creatorId: payout.creatorId,
              tipId: "",
              referenceId: payoutId,
              type: "adjustment",
              amountUsd: payout.amountUsd,
              description: "Payout failed — balance restored",
              createdAt: new Date().toISOString(),
            },
            transaction,
          );
        });
        await platformCacheService.delete(
          platformCacheService.creatorBalanceKey(payout.creatorId),
        );
      }
    }

    return this.getPayout(payoutId);
  }

  private rowToPayout(r: Payout): PayoutDto {
    return {
      id: r.id,
      creatorId: r.creator_id,
      amountUsd: r.amount_usd,
      payoutFeeUsd: r.payout_fee_usd,
      netAmountUsd: r.net_amount_usd,
      destination: r.destination,
      providerTransferId: r.provider_transfer_id ?? undefined,
      status: r.status,
      idempotencyKey: r.idempotency_key,
      createdAt: r.created_at,
      processedAt: r.processed_at ?? undefined,
      failureReason: r.failure_reason ?? undefined,
    };
  }

  // ── Stripe webhook ─────────────────────────────────────────────────────────

  /**
   * Handle a Stripe event, keyed by the `tipId` we set in the payment metadata.
   *
   * Unknown event types are acknowledged as `handled: false` rather than erroring,
   * so Stripe does not retry events this service does not care about.
   */
  async handleStripeWebhook(
    event: StripeWebhookEvent,
  ): Promise<{ handled: boolean; tipId?: string }> {
    const tipId = event.data?.object?.metadata?.tipId;
    if (!tipId) return { handled: false };

    const tip = await this.getTip(tipId);
    if (!tip) return { handled: false };

    switch (event.type) {
      case "payment_intent.succeeded":
      case "charge.succeeded":
        await this.updateTipStatus(tipId, "succeeded", event.data.object.id);
        return { handled: true, tipId };

      case "payment_intent.payment_failed":
      case "charge.failed":
        await this.updateTipStatus(tipId, "failed", event.data.object.id);
        return { handled: true, tipId };

      case "charge.refunded":
        await this.updateTipStatus(tipId, "refunded", event.data.object.id);
        return { handled: true, tipId };

      default:
        logger.info("[tipping] unhandled stripe event", { type: event.type });
        return { handled: false };
    }
  }
}

export const tippingService = new TippingService();
export default tippingService;
