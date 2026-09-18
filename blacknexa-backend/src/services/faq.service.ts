/**
 * FAQ content — one store, two public surfaces, one editor.
 *
 * The public read is cached and the console writes invalidate it. FAQ content is
 * read on every Help-screen open and every marketing-page render, and changes a
 * few times a month; without a cache the marketing site would query Postgres for
 * a list of nine rows on every visit.
 *
 * Draft entries never leave this file. `visible()` is the only path the public
 * controllers can reach, and it filters on both status and surface, so a draft
 * cannot be exposed by a controller forgetting a `where` clause.
 */

import { Op, type WhereOptions, type InferAttributes } from "sequelize";

import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { Faq, FaqCategory } from "@/models/faq.model";
import platformCacheService from "@/services/platform_cache.service";
import { badRequest, notFound } from "@/middlewares/error.middleware";
import type {
  CreateFaqDto,
  FaqAdminView,
  FaqListParams,
  FaqPayload,
  FaqStatus,
  FaqSummary,
  FaqSurface,
  UpdateFaqDto,
} from "@/types/faq.interface";
import { ALL_FAQ_SURFACES } from "@/types/faq.interface";

/**
 * Ten minutes.
 *
 * Long enough to absorb the traffic this is protecting against, short enough
 * that an editor who publishes a correction and then reloads the site does not
 * conclude the console is broken. Writes invalidate anyway — this is the
 * backstop for a write that happened somewhere else, such as a direct SQL fix.
 */
const CACHE_TTL_SECONDS = 600;

const CACHE_PREFIX = "faq:public:";

class FaqService {
  // ── Public surfaces ───────────────────────────────────────────────────────

  /**
   * Published entries for one surface, with the categories that actually have
   * one.
   *
   * Empty categories are dropped rather than sent: a chip that filters to
   * nothing is a dead end, and which categories are empty depends on the
   * surface — the website has no "Filing a report" entries of its own.
   */
  async publicPayload(surface: FaqSurface): Promise<FaqPayload> {
    const cacheKey = `${CACHE_PREFIX}${surface}`;
    const cached = await platformCacheService.get<FaqPayload>(cacheKey);
    if (cached) return cached;

    const [rows, categories] = await Promise.all([
      Faq.findAll({
        where: { status: "published" },
        order: [
          ["sort_order", "ASC"],
          ["created_on", "ASC"],
        ],
      }),
      FaqCategory.findAll({ order: [["sort_order", "ASC"]] }),
    ]);

    /*
     * Surface filtering happens here rather than in the query.
     *
     * `surfaces` is JSONB holding a small array, and the containment operators
     * that would push this into SQL differ between Postgres and the sqlite the
     * test harness can fall back to. The row count is in the tens, so filtering
     * in memory costs nothing and keeps the model portable.
     */
    const visible = rows.filter((row) => this.surfacesOf(row).includes(surface));
    const usedCategories = new Set(visible.map((row) => row.category_id));

    const payload: FaqPayload = {
      categories: categories
        .filter((category) => usedCategories.has(category.id))
        .map((category) => ({ id: category.id, label: category.label })),
      items: visible.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        question: row.question,
        answer: row.answer,
        // Omitted rather than sent false, matching the shape the mobile screen
        // already decodes.
        ...(row.start_here ? { startHere: true } : {}),
      })),
    };

    await platformCacheService.set(cacheKey, payload, CACHE_TTL_SECONDS);
    return payload;
  }

  /** Drop every cached surface. Called after any write. */
  private async invalidate(): Promise<void> {
    await Promise.all(
      ALL_FAQ_SURFACES.map((surface) =>
        platformCacheService.delete(`${CACHE_PREFIX}${surface}`),
      ),
    );
  }

  /**
   * Read `surfaces` defensively.
   *
   * The column is JSONB, which means a hand-written row or a botched migration
   * can put anything in it. A malformed value makes the entry invisible rather
   * than crashing the Help screen for everyone.
   */
  private surfacesOf(row: Faq): FaqSurface[] {
    const raw = row.surfaces as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((value): value is FaqSurface =>
      ALL_FAQ_SURFACES.includes(value as FaqSurface),
    );
  }

  // ── Console ───────────────────────────────────────────────────────────────

  private toAdminView(row: Faq, labels: Map<string, string>): FaqAdminView {
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      categoryId: row.category_id,
      // Falls back to the slug so a row whose category was deleted still renders
      // a readable table cell instead of an empty one.
      categoryLabel: labels.get(row.category_id) ?? row.category_id,
      status: row.status,
      surfaces: this.surfacesOf(row),
      startHere: row.start_here,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at,
    };
  }

  private async categoryLabels(): Promise<Map<string, string>> {
    const rows = await FaqCategory.findAll();
    return new Map(rows.map((row) => [row.id, row.label]));
  }

  /** One page of the console table. */
  async list(
    params: FaqListParams,
  ): Promise<{ items: FaqAdminView[]; total: number }> {
    const where: WhereOptions<InferAttributes<Faq>> = {};
    if (params.status) where.status = params.status;
    if (params.categoryId) where.category_id = params.categoryId;
    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      // Both fields, because an editor looking for an answer they half-remember
      // is as likely to recall a phrase from the body as from the question.
      Object.assign(where, {
        [Op.or]: [{ question: { [Op.iLike]: term } }, { answer: { [Op.iLike]: term } }],
      });
    }

    const { rows, count } = await Faq.findAndCountAll({
      where,
      order: [
        ["sort_order", "ASC"],
        ["created_on", "ASC"],
      ],
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    });

    const labels = await this.categoryLabels();
    let items = rows.map((row) => this.toAdminView(row, labels));
    // Surface is the one filter that cannot go in the query — see `publicPayload`.
    if (params.surface) {
      const surface = params.surface;
      items = items.filter((item) => item.surfaces.includes(surface));
    }

    return { items, total: count };
  }

  /** Counts for the console's tiles. Whole table, not the current page. */
  async summary(): Promise<FaqSummary> {
    const [total, published] = await Promise.all([
      Faq.count(),
      Faq.count({ where: { status: "published" } }),
    ]);
    return { total, published, draft: total - published };
  }

  async get(id: string): Promise<FaqAdminView> {
    const row = await Faq.findByPk(id);
    if (!row) throw notFound("That FAQ no longer exists.");
    return this.toAdminView(row, await this.categoryLabels());
  }

  /** Reject a category that does not exist, rather than orphaning the entry. */
  private async assertCategory(categoryId: string): Promise<void> {
    const exists = await FaqCategory.findByPk(categoryId.trim().toLowerCase());
    if (!exists) throw badRequest("Choose a category that exists.");
  }

  async create(dto: CreateFaqDto): Promise<FaqAdminView> {
    await this.assertCategory(dto.categoryId);

    const row = await Faq.create({
      category_id: dto.categoryId,
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      status: dto.status ?? "draft",
      surfaces: dto.surfaces ?? ["app", "website"],
      start_here: dto.startHere ?? false,
      // Appended to the end by default, so a new entry never silently displaces
      // an ordering someone arranged.
      sort_order: dto.sortOrder ?? (await this.nextSortOrder()),
      updated_at: nowIso(),
    });

    await this.invalidate();
    logger.info("[faq] created", { faqId: row.id });
    return this.toAdminView(row, await this.categoryLabels());
  }

  private async nextSortOrder(): Promise<number> {
    const highest = (await Faq.max("sort_order")) as number | null;
    return (typeof highest === "number" ? highest : 0) + 10;
  }

  async update(id: string, dto: UpdateFaqDto): Promise<FaqAdminView> {
    const row = await Faq.findByPk(id);
    if (!row) throw notFound("That FAQ no longer exists.");
    if (dto.categoryId !== undefined) await this.assertCategory(dto.categoryId);

    await row.update({
      ...(dto.categoryId !== undefined ? { category_id: dto.categoryId } : {}),
      ...(dto.question !== undefined ? { question: dto.question.trim() } : {}),
      ...(dto.answer !== undefined ? { answer: dto.answer.trim() } : {}),
      ...(dto.status !== undefined ? { status: dto.status as FaqStatus } : {}),
      ...(dto.surfaces !== undefined ? { surfaces: dto.surfaces } : {}),
      ...(dto.startHere !== undefined ? { start_here: dto.startHere } : {}),
      ...(dto.sortOrder !== undefined ? { sort_order: dto.sortOrder } : {}),
    });

    await this.invalidate();
    logger.info("[faq] updated", { faqId: id });
    return this.toAdminView(row, await this.categoryLabels());
  }

  async remove(id: string): Promise<void> {
    const row = await Faq.findByPk(id);
    if (!row) throw notFound("That FAQ no longer exists.");
    // Soft — see the model header.
    await row.destroy();
    await this.invalidate();
    logger.info("[faq] removed", { faqId: id });
  }

  /** Every category, for the console's dropdown and for the seed check. */
  async categories(): Promise<{ id: string; label: string; sortOrder: number }[]> {
    const rows = await FaqCategory.findAll({ order: [["sort_order", "ASC"]] });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      sortOrder: row.sort_order,
    }));
  }
}

export const faqService = new FaqService();
export default faqService;
