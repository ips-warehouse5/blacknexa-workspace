/**
 * The feed, its facet counts, and search — screens B1 through B7.
 *
 * ── Three things worth stating ─────────────────────────────────────────────
 *
 * 1. **Facets are computed under the *other* filters.** B1's chip counts and B2's
 *    "9 of 17" both mean "how many would remain if I also picked this" — so the
 *    count for a category is taken with every filter applied *except* category.
 *    Counting under all filters would show 17 next to a chip that returns 4.
 *
 * 2. **Keyset pagination, never offset.** A feed that people file into while you
 *    scroll will duplicate and skip rows under `OFFSET`. Each page seeks past the
 *    last row's sort key instead.
 *
 * 3. **The card variant is decided server-side.** The 1a card needs to know
 *    whether it has a lead image before it renders, or it cannot pick a height and
 *    the list janks. So `leadMedia` and `mediaCount` come down with the row.
 *
 * ── Revision 2: only published reports (docs/INCIDENT_MODULE_PLAN.md §7.3) ──
 * Every public read here — page, facets, search and the "did you mean" corpus —
 * starts from `visibleWhere(viewer)` in `report_visibility.ts`: not deleted,
 * **approved**, and a visibility the viewer's role admits. Before this a public
 * report was in the feed, the counts and the suggestions the instant it was
 * filed, and the suggestion corpus even read the titles of private reports.
 *
 * The public feed is ordered by `published_at` (D11), set on first approval and
 * never moved by an edit — so a report a moderator approved hours after filing is
 * not back-dated behind newer ones, and an edited report does not jump the queue.
 * B2's When filter counts from publication too. The owner's Vault (`mine`) keeps
 * `filed_at`, the date the author knows, and adds the fields the Vault needs to
 * say where each report is (§7.4): `status`, `moderationState`, `displayStatus`,
 * with the `displayStatus` chip filter.
 *
 * Evidence on a public card follows D22: the lead image is an *approved* file,
 * and `mediaCount` counts what the detail view will list (approved files plus
 * those awaiting review), never a rejected file or a failed upload. A file
 * approved on its preview alone leads the card through that preview only — the
 * card never carries a URL to an original nobody assessed (review R5).
 */

import { Op, QueryTypes, type WhereOptions } from "sequelize";
import sequelize from "@/config/database.config";
import { Report, ReportEvidence } from "@/models/report.model";
import { ReportHide, ReportSupport } from "@/models/report_social.model";
import { AppUser } from "@/models/app_user.model";
import evidenceService from "@/services/evidence.service";
import {
  evidenceAccessFor,
  evidenceIsOpenable,
  readableVisibilities,
  visibleWhere,
  type Viewer,
} from "@/services/report_visibility";
import { displayStatusFilter, displayStatusOf } from "@/types/moderation.interface";
import type {
  FeedCardView,
  FeedFacets,
  FeedQuery,
  MatchedField,
  ReportCategory,
  SearchResultView,
} from "@/types/report.interface";
import { ALL_REPORT_CATEGORIES } from "@/types/report.interface";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Cursor shape. Opaque to the client, so the sort key can change later. */
interface Cursor {
  /** The last row's sort value — a timestamp or a count. */
  v: string | number;
  /** Tie-break, so equal counts still page deterministically. */
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
    return parsed.id ? parsed : null;
  } catch {
    // A malformed cursor is treated as no cursor: better a first page than a 400
    // on something the user never typed.
    return null;
  }
}

/** Cut-off for B2's When filter. */
function sinceFor(when: FeedQuery["when"]): Date | null {
  const now = Date.now();
  switch (when) {
    case "today":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "week":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

class ReportFeedService {
  /**
   * Build the shared WHERE for the public feed, facets and search.
   *
   * `omit` lets the facet pass drop one dimension — see point 1 in the header.
   */
  private buildWhere(
    query: FeedQuery,
    viewer: Viewer,
    hiddenIds: string[],
    omit?: "category" | "when" | "verified" | "urgent",
  ): WhereOptions {
    const where: Record<string, unknown> = {
      // Not deleted, approved, and a visibility this viewer may read (§3.2).
      ...visibleWhere(viewer),
      // In the feed means published: D11's sort key must exist. An approved row
      // without it would be an invariant breach, and Postgres sorts NULLs first
      // on DESC — it would pin itself to the top of everyone's feed.
      published_at: { [Op.ne]: null },
    };

    if (query.category && omit !== "category") where.category = query.category;

    if (omit !== "when") {
      const since = sinceFor(query.when);
      if (since) where.published_at = { [Op.gte]: since.toISOString() };
    }

    if (query.verifiedOnly && omit !== "verified") where.status = "verified";
    if (query.urgentOnly && omit !== "urgent") where.urgent = true;

    // D9's "hide this report from my feed".
    if (hiddenIds.length > 0) where.id = { [Op.notIn]: hiddenIds };

    return where as WhereOptions;
  }

  private async hiddenFor(viewerId: string | null): Promise<string[]> {
    if (!viewerId) return [];
    const rows = await ReportHide.findAll({
      where: { user_id: viewerId },
      attributes: ["report_id"],
    });
    return rows.map((row) => row.report_id);
  }

  /**
   * Which column each sort orders by. The public feed's "newest" is publication
   * (D11); the Vault's is filing.
   */
  private sortColumn(sort: FeedQuery["sort"], mine: boolean): { column: string; op: symbol } {
    switch (sort) {
      case "supported":
        return { column: "support_count", op: Op.lt };
      case "corroborated":
        return { column: "corroboration_count", op: Op.lt };
      default:
        return { column: mine ? "filed_at" : "published_at", op: Op.lt };
    }
  }

  /** The Vault's WHERE: the caller's own reports, any visibility, any state. */
  private mineWhere(query: FeedQuery, viewerId: string): Record<string, unknown> {
    const where: Record<string, unknown> = { user_id: viewerId, deleted_at: null };
    if (query.displayStatus) {
      // The inverse of `displayStatusOf` (§3.2), so a chip returns exactly the
      // cards that show that chip's label.
      const filter = displayStatusFilter(query.displayStatus);
      where.moderation_state = filter.moderationState;
      if (filter.statuses) where.status = { [Op.in]: [...filter.statuses] };
      if (filter.visibility === "private") where.visibility = "private";
      else if (filter.visibility === "not_private") where.visibility = { [Op.ne]: "private" };
    }
    return where;
  }

  /**
   * B1 — a page of the feed.
   *
   * `mine` switches to the Vault's view: the caller's own reports at every
   * visibility and every publication state, with the owner-only card fields.
   * Drafts themselves come from `/reports/drafts`.
   */
  async page(
    query: FeedQuery,
    viewer: Viewer,
  ): Promise<{ items: FeedCardView[]; nextCursor: string | null }> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const mine = Boolean(query.mine);

    let where: Record<string, unknown>;
    if (mine) {
      if (!viewer.id) return { items: [], nextCursor: null };
      where = this.mineWhere(query, viewer.id);
    } else {
      const hidden = await this.hiddenFor(viewer.id);
      where = this.buildWhere(query, viewer, hidden) as Record<string, unknown>;
    }

    const { column, op } = this.sortColumn(query.sort, mine);
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      // Seek past the last row. The id tie-break keeps equal counts stable.
      where[Op.or as unknown as string] = [
        { [column]: { [op]: cursor.v } },
        { [column]: cursor.v, id: { [Op.lt]: cursor.id } },
      ];
    }

    const rows = await Report.findAll({
      where: where as WhereOptions,
      order: [
        [column, "DESC"],
        ["id", "DESC"],
      ],
      // One extra row tells us whether another page exists without a count query.
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = await this.toCards(page, viewer.id, { owner: mine });
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ v: (last as unknown as Record<string, string | number>)[column], id: last.id })
        : null;

    return { items, nextCursor };
  }

  /**
   * Project rows into 1a cards.
   *
   * Batched deliberately: the lead media, the author names and the caller's
   * standing-with set are three queries for the whole page rather than three per
   * row. `owner` is true only for the Vault, whose rows are all the caller's own.
   */
  private async toCards(
    rows: Report[],
    viewerId: string | null,
    options: { owner: boolean },
  ): Promise<FeedCardView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);

    const [evidence, supports, owners] = await Promise.all([
      ReportEvidence.findAll({
        where: { report_id: { [Op.in]: ids } },
        order: [["sort_order", "ASC"]],
      }),
      viewerId
        ? ReportSupport.findAll({
            where: { report_id: { [Op.in]: ids }, user_id: viewerId },
            attributes: ["report_id"],
          })
        : Promise.resolve([]),
      AppUser.findAll({
        where: {
          id: {
            [Op.in]: rows
              .filter((r) => !r.anonymous)
              .map((r) => r.user_id)
              .filter((id): id is string => Boolean(id)),
          },
        },
        attributes: ["id", "display_name"],
      }),
    ]);

    const standing = new Set(supports.map((row) => row.report_id));
    const nameById = new Map(owners.map((row) => [row.id, row.display_name]));

    return Promise.all(
      rows.map(async (row) => {
        // D22: what this viewer may know about. The owner sees every file.
        const own = evidence.filter(
          (item) =>
            item.report_id === row.id && evidenceAccessFor(item, options.owner) !== "hidden",
        );
        // Only a file this viewer may open can lead the card — a file approved on
        // its preview alone (R5) only through that preview.
        const openable = own.filter((item) => {
          if (item.upload_state !== "sealed") return false;
          const access = evidenceAccessFor(item, options.owner);
          return access === "full" || (evidenceIsOpenable(access) && Boolean(item.thumb_key));
        });
        // The lead image is the first photo, else a video's poster. Audio- and
        // document-only reports have none, which is what selects the text-first
        // card variant — see the screens plan §3.3.
        const lead =
          openable.find((item) => item.kind === "photo") ??
          openable.find((item) => item.kind === "video") ??
          null;

        /*
         * Projected for *this* viewer (review R5). This used to take `toView`'s
         * staff default, so every card handed every reader a URL to the original
         * — including one the AI never saw, because it assessed only the preview.
         * A member now gets exactly the bytes the approval covered.
         */
        let leadView = lead
          ? await evidenceService.toView(lead, { audience: options.owner ? "owner" : "member" })
          : null;

        /*
         * A video only qualifies as lead media once it has a poster frame.
         *
         * The card paints the lead into an `<Image>`, and an MP4 handed to an image
         * decoder is a blank tile — worse than no image at all, because the card
         * has already reserved the taller height for it. Without a poster the card
         * falls back to the text-first variant, which is a designed state (screens
         * plan §3.3), not a degradation.
         */
        if (leadView && leadView.kind === "video" && !leadView.thumbUrl) {
          leadView = null;
        }
        // Anonymous by choice and anonymous by deletion look identical on the card.
        const name =
          row.anonymous || !row.user_id
            ? "Anonymous"
            : nameById.get(row.user_id)?.trim() || "Anonymous";

        const card: FeedCardView = {
          id: row.id,
          caseRef: row.case_ref,
          title: row.title,
          // The body is sealed, so the card carries the title and lets the detail
          // view open it. An excerpt would mean decrypting every row of every page.
          excerpt: "",
          category: row.category,
          urgent: row.urgent,
          verified: row.status === "verified",
          visibility: row.visibility,
          occurredAt: row.occurred_at,
          filedAt: row.filed_at,
          author: {
            name,
            initials:
              name === "Anonymous"
                ? null
                : name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase(),
            anonymous: name === "Anonymous",
          },
          areaLabel: row.location_label,
          supportCount: row.support_count,
          commentCount: row.comment_count,
          leadMedia: leadView
            ? {
                kind: leadView.kind,
                thumbUrl: leadView.thumbUrl,
                // A photo with no generated thumbnail falls back to the original,
                // which is at least a decodable image. A video never reaches here
                // without a poster — see the guard above.
                posterUrl: leadView.thumbUrl ?? leadView.url,
                durationMs: leadView.durationMs,
              }
            : null,
          mediaCount: own.length,
          standingWith: standing.has(row.id),
        };

        // The Vault's own fields (§7.4) — never on someone else's card.
        if (options.owner) {
          card.status = row.status;
          card.moderationState = row.moderation_state;
          card.displayStatus = displayStatusOf({
            moderationState: row.moderation_state,
            status: row.status,
            visibility: row.visibility,
          });
        }
        return card;
      }),
    );
  }

  /**
   * B1's chip counts and B2's per-option counts.
   *
   * Each dimension is counted with itself omitted from the filter — see point 1.
   * Counted over published reports only, like the feed they describe.
   */
  async facets(query: FeedQuery, viewer: Viewer): Promise<FeedFacets> {
    const hidden = await this.hiddenFor(viewer.id);

    const [total, categoryRows, verified, urgent, today, week, month, all] = await Promise.all([
      Report.count({ where: this.buildWhere(query, viewer, hidden) }),
      Report.findAll({
        where: this.buildWhere(query, viewer, hidden, "category"),
        attributes: ["category", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
        group: ["category"],
        raw: true,
      }) as unknown as Promise<{ category: ReportCategory; count: string }[]>,
      Report.count({
        where: {
          ...(this.buildWhere(query, viewer, hidden, "verified") as object),
          status: "verified",
        },
      }),
      Report.count({
        where: {
          ...(this.buildWhere(query, viewer, hidden, "urgent") as object),
          urgent: true,
        },
      }),
      Report.count({ where: this.buildWhere({ ...query, when: "today" }, viewer, hidden) }),
      Report.count({ where: this.buildWhere({ ...query, when: "week" }, viewer, hidden) }),
      Report.count({ where: this.buildWhere({ ...query, when: "month" }, viewer, hidden) }),
      Report.count({ where: this.buildWhere({ ...query, when: "all" }, viewer, hidden) }),
    ]);

    const counts = new Map(categoryRows.map((row) => [row.category, Number(row.count)]));

    return {
      total,
      // Every category is listed, including the zeroes: B2's chips are a fixed set
      // and a chip that vanishes when its count is nil is worse than one showing 0.
      categories: ALL_REPORT_CATEGORIES.map((category) => ({
        category,
        count: counts.get(category) ?? 0,
      })),
      when: { today, week, month, all },
      verified,
      urgent,
    };
  }

  /**
   * B5 — search, with the matched field named per row.
   *
   * The design requires each result to say *why* it matched ("MATCHED IN TITLE"),
   * so the four fields are probed in priority order and the first hit is reported.
   * A title match outranks a description match, which outranks area, then category.
   */
  async search(
    term: string,
    query: FeedQuery,
    viewer: Viewer,
  ): Promise<{ items: SearchResultView[]; suggestion: string | null }> {
    const trimmed = term.trim();
    if (!trimmed) return { items: [], suggestion: null };

    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const hidden = await this.hiddenFor(viewer.id);
    const like = `%${trimmed.toLowerCase()}%`;

    // The body is sealed at rest, so it cannot participate in a SQL LIKE. Title,
    // area label and category are searchable; a description match is therefore
    // reported only when the term appears in the title's own words too. That is a
    // real limitation of sealing the body, and it is better stated than hidden.
    const base = this.buildWhere(query, viewer, hidden) as Record<string, unknown>;
    const rows = await Report.findAll({
      where: {
        ...base,
        [Op.or]: [
          sequelize.where(sequelize.fn("LOWER", sequelize.col("title")), { [Op.like]: like }),
          sequelize.where(sequelize.fn("LOWER", sequelize.col("location_label")), {
            [Op.like]: like,
          }),
          sequelize.where(sequelize.fn("LOWER", sequelize.col("category")), { [Op.like]: like }),
        ],
      } as WhereOptions,
      order: [
        ["published_at", "DESC"],
        ["id", "DESC"],
      ],
      limit,
    });

    const cards = await this.toCards(rows, viewer.id, { owner: false });
    const needle = trimmed.toLowerCase();

    const items: SearchResultView[] = cards.map((card, index) => {
      const row = rows[index];
      let matchedIn: MatchedField = "title";
      if (row.title.toLowerCase().includes(needle)) matchedIn = "title";
      else if (row.location_label?.toLowerCase().includes(needle)) matchedIn = "area";
      else if (row.category.toLowerCase().includes(needle)) matchedIn = "category";
      else matchedIn = "description";
      return { ...card, matchedIn, snippet: null };
    });

    const suggestion = items.length === 0 ? await this.suggest(trimmed, viewer) : null;
    return { items, suggestion };
  }

  /**
   * B6's "Did you mean utica ave?".
   *
   * Suggests only words that actually appear in titles and area labels, so a
   * suggestion always leads somewhere — proposing a spelling with no results would
   * be a second dead end rather than a recovery.
   *
   * The corpus is exactly what this viewer's search can return (§7.3): published,
   * not deleted, and a visibility their role admits. It used to be every
   * non-deleted report — private, trusted and still-unchecked titles included —
   * so a word nobody else could read could surface in the "did you mean" line.
   *
   * ── Why edit distance leads, and trigrams only break ties ─────────────────
   * The design's own example is `utcia` → `utica`, which is a transposition. Its
   * trigram similarity is **0.2** — below any threshold loose enough to be useful,
   * because a transposition destroys four of six trigrams while changing almost
   * nothing a reader would notice. Levenshtein scores the same pair at 2, which is
   * exactly the signal wanted. So distance decides, bounded relative to word
   * length so "cat" does not suggest "dog", and trigram similarity orders the
   * candidates that survive.
   */
  private async suggest(term: string, viewer: Viewer): Promise<string | null> {
    const needle = term.toLowerCase().trim();
    // Multi-word terms are reduced to their longest word: B6 suggests a corrected
    // word inside the phrase ("utcia ave" → "utica"), not a whole re-phrasing.
    const word = needle.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? needle;
    if (word.length < 4) return null;

    /*
     * Two, always — not a fraction of the word length.
     *
     * `levenshtein` has no transposition operation, so swapping two adjacent
     * letters costs **2**: one deletion and one insertion. The design's own
     * example, `utcia` → `utica`, is exactly that. A length-proportional bound
     * computed 1 for a five-letter word and silently rejected the one case the
     * screen was drawn around.
     *
     * The false-positive risk that buys is bounded by the length filter and by
     * ordering on trigram similarity, and the cost of a wrong guess is one
     * ignorable line of copy.
     */
    const maxDistance = 2;

    try {
      const rows = await sequelize.query<{ word: string }>(
        `
        WITH visible AS (
          SELECT title, location_label
          FROM reports
          WHERE deleted_at IS NULL
            AND moderation_state = 'approved'
            AND published_at IS NOT NULL
            AND visibility IN (:visibilities)
        ), corpus AS (
          SELECT LOWER(unnest(string_to_array(title, ' '))) AS word FROM visible
          UNION ALL
          SELECT LOWER(unnest(string_to_array(COALESCE(location_label, ''), ' '))) AS word FROM visible
        ), candidates AS (
          SELECT DISTINCT regexp_replace(word, '[^a-z0-9]', '', 'g') AS word FROM corpus
        )
        SELECT word
        FROM candidates
        WHERE length(word) >= 4
          AND word <> :word
          AND abs(length(word) - length(:word)) <= :maxDistance
          AND levenshtein(word, :word) <= :maxDistance
        ORDER BY levenshtein(word, :word) ASC, similarity(word, :word) DESC
        LIMIT 1
        `,
        {
          replacements: { word, maxDistance, visibilities: readableVisibilities(viewer) },
          type: QueryTypes.SELECT,
        },
      );
      return rows[0]?.word ?? null;
    } catch {
      // `fuzzystrmatch` or `pg_trgm` missing is not a reason to fail a search — B6
      // simply loses its suggestion line and keeps its other two recoveries.
      return null;
    }
  }
}

export const reportFeedService = new ReportFeedService();
export default reportFeedService;
