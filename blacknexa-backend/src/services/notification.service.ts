/**
 * Notifications — screen B3, and the four types screen A11 names.
 *
 * ── The promise this file enforces ─────────────────────────────────────────
 * A11 lists exactly four kinds and says of the fourth: "Rare, and for your area
 * only. **These cannot be turned off.**" So `urgent_safety` bypasses the
 * preference check, and it does so *here* — a client-side check is not an
 * enforcement, and a server that respected the preference would break a promise
 * the app makes in writing.
 *
 * The same screen also says "No digests, no marketing, no engagement nudges."
 * There is deliberately no method here for a digest or a re-engagement nudge.
 * Adding one is a change to the promise, not a feature.
 *
 * ── Why B3 reads the table, not the push log ───────────────────────────────
 * Push is lossy: a device can be offline, a token can go stale, a permission can
 * be revoked. The notification centre has to be complete, so the row is the
 * record and the push is a best-effort copy.
 */

import { Op } from "sequelize";
import env from "@/config/env.config";
import logger, { runBackground } from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { AppUser, UserSession } from "@/models/app_user.model";
import { Notification } from "@/models/report_social.model";
import type { NotificationType } from "@/types/report.interface";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PAGE_SIZE = 30;

/** What B3 renders: one title, one line, one timestamp. */
export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface CreateNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  reportId?: string;
}

class NotificationService {
  /** `urgent_safety` is exempt from the preference — see the file header. */
  private ignoresPreference(type: NotificationType): boolean {
    return type === "urgent_safety";
  }

  /**
   * Write a notification and, where allowed, push it.
   *
   * The row is always written: even a member who has notifications off should see
   * their report's status change when they next open B3. The *push* is what the
   * preference governs.
   */
  async create(input: CreateNotification): Promise<void> {
    const createdAt = nowIso();
    const row = await Notification.create({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      report_id: input.reportId ?? null,
      created_at: createdAt,
    });

    runBackground(this.push(row.id, input), "push notification");
  }

  /** Deliver to every live session for the member. */
  private async push(notificationId: string, input: CreateNotification): Promise<void> {
    if (!env.push.enabled) return;

    const user = await AppUser.findByPk(input.userId);
    if (!user || user.status !== "active") return;

    if (!user.notifications_enabled && !this.ignoresPreference(input.type)) return;

    const sessions = await UserSession.findAll({
      where: { user_id: input.userId, revoked_at: null, push_token: { [Op.ne]: null } },
    });
    const tokens = sessions.map((session) => session.push_token).filter(Boolean) as string[];
    if (tokens.length === 0) return;

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.push.expoAccessToken}`,
        },
        body: JSON.stringify(
          tokens.map((token) => ({
            to: token,
            title: input.title,
            body: input.body ?? "",
            // Every push carries its destination: a notification that dumps the
            // reader on the feed to go hunting is a failed notification.
            data: { link: input.link ?? null, reportId: input.reportId ?? null },
            sound: input.type === "urgent_safety" ? "default" : null,
            priority: input.type === "urgent_safety" ? "high" : "normal",
          })),
        ),
      });
      if (!response.ok) {
        logger.warn("[push] delivery rejected", { status: response.status });
        return;
      }
      await Notification.update({ pushed_at: nowIso() }, { where: { id: notificationId } });
    } catch (err) {
      logger.warn("[push] delivery failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** B3's list, newest first, cursored on `created_at`. */
  async list(
    userId: string,
    cursor: string | undefined,
    limit = PAGE_SIZE,
  ): Promise<{ items: NotificationView[]; nextCursor: string | null; unread: number }> {
    const where: Record<string, unknown> = { user_id: userId };
    if (cursor) where.created_at = { [Op.lt]: cursor };

    const size = Math.min(limit, 50);
    const rows = await Notification.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: size + 1,
    });

    const hasMore = rows.length > size;
    const page = hasMore ? rows.slice(0, size) : rows;

    // Drives the accent dot on B1's bell.
    const unread = await Notification.count({ where: { user_id: userId, read_at: null } });

    return {
      items: page.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        read: Boolean(row.read_at),
        createdAt: row.created_at,
      })),
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].created_at : null,
      unread,
    };
  }

  /** B3's "Mark all read" — one call, as the screen implies. */
  async markAllRead(userId: string): Promise<number> {
    const [count] = await Notification.update(
      { read_at: nowIso() },
      { where: { user_id: userId, read_at: null } },
    );
    return count;
  }

  /**
   * An area broadcast — A11's fourth type.
   *
   * Reaches every active member regardless of their notification preference,
   * because that is what the screen promises. Scoped by area where a geohash
   * prefix is supplied; a broadcast with no scope is refused rather than sent to
   * everyone, since "for your area only" is part of the same promise.
   */
  async broadcastUrgent(
    geohashPrefix: string,
    title: string,
    body: string,
  ): Promise<{ recipients: number }> {
    if (!geohashPrefix.trim()) {
      throw new Error("An urgent broadcast must name an area.");
    }

    // Members are located by the areas they have reported from, which is the only
    // location signal the app stores per account.
    const { Report } = await import("@/models/report.model");
    const nearby = await Report.findAll({
      where: { geohash: { [Op.like]: `${geohashPrefix}%` }, deleted_at: null },
      attributes: ["user_id"],
      group: ["user_id"],
    });

    // Severed reports contribute a null owner; they are record, not recipients.
    const userIds = [
      ...new Set(nearby.map((row) => row.user_id).filter((id): id is string => Boolean(id))),
    ];
    for (const userId of userIds) {
      await this.create({ userId, type: "urgent_safety", title, body });
    }

    logger.warn("[notifications] urgent broadcast sent", {
      area: geohashPrefix,
      recipients: userIds.length,
    });
    return { recipients: userIds.length };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
