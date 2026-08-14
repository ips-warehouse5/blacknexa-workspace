/**
 * Platform controller — news facade, cache/queue ops, compliance, persistence.
 *
 * All response shapes are preserved from the Worker. The ops and persistence
 * routes are admin-guarded at the router: `POST /platform/persistence/restore` and
 * `POST /platform/queue/drain` were fully open before, and a restore in particular
 * writes across eleven tables.
 */

import type { Request, Response } from "express";
import platformNewsService, { ALL_PLATFORM_CATEGORIES } from "@/services/platform_news.service";
import platformCacheService from "@/services/platform_cache.service";
import queueService from "@/services/queue.service";
import moderationService from "@/services/moderation.service";
import tosService, { TECH_PROVIDER_DISCLAIMER } from "@/services/tos.service";
import persistenceService from "@/services/persistence.service";
import { legacyJson, legacyError } from "@/utils/response.util";
import { resolveOrigin } from "@/utils/origin.util";
import { validatedBody, validatedQuery } from "@/middlewares/validate.middleware";
import { PLATFORM_LOCALES } from "@/config/constants";
import { CURRENT_TOS_VERSION, type PlatformCategory } from "@/types/platform.interface";
import type { PersistenceSnapshot } from "@/types/persistence.interface";

class PlatformController {
  /** `GET /api/v1/platform/ping` */
  async ping(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      ok: true,
      now: new Date().toISOString(),
      platform: "blacknexa-platform-engine",
    });
  }

  // ── Module 1: news facade ──────────────────────────────────────────────────

  /** `GET /platform/news/feed` → `{ success, locale, category, categoryLabel, total, data }` */
  async newsFeed(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      category?: PlatformCategory;
      locale: string;
      limit: number;
    }>(req);

    const result = await platformNewsService.getFeed({
      category: query.category,
      locale: query.locale,
      limit: query.limit,
      origin: resolveOrigin(req),
    });
    legacyJson(res, result);
  }

  /** `GET /platform/news/categories` → `{ success, data }` */
  async newsCategories(_req: Request, res: Response): Promise<void> {
    legacyJson(res, { data: platformNewsService.listCategories() });
  }

  /** `GET /platform/news/locales` → `{ success, data }` */
  async newsLocales(_req: Request, res: Response): Promise<void> {
    legacyJson(res, { data: [...PLATFORM_LOCALES] });
  }

  // ── Module 3: cache and queue ops ──────────────────────────────────────────

  /** `GET /platform/cache/stats` */
  async cacheStats(_req: Request, res: Response): Promise<void> {
    const stats = await platformCacheService.stats();
    legacyJson(res, stats);
  }

  /** `POST /platform/cache/prune` → `{ success, pruned }` */
  async cachePrune(_req: Request, res: Response): Promise<void> {
    const pruned = await platformCacheService.pruneExpired();
    legacyJson(res, { pruned });
  }

  /** `GET /platform/queue/stats` */
  async queueStats(_req: Request, res: Response): Promise<void> {
    const stats = await queueService.stats();
    legacyJson(res, stats);
  }

  /** `POST /platform/queue/drain` → `{ success, processed }` */
  async queueDrain(req: Request, res: Response): Promise<void> {
    const { limit } = validatedQuery<{ limit: number }>(req);
    const processed = await queueService.drain(limit);
    legacyJson(res, { processed });
  }

  /** `POST /platform/queue/prune` → `{ success, pruned }` */
  async queuePrune(req: Request, res: Response): Promise<void> {
    const { days } = validatedQuery<{ days: number }>(req);
    const pruned = await queueService.pruneOldJobs(days);
    legacyJson(res, { pruned });
  }

  // ── Module 4: compliance ───────────────────────────────────────────────────

  /** `POST /platform/moderation/check` → `{ success, approved, flaggedTerms, ... }` */
  async moderationCheck(req: Request, res: Response): Promise<void> {
    const { text } = validatedBody<{ text: string }>(req);
    const result = await moderationService.moderateContent(text);
    legacyJson(res, { ...result });
  }

  /**
   * `POST /platform/tos/agree` → 201 `{ success, agreement }`
   *
   * `req.ip` replaces the Worker's `CF-Connecting-IP`; behind a proxy this is only
   * the real client address when `TRUST_PROXY` is configured, and the record is
   * only evidentiary if it is.
   */
  async tosAgree(req: Request, res: Response): Promise<void> {
    const { userId } = validatedBody<{ userId: string }>(req);
    const agreement = await tosService.recordAgreement(userId, {
      ipAddress: req.ip ?? "",
      userAgent: req.get("User-Agent") ?? "",
    });
    legacyJson(res, { agreement }, 201);
  }

  /** `GET /platform/tos/check` → `{ success, agreed, tosVersion }` */
  async tosCheck(req: Request, res: Response): Promise<void> {
    const { userId } = validatedQuery<{ userId: string }>(req);
    const agreed = await tosService.hasCurrentTos(userId);
    legacyJson(res, { agreed, tosVersion: CURRENT_TOS_VERSION });
  }

  /** `GET /platform/tos/text` → `{ success, text, version }` */
  async tosText(_req: Request, res: Response): Promise<void> {
    legacyJson(res, { text: tosService.getTosText(), version: CURRENT_TOS_VERSION });
  }

  /** `GET /platform/compliance/disclaimer` → the disclaimer spread at top level */
  async complianceDisclaimer(_req: Request, res: Response): Promise<void> {
    legacyJson(res, { ...TECH_PROVIDER_DISCLAIMER });
  }

  /** `GET /platform/compliance/status` → overall posture */
  async complianceStatus(_req: Request, res: Response): Promise<void> {
    const [cacheStats, queueStats] = await Promise.all([
      platformCacheService.stats(),
      queueService.stats(),
    ]);

    legacyJson(res, {
      techProvider: TECH_PROVIDER_DISCLAIMER,
      tosVersion: CURRENT_TOS_VERSION,
      cacheStats,
      queueStats,
      gdprCompliant: true,
      ccpaCompliant: true,
      encryptionStandard: "AES-256-GCM",
      contentModerationActive: true,
    });
  }

  // ── Zero-Data-Loss persistence ─────────────────────────────────────────────

  /** `GET /platform/persistence/snapshot` → `{ success, id, ...snapshot }` */
  async snapshot(_req: Request, res: Response): Promise<void> {
    const snapshot = await persistenceService.snapshotAllTables();
    const id = await persistenceService.storeSnapshot(snapshot, true);
    legacyJson(res, { id, ...snapshot });
  }

  /**
   * `POST /platform/persistence/restore` → merge result
   *
   * Append-only: existing rows always win, so this can never be used
   * destructively. With no JSON body it merges the most recent stored snapshot.
   * A partial merge returns 207 to signal "succeeded with per-row errors", as the
   * original did.
   */
  async restore(req: Request, res: Response): Promise<void> {
    let snapshot: PersistenceSnapshot | null = null;

    const contentType = req.get("Content-Type") ?? "";
    if (contentType.includes("application/json") && req.body && Object.keys(req.body).length > 0) {
      snapshot = validatedBody<PersistenceSnapshot>(req);
    } else {
      const latest = await persistenceService.getLatestSnapshot();
      snapshot = latest?.snapshot ?? null;
    }

    if (!snapshot || !snapshot.tables) {
      legacyError(res, "No snapshot available to restore.", 404);
      return;
    }

    const result = await persistenceService.mergeSnapshot(snapshot);
    // 207 signals "merged, with per-row errors" — the errors array names them.
    res.status(result.errors.length === 0 ? 200 : 207).json({ ...result });
  }

  /** `GET /platform/persistence/integrity` → integrity report */
  async integrity(_req: Request, res: Response): Promise<void> {
    const result = await persistenceService.integrityCheck();
    res.status(200).json({ ...result });
  }

  /** `GET /platform/persistence/snapshots` → `{ success, data }` */
  async listSnapshots(req: Request, res: Response): Promise<void> {
    const { limit } = validatedQuery<{ limit: number }>(req);
    const data = await persistenceService.listSnapshots(limit);
    legacyJson(res, { data });
  }
}

export const platformController = new PlatformController();
export default platformController;
