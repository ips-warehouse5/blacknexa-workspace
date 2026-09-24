/**
 * Queue state that has to survive leaving the queue.
 *
 * Two things live here, and both exist because a moderator works the queue by
 * opening an item, deciding it, and moving on — not by browsing a list:
 *
 * 1. **The filters are in the URL** (`?tab=user&page=2&q=…`), not in component
 *    state. Opening a case and coming back must land on the same tab, page and
 *    search, and a URL is the only state that a Back button, a reload and a
 *    pasted link all restore. The other console lists keep filters in state
 *    because nobody round-trips out of them fifty times an hour; this one does.
 *
 * 2. **Previous / next on the detail page walks the whole filtered queue**
 *    (§8.2, prototype `openDetails` → `getFilteredPosts`). The queue hands the
 *    detail page the ordered ids of the rows it was showing, through router
 *    state — a snapshot rather than a live re-read, deliberately: deciding a
 *    case removes it from the open list, and a live list would lose the
 *    moderator's place at exactly the moment they reach for "next". Router
 *    state is kept in `history.state`, so it also survives a reload; a pasted
 *    link simply has none and the controls stay hidden.
 *
 *    Walking off either end of that snapshot fetches the neighbouring page
 *    with the same filters and carries on (review Q12 — it used to dead-end
 *    every `limit` cases, and the counter read "25 of 25" on the last row of
 *    page one). The counter shows the position in the whole queue. Paging a
 *    list that shrinks as the moderator decides is the hard part: page 2 of
 *    the open queue after deciding ten cases on page 1 starts ten cases later
 *    than it did, so "fetch page + 1" would skip exactly the cases that moved
 *    up. Instead the live page(s) around the snapshot are re-read, the
 *    snapshot's surviving ids are found in them, and the walk continues from
 *    the case right after the last one (or right before the first). That
 *    stays correct however many cases in the snapshot were decided, because
 *    it anchors on ids, not positions.
 */

import {
  QUEUE_TAB_VALUES,
  type CaseListParams,
  type CaseSort,
  type CaseState,
  type ModerationQueueTab,
} from "@/features/moderation/moderation.types";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const DEFAULT_QUEUE_PARAMS: CaseListParams = {
  page: 1,
  limit: 25,
  tab: "all",
  state: "open",
  sort: "priority",
  search: "",
};

const SORTS: readonly CaseSort[] = ["priority", "newest", "oldest"];

function isTab(value: string | null): value is ModerationQueueTab {
  return value !== null && (QUEUE_TAB_VALUES as readonly string[]).includes(value);
}

function isSort(value: string | null): value is CaseSort {
  return value !== null && (SORTS as readonly string[]).includes(value);
}

/**
 * Read the queue's filters from the address bar.
 *
 * Anything unrecognised falls back to its default rather than being sent: a
 * hand-edited `?limit=7` should show a working queue, not a 400.
 */
export function readQueueParams(search: URLSearchParams): CaseListParams {
  const page = Number(search.get("page"));
  const limit = Number(search.get("limit"));
  const tab = search.get("tab");
  const sort = search.get("sort");
  const state: CaseState = search.get("state") === "resolved" ? "resolved" : "open";

  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_QUEUE_PARAMS.page,
    limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_QUEUE_PARAMS.limit,
    tab: isTab(tab) ? tab : DEFAULT_QUEUE_PARAMS.tab,
    state,
    // The resolved view defaults to newest-first, which on that view means
    // "most recently decided" — the order a moderator reviewing decisions wants.
    sort: isSort(sort) ? sort : state === "resolved" ? "newest" : DEFAULT_QUEUE_PARAMS.sort,
    search: (search.get("q") ?? "").slice(0, 120),
  };
}

/**
 * Write filters back as a query string.
 *
 * Defaults are omitted so the plain `/moderation` URL is the default queue, and
 * a shared link only carries what somebody actually changed.
 */
export function writeQueueParams(params: CaseListParams): URLSearchParams {
  const out = new URLSearchParams();
  if (params.tab !== DEFAULT_QUEUE_PARAMS.tab) out.set("tab", params.tab);
  if (params.state !== DEFAULT_QUEUE_PARAMS.state) out.set("state", params.state);
  const defaultSort: CaseSort = params.state === "resolved" ? "newest" : DEFAULT_QUEUE_PARAMS.sort;
  if (params.sort !== defaultSort) out.set("sort", params.sort);
  if (params.page !== DEFAULT_QUEUE_PARAMS.page) out.set("page", String(params.page));
  if (params.limit !== DEFAULT_QUEUE_PARAMS.limit) out.set("limit", String(params.limit));
  if (params.search.trim()) out.set("q", params.search.trim());
  return out;
}

/** What the queue passes to the detail page. */
export interface QueueNavState {
  /**
   * The walk window: case ids in display order. Starts as the rows of the
   * page the case was opened from; replaced by a neighbouring page's rows
   * when previous/next walks off either end.
   */
  ids: string[];
  /**
   * The queue's query string (with its leading "?"). "Back" restores this
   * view, and its filters (tab, state, sort, search, limit) are the ones the
   * neighbouring pages are fetched with.
   */
  search: string;
  /** Position of `ids[0]` in the whole filtered queue (0-based). */
  offset: number;
  /** The filtered queue's size when it was last read. */
  total: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Read the queue snapshot out of router state.
 *
 * `location.state` is `unknown` by nature — it survives reloads and can be
 * anything an older build left there — so it is checked field by field rather
 * than cast. State written before the walk could cross pages has no
 * `offset`/`total`; it is read as the page its query string names, with the
 * window as the whole queue, which is what that build showed.
 */
export function readQueueNav(state: unknown): QueueNavState | null {
  if (!state || typeof state !== "object") return null;
  const queue = (state as { queue?: unknown }).queue;
  if (!queue || typeof queue !== "object") return null;
  const { ids, search, offset, total } = queue as {
    ids?: unknown;
    search?: unknown;
    offset?: unknown;
    total?: unknown;
  };
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
  const query = typeof search === "string" ? search : "";
  const params = readQueueParams(new URLSearchParams(query));
  const start = isNonNegativeInteger(offset) ? offset : (params.page - 1) * params.limit;
  return {
    ids,
    search: query,
    offset: start,
    total: isNonNegativeInteger(total) ? Math.max(total, start + ids.length) : start + ids.length,
  };
}

/** The filters the walk fetches neighbouring pages with. */
export function queueNavParams(nav: QueueNavState): CaseListParams {
  return readQueueParams(new URLSearchParams(nav.search));
}

/** Where the open case sits in the walk, and what previous/next can do from there. */
export interface QueuePosition {
  /** 1-based position in the whole filtered queue. */
  position: number;
  total: number;
  /** The case previous/next go to without fetching, when there is one. */
  previousId: string | undefined;
  nextId: string | undefined;
  /** Whether previous/next have to fetch a neighbouring page first. */
  previousNeedsFetch: boolean;
  nextNeedsFetch: boolean;
}

/** Null when the case is not in the window (a stale history entry) — the controls hide. */
export function queuePosition(nav: QueueNavState, caseId: string): QueuePosition | null {
  const index = nav.ids.indexOf(caseId);
  if (index < 0) return null;
  const previousId = index > 0 ? nav.ids[index - 1] : undefined;
  const nextId = nav.ids[index + 1];
  return {
    position: nav.offset + index + 1,
    total: Math.max(nav.total, nav.offset + nav.ids.length),
    previousId,
    nextId,
    previousNeedsFetch: previousId === undefined && nav.offset > 0,
    nextNeedsFetch: nextId === undefined && nav.offset + nav.ids.length < nav.total,
  };
}

/** One live page as fetched for the walk. */
export interface QueuePageSlice {
  page: number;
  ids: string[];
  total: number;
}

function pageRange(first: number, last: number): number[] {
  const pages: number[] = [];
  for (let page = Math.max(1, first); page <= last; page += 1) pages.push(page);
  return pages;
}

/** Drop repeats, keeping the first — a row can straddle two pages read a moment apart. */
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * The live pages to read to continue past the end of the window: from the page
 * holding the window's first case to the page holding the case right after
 * its last one. The window is never longer than a page, so this is at most two
 * requests.
 */
export function forwardPages(nav: QueueNavState, limit: number): number[] {
  return pageRange(
    Math.floor(nav.offset / limit) + 1,
    Math.floor((nav.offset + nav.ids.length) / limit) + 1,
  );
}

/**
 * The window that continues the walk forward, or null at the end of the queue.
 *
 * Anchors on the last case of the old window still in the live list: the walk
 * resumes right after it. When none survives (every case in the window was
 * decided), the cases after the window have moved up to where it began.
 */
export function continueForward(
  nav: QueueNavState,
  limit: number,
  pages: readonly QueuePageSlice[],
): QueueNavState | null {
  const first = pages[0];
  if (!first) return null;
  const base = (first.page - 1) * limit;
  const live = unique(pages.flatMap((page) => page.ids));
  const seen = new Set(nav.ids);
  let lastSeen = -1;
  live.forEach((id, index) => {
    if (seen.has(id)) lastSeen = index;
  });
  const start = lastSeen >= 0 ? lastSeen + 1 : Math.max(0, nav.offset - base);
  const ids = live
    .slice(start)
    .filter((id) => !seen.has(id))
    .slice(0, limit);
  if (ids.length === 0) return null;
  const total = pages[pages.length - 1]?.total ?? nav.total;
  return { ids, search: nav.search, offset: base + start, total };
}

/**
 * The live pages to read to continue before the start of the window: the page
 * holding the case a full page before the window's first, through the page
 * holding that first case. At most two requests.
 */
export function backwardPages(nav: QueueNavState, limit: number): number[] {
  if (nav.offset <= 0) return [];
  return pageRange(
    Math.floor(Math.max(0, nav.offset - limit) / limit) + 1,
    Math.floor(nav.offset / limit) + 1,
  );
}

/**
 * The window that continues the walk backward (ending with the case to open),
 * or null when nothing comes before it any more.
 *
 * Anchors on the first case of the old window still in the live list: the walk
 * resumes right before it. When none survives, the cases before the window are
 * still the ones before its old position.
 */
export function continueBackward(
  nav: QueueNavState,
  limit: number,
  pages: readonly QueuePageSlice[],
): QueueNavState | null {
  const first = pages[0];
  if (!first) return null;
  const base = (first.page - 1) * limit;
  const live = unique(pages.flatMap((page) => page.ids));
  const seen = new Set(nav.ids);
  const firstSeen = live.findIndex((id) => seen.has(id));
  const end = firstSeen >= 0 ? firstSeen : Math.min(live.length, Math.max(0, nav.offset - base));
  const before = live.slice(0, end);
  if (before.length === 0) return null;
  const ids = before.slice(-limit);
  const total = pages[pages.length - 1]?.total ?? nav.total;
  return { ids, search: nav.search, offset: base + end - ids.length, total };
}

/** Router state for a navigation from the queue (or between cases). */
export function queueNavState(nav: QueueNavState): { queue: QueueNavState } {
  return { queue: nav };
}

/** A moderation case id is a UUID (`moderation_cases.id`, plan §4.4). */
const CASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a `/moderation/:caseId` param can be a case at all.
 *
 * The prototype addressed items by display reference (`CMT-90412`), and links
 * in that shape still exist in fixture-backed screens and old bookmarks. The
 * API validates the param as a UUID and would answer 400, which reads as a
 * fault; the detail page answers these as "not found" locally instead — the
 * same rule Incident Management applies to its old `INC-…` links
 * (`isIncidentId`).
 */
export function isCaseId(value: string | undefined): value is string {
  return typeof value === "string" && CASE_ID_PATTERN.test(value);
}
