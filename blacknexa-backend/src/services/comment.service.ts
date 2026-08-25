/**
 * Comments — screens D4 through D7.
 *
 * ── Two levels, enforced ───────────────────────────────────────────────────
 * D4: "Two levels only — a reply to a reply joins the same thread." So a
 * `parentId` pointing at a reply is **rejected**, not silently re-pointed at its
 * root: flattening would move someone's reply under a parent they did not choose,
 * which changes what their words appear to be answering.
 *
 * ── No public profiles ─────────────────────────────────────────────────────
 * D4: "Author names are deliberately not links: there is no public profile." So
 * there is no endpoint here that resolves a commenter to anything beyond the name
 * and initials already on the row, and none should be added for convenience.
 */

import { Op } from "sequelize";
import sequelize from "@/config/database.config";
import { nowIso } from "@/models/model_options";
import { AppUser } from "@/models/app_user.model";
import { Report } from "@/models/report.model";
import {
  CommentLike,
  Notification,
  ReportComment,
} from "@/models/report_social.model";
import moderationService from "@/services/moderation.service";
import { badRequest, forbidden, notFound } from "@/middlewares/error.middleware";
import logger from "@/utils/logger.util";
import type { AuthorView, CommentView } from "@/types/report.interface";

const PAGE_SIZE = 20;

class CommentService {
  private initialsFrom(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  }

  private authorFor(row: ReportComment, nameById: Map<string, string>): AuthorView {
    if (row.anonymous) return { name: "Anonymous", initials: null, anonymous: true };
    const name = nameById.get(row.user_id)?.trim() || "Anonymous";
    return { name, initials: this.initialsFrom(name), anonymous: name === "Anonymous" };
  }

  /**
   * D4's thread list.
   *
   * Roots are paged; every reply to the roots on this page comes with them, because
   * a thread split across two pages is unreadable. `top` orders by likes then
   * recency; `new` by recency alone.
   */
  async list(
    reportId: string,
    viewerId: string | null,
    sort: "top" | "new",
    cursor: string | undefined,
  ): Promise<{ items: CommentView[]; nextCursor: string | null; total: number }> {
    const rootWhere: Record<string, unknown> = {
      report_id: reportId,
      parent_id: null,
      status: "visible",
    };

    if (cursor) {
      // The cursor is the last root's created_at; `top` still falls back to it so
      // paging stays deterministic when likes are equal.
      rootWhere.created_at = { [Op.lt]: cursor };
    }

    const roots = await ReportComment.findAll({
      where: rootWhere,
      order:
        sort === "top"
          ? [
              ["like_count", "DESC"],
              ["created_at", "DESC"],
            ]
          : [["created_at", "DESC"]],
      limit: PAGE_SIZE + 1,
    });

    const hasMore = roots.length > PAGE_SIZE;
    const page = hasMore ? roots.slice(0, PAGE_SIZE) : roots;
    if (page.length === 0) {
      const total = await ReportComment.count({
        where: { report_id: reportId, status: "visible" },
      });
      return { items: [], nextCursor: null, total };
    }

    const rootIds = page.map((row) => row.id);
    const [replies, total] = await Promise.all([
      ReportComment.findAll({
        where: { parent_id: { [Op.in]: rootIds }, status: "visible" },
        order: [["created_at", "ASC"]],
      }),
      ReportComment.count({ where: { report_id: reportId, status: "visible" } }),
    ]);

    const all = [...page, ...replies];
    const [owners, likes] = await Promise.all([
      AppUser.findAll({
        where: { id: { [Op.in]: all.filter((row) => !row.anonymous).map((row) => row.user_id) } },
        attributes: ["id", "display_name"],
      }),
      viewerId
        ? CommentLike.findAll({
            where: { comment_id: { [Op.in]: all.map((row) => row.id) }, user_id: viewerId },
            attributes: ["comment_id"],
          })
        : Promise.resolve([]),
    ]);

    const nameById = new Map(owners.map((row) => [row.id, row.display_name]));
    const likedIds = new Set(likes.map((row) => row.comment_id));

    const toView = (row: ReportComment): CommentView => ({
      id: row.id,
      parentId: row.parent_id,
      author: this.authorFor(row, nameById),
      body: row.body,
      likeCount: row.like_count,
      liked: likedIds.has(row.id),
      createdAt: row.created_at,
    });

    const items = page.map((root) => ({
      ...toView(root),
      replies: replies.filter((reply) => reply.parent_id === root.id).map(toView),
    }));

    const last = page[page.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? last.created_at : null,
      total,
    };
  }

  /**
   * Post a comment or a reply.
   *
   * The body is screened before it is stored, and a rejection says what was wrong
   * rather than vanishing — D7's principle applied to writes: never fail silently.
   */
  async create(
    report: Report,
    userId: string,
    body: string,
    parentId: string | undefined,
    anonymous: boolean,
  ): Promise<CommentView> {
    const text = body.trim();
    if (!text) throw badRequest("Write something first.");

    if (parentId) {
      const parent = await ReportComment.findOne({
        where: { id: parentId, report_id: report.id },
      });
      if (!parent) throw notFound("That comment no longer exists.");
      // Two levels only — see the file header.
      if (parent.parent_id) {
        throw badRequest("Replies go on the original comment, not on another reply.");
      }
    }

    // `moderateContent` caches on a content hash and writes an audit row, so a
    // held-back comment is reviewable rather than just refused.
    const verdict = await moderationService.moderateContent(text).catch(() => null);
    if (verdict && !verdict.approved) {
      throw badRequest(
        verdict.violationCategory
          ? `That comment was held back for ${verdict.violationCategory.replace(/_/g, " ")}. Try saying it another way.`
          : "That comment was held back. Try saying it another way.",
      );
    }

    const at = nowIso();
    const comment = await sequelize.transaction(async (transaction) => {
      const created = await ReportComment.create(
        {
          report_id: report.id,
          parent_id: parentId ?? null,
          user_id: userId,
          anonymous,
          body: text,
          created_at: at,
        },
        { transaction },
      );
      await report.increment("comment_count", { by: 1, transaction });

      // A11's second notification type. Not sent to yourself — and not sent at
      // all on a severed report, which has no author left to tell.
      if (report.user_id && report.user_id !== userId) {
        await Notification.create(
          {
            user_id: report.user_id,
            type: "corroboration_or_reply",
            title: "Someone replied to your report",
            body: text.slice(0, 160),
            link: `/r/${report.case_ref}/comments`,
            report_id: report.id,
            created_at: at,
          },
          { transaction },
        );
      }
      return created;
    });

    logger.info("[comments] created", { reportId: report.id, parentId: parentId ?? null });

    const owner = anonymous ? null : await AppUser.findByPk(userId, { attributes: ["display_name"] });
    const nameById = new Map(owner ? [[userId, owner.display_name]] : []);

    return {
      id: comment.id,
      parentId: comment.parent_id,
      author: this.authorFor(comment, nameById as Map<string, string>),
      body: comment.body,
      likeCount: 0,
      liked: false,
      createdAt: comment.created_at,
    };
  }

  /** Toggle a like. A unique pair, so a double-tap cannot inflate the count. */
  async toggleLike(
    commentId: string,
    userId: string,
  ): Promise<{ liked: boolean; count: number }> {
    const comment = await ReportComment.findByPk(commentId);
    if (!comment) throw notFound("That comment no longer exists.");

    const existing = await CommentLike.findOne({
      where: { comment_id: commentId, user_id: userId },
    });

    await sequelize.transaction(async (transaction) => {
      if (existing) {
        await existing.destroy({ transaction });
        await comment.decrement("like_count", { by: 1, transaction });
      } else {
        await CommentLike.create(
          { comment_id: commentId, user_id: userId, at: nowIso() },
          { transaction },
        );
        await comment.increment("like_count", { by: 1, transaction });
      }
    });

    await comment.reload();
    return { liked: !existing, count: comment.like_count };
  }

  /** Delete your own comment. The count follows so D1's footer stays true. */
  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await ReportComment.findByPk(commentId);
    if (!comment) throw notFound("That comment no longer exists.");
    if (comment.user_id !== userId) throw forbidden("That is not your comment.");

    const report = await Report.findByPk(comment.report_id);
    await sequelize.transaction(async (transaction) => {
      await comment.update({ status: "removed" }, { transaction });
      if (report) await report.decrement("comment_count", { by: 1, transaction });
    });
  }
}

export const commentService = new CommentService();
export default commentService;
