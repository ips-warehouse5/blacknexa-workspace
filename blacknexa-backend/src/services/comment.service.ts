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
 *
 * ── Revision 2: pre-moderated comments (docs/INCIDENT_MODULE_PLAN.md §7.5) ──
 *   • **Checked before anyone else sees them.** A comment on a moderated report
 *     is created `pending` with a moderation run in the same transaction (D2,
 *     D13); the author sees it at once as "Checking…", everyone else only once
 *     the pipeline approves it — usually within seconds. On a private report the
 *     only possible commenter is its author, so the comment is `approved` at once
 *     and nothing is sent to the AI (D3).
 *   • **The family filter is gone (D9).** Comments used to be screened by the
 *     hard-coded "moral code" word list, which refused civil-rights vocabulary
 *     ("shoot", "lynch", "execute") and every phone number with a 400. Keyword
 *     rules are now admin-managed and run in the pipeline, where a hit is a
 *     signal for review rather than a refusal.
 *   • **No notification at creation (D18).** "Someone replied to your report"
 *     used to carry the comment's first 160 characters into a notification and a
 *     push before anyone had looked at them. It now fires when the comment is
 *     *approved*, from the pipeline, with approved text only.
 *   • **One way to change state.** Every visibility change goes through
 *     `setCommentState` (`comment_state.ts`), which keeps `comment_count` equal to
 *     the number of comments shown to others (`visible AND approved`) — the old
 *     owner delete decremented it unconditionally and double-counted.
 *   • **Reads.** Others see `visible AND approved` comments on a report they can
 *     read; the author also sees their own not-yet-approved ones, with
 *     `moderationState`. Likes and replies attach only to comments others can see.
 */

import { Op, type WhereOptions } from "sequelize";
import sequelize from "@/config/database.config";
import { nowIso } from "@/models/model_options";
import { AppUser } from "@/models/app_user.model";
import { Report } from "@/models/report.model";
import { CommentLike, ReportComment } from "@/models/report_social.model";
import { COUNTED_COMMENT_WHERE, isCounted, setCommentState } from "@/services/comment_state";
import moderationCaseService, { type ResolvedFlagRow } from "@/services/moderation_case.service";
import { enqueueRun } from "@/services/moderation_enqueue";
import { pokeModeration } from "@/services/moderation_signal";
import auditService from "@/services/audit.service";
import flagService, { AUTHOR_REMOVED } from "@/services/flag.service";
import { canReadReport, type MemberViewer, type Viewer } from "@/services/report_visibility";
import { lockedTransaction } from "@/services/report_tx";
import { badRequest, forbidden, notFound } from "@/middlewares/error.middleware";
import logger from "@/utils/logger.util";
import {
  RUN_PRIORITY,
  needsModeration,
  type CommentModerationState,
} from "@/types/moderation.interface";
import type { AuthorView, CommentView } from "@/types/report.interface";

const PAGE_SIZE = 20;

/** Comments have no edits, so every run assesses their one and only version. */
const COMMENT_CONTENT_VERSION = 1;

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
   * The state the author is shown for their own comment (§7.4): "Checking…",
   * "Held for review", "Removed by a moderator". A comment a moderator hid before
   * revision 2 (`status = hidden`) reads as removed by a moderator.
   */
  private ownModerationState(row: ReportComment): CommentModerationState {
    return row.status === "hidden" ? "rejected" : row.moderation_state;
  }

  /**
   * Which comments this viewer is shown: those shown to everyone, plus — for a
   * signed-in viewer — their own that are not deleted, whatever their state.
   */
  private visibleToViewerWhere(viewer: Viewer): Record<string | symbol, unknown> {
    if (!viewer.id) return { ...COUNTED_COMMENT_WHERE };
    return {
      [Op.or]: [
        { ...COUNTED_COMMENT_WHERE },
        { user_id: viewer.id, status: { [Op.ne]: "removed" } },
      ],
    };
  }

  private toView(
    row: ReportComment,
    viewer: Viewer,
    nameById: Map<string, string>,
    likedIds: Set<string>,
  ): CommentView {
    const mine = viewer.id !== null && row.user_id === viewer.id;
    const view: CommentView = {
      id: row.id,
      parentId: row.parent_id,
      author: this.authorFor(row, nameById),
      body: row.body,
      likeCount: row.like_count,
      liked: likedIds.has(row.id),
      createdAt: row.created_at,
      isMine: mine,
    };
    // The author's own comments only — never someone else's state.
    if (mine) view.moderationState = this.ownModerationState(row);
    return view;
  }

  /**
   * D4's thread list. The caller has already passed the report's read gate.
   *
   * Roots are paged; every reply to the roots on this page comes with them, because
   * a thread split across two pages is unreadable. `top` orders by likes then
   * recency; `new` by recency alone.
   */
  async list(
    report: Report,
    viewer: Viewer,
    sort: "top" | "new",
    cursor: string | undefined,
  ): Promise<{ items: CommentView[]; nextCursor: string | null; total: number }> {
    const visible = this.visibleToViewerWhere(viewer);
    const rootWhere: Record<string | symbol, unknown> = {
      report_id: report.id,
      parent_id: null,
      ...visible,
    };

    if (cursor) {
      // The cursor is the last root's created_at; `top` still falls back to it so
      // paging stays deterministic when likes are equal.
      rootWhere.created_at = { [Op.lt]: cursor };
    }

    const [roots, total] = await Promise.all([
      ReportComment.findAll({
        where: rootWhere as WhereOptions,
        order:
          sort === "top"
            ? [
                ["like_count", "DESC"],
                ["created_at", "DESC"],
              ]
            : [["created_at", "DESC"]],
        limit: PAGE_SIZE + 1,
      }),
      ReportComment.count({ where: { report_id: report.id, ...visible } as WhereOptions }),
    ]);

    const hasMore = roots.length > PAGE_SIZE;
    const page = hasMore ? roots.slice(0, PAGE_SIZE) : roots;
    if (page.length === 0) return { items: [], nextCursor: null, total };

    const rootIds = page.map((row) => row.id);
    const replies = await ReportComment.findAll({
      where: { parent_id: { [Op.in]: rootIds }, ...visible } as WhereOptions,
      order: [["created_at", "ASC"]],
    });

    const all = [...page, ...replies];
    const [owners, likes] = await Promise.all([
      AppUser.findAll({
        where: { id: { [Op.in]: all.filter((row) => !row.anonymous).map((row) => row.user_id) } },
        attributes: ["id", "display_name"],
      }),
      viewer.id
        ? CommentLike.findAll({
            where: { comment_id: { [Op.in]: all.map((row) => row.id) }, user_id: viewer.id },
            attributes: ["comment_id"],
          })
        : Promise.resolve([]),
    ]);

    const nameById = new Map(owners.map((row) => [row.id, row.display_name]));
    const likedIds = new Set(likes.map((row) => row.comment_id));

    const items = page.map((root) => ({
      ...this.toView(root, viewer, nameById, likedIds),
      replies: replies
        .filter((reply) => reply.parent_id === root.id)
        .map((reply) => this.toView(reply, viewer, nameById, likedIds)),
    }));

    const last = page[page.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? last.created_at : null,
      total,
    };
  }

  /**
   * Post a comment or a reply (§7.5). The caller has already passed the report's
   * read gate.
   *
   * Created `pending` with a run on a moderated report; `approved` on a private
   * one. No notification here — see the file header.
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
      // A reply attaches only to a comment others can see (§7.3) — never to a
      // pending, held or removed one, whose existence the replier may not know.
      const parent = await ReportComment.findOne({
        where: { id: parentId, report_id: report.id, ...COUNTED_COMMENT_WHERE },
      });
      if (!parent) throw notFound("That comment no longer exists.");
      // Two levels only — see the file header.
      if (parent.parent_id) {
        throw badRequest("Replies go on the original comment, not on another reply.");
      }
    }

    const at = nowIso();
    const outcome = await lockedTransaction(async (transaction) => {
      // Re-read inside the transaction: the report may have been deleted since
      // the controller loaded it.
      const current = await Report.findByPk(report.id, { transaction });
      if (!current || current.deleted_at) throw notFound("That report is not available.");

      // D3: the one predicate. A private report's comments never reach the AI.
      const moderated = needsModeration(current);
      const created = await ReportComment.create(
        {
          report_id: current.id,
          parent_id: parentId ?? null,
          user_id: userId,
          anonymous,
          body: text,
          created_at: at,
          // Written explicitly — never the column default (§4.2).
          moderation_state: moderated ? "pending" : "approved",
          moderated_at: moderated ? null : at,
          // Approved at creation means there is no approval still to announce;
          // on a private report the commenter is the owner anyway.
          reply_notified: !moderated,
        },
        { transaction },
      );

      if (moderated) {
        await enqueueRun(transaction, {
          targetType: "comment",
          targetId: created.id,
          reportId: current.id,
          commentId: created.id,
          contentVersion: COMMENT_CONTENT_VERSION,
          trigger: "comment",
          priority: RUN_PRIORITY.normal,
        });
      } else {
        // Shown at once, so counted at once — in SQL, like every counter write.
        await sequelize.query(
          `UPDATE reports SET comment_count = comment_count + 1, updated_on = now() WHERE id = :id`,
          { replacements: { id: current.id }, transaction },
        );
      }

      await auditService.record(transaction, {
        actorKind: "member",
        actorId: userId,
        action: "comment.create",
        targetType: "comment",
        targetId: created.id,
        reportId: current.id,
        metadata: {
          after: { moderationState: created.moderation_state },
          reply: Boolean(parentId),
        },
      });

      return { created, moderated };
    });

    if (outcome.moderated) pokeModeration();
    logger.info("[comments] created", {
      reportId: report.id,
      parentId: parentId ?? null,
      moderationState: outcome.created.moderation_state,
    });

    const owner = anonymous ? null : await AppUser.findByPk(userId, { attributes: ["display_name"] });
    const nameById = new Map<string, string>(owner ? [[userId, owner.display_name]] : []);
    return this.toView(outcome.created, { id: userId, role: null }, nameById, new Set());
  }

  /**
   * Toggle a like. A unique pair, so a double-tap cannot inflate the count. Only
   * a comment others can see, on a report the caller can read (§7.3).
   */
  async toggleLike(commentId: string, viewer: MemberViewer): Promise<{ liked: boolean; count: number }> {
    const comment = await ReportComment.findByPk(commentId);
    if (!comment || !isCounted({ status: comment.status, moderationState: comment.moderation_state })) {
      throw notFound("That comment no longer exists.");
    }
    const report = await Report.findByPk(comment.report_id);
    if (!report || !canReadReport(report, viewer)) throw notFound("That comment no longer exists.");

    const existing = await CommentLike.findOne({
      where: { comment_id: commentId, user_id: viewer.id },
    });

    await sequelize.transaction(async (transaction) => {
      if (existing) {
        await existing.destroy({ transaction });
        await comment.decrement("like_count", { by: 1, transaction });
      } else {
        await CommentLike.create(
          { comment_id: commentId, user_id: viewer.id, at: nowIso() },
          { transaction },
        );
        await comment.increment("like_count", { by: 1, transaction });
      }
    });

    await comment.reload();
    return { liked: !existing, count: comment.like_count };
  }

  /**
   * Delete your own comment (§7.5, §7.8). The count follows through
   * `setCommentState`, whatever state the comment was in; its queued run is
   * withdrawn, its open case resolved `withdrawn`, and anyone who flagged it is
   * told, after the commit, that the author removed it.
   */
  async remove(commentId: string, userId: string): Promise<void> {
    const comment = await ReportComment.findByPk(commentId);
    if (!comment) throw notFound("That comment no longer exists.");
    if (comment.user_id !== userId) throw forbidden("That is not your comment.");

    const flags = await lockedTransaction(async (transaction) => {
      // Locks the comment row first — the target, per the moderation lock order —
      // then applies the counter delta in SQL.
      const change = await setCommentState(transaction, commentId, { status: "removed" });
      if (change.before.status === "removed") return [] as ResolvedFlagRow[];

      const closed = await moderationCaseService.closeForTarget(transaction, {
        targetType: "comment",
        targetId: commentId,
        resolution: "withdrawn",
        flagOutcome: AUTHOR_REMOVED.outcome,
      });

      await auditService.record(transaction, {
        actorKind: "member",
        actorId: userId,
        action: "comment.remove",
        targetType: "comment",
        targetId: commentId,
        reportId: change.reportId,
        caseId: closed.closedCase?.id ?? null,
        metadata: {
          before: { status: change.before.status, moderationState: change.before.moderationState },
          after: { status: change.after.status },
          flagsResolved: closed.flags.length,
        },
      });
      return closed.flags;
    });

    flagService.notifyReporters(flags, AUTHOR_REMOVED.mail);
  }
}

export const commentService = new CommentService();
export default commentService;
