/**
 * The incident queue's filters, kept in the URL (review Q17).
 *
 * They used to live in component state, so opening an incident and pressing
 * Back remounted the queue on "All", page 1, no search, no filters — an
 * operator working "Under Review", page 3, "Past 7 Days", "Housing" started
 * over after every case. The prototype's `backToIncidentQueue` re-renders the
 * same tab, page and inputs. A URL is the one piece of state a Back button, a
 * reload and a pasted link all restore, which is why Content Moderation keeps
 * its queue there (`moderation.queue.ts`); this follows the same shape.
 *
 * The detail page's Back goes to the queue *with its query string*: the row
 * hands `location.search` over in router state, and `incidentBackTarget` lets
 * it through only behind one of the two queue paths, so router state can never
 * send Back somewhere arbitrary.
 */

import {
  INCIDENT_DATE_FILTERS,
  INCIDENT_STATUS_TABS,
  REPORT_CATEGORIES,
  type IncidentDateFilter,
  type IncidentSort,
  type IncidentStatusTab,
  type ReportCategory,
} from "@/features/incidents/incidents.types";

/** The page sizes the queue's footer offers (the shared Pagination default). */
export const INCIDENT_PAGE_SIZES = [10, 25, 50, 100] as const;

/** Everything the queue filters on except scope, which is the screen itself. */
export interface IncidentQueueFilters {
  page: number;
  limit: number;
  status: IncidentStatusTab;
  /** The committed (debounced, trimmed) search — not what is mid-typing. */
  search: string;
  category: ReportCategory | "all";
  date: IncidentDateFilter;
  /** Applied custom bounds, `YYYY-MM-DD` or "" — only kept when `date` is "custom". */
  from: string;
  to: string;
  sort: IncidentSort;
}

export const DEFAULT_INCIDENT_FILTERS: IncidentQueueFilters = {
  page: 1,
  limit: 10,
  status: "all",
  search: "",
  category: "all",
  date: "all",
  from: "",
  to: "",
  sort: "newest",
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value);
}

function isoDay(value: string | null): string {
  return value !== null && ISO_DAY.test(value) ? value : "";
}

/**
 * Read the filters from the address bar.
 *
 * Anything unrecognised falls back to its default rather than being sent: a
 * hand-edited `?limit=7` or `?status=open` should show a working queue, not a
 * 400.
 */
export function readIncidentFilters(search: URLSearchParams): IncidentQueueFilters {
  const page = Number(search.get("page"));
  const limit = Number(search.get("limit"));
  const status = search.get("status");
  const category = search.get("category");
  const date = search.get("date");
  const sort = search.get("sort");
  const custom = date === "custom";

  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_INCIDENT_FILTERS.page,
    limit: (INCIDENT_PAGE_SIZES as readonly number[]).includes(limit)
      ? limit
      : DEFAULT_INCIDENT_FILTERS.limit,
    status: oneOf(INCIDENT_STATUS_TABS, status) ? status : DEFAULT_INCIDENT_FILTERS.status,
    search: (search.get("q") ?? "").trim().slice(0, 120),
    category: oneOf(REPORT_CATEGORIES, category) ? category : DEFAULT_INCIDENT_FILTERS.category,
    date: oneOf(INCIDENT_DATE_FILTERS, date) ? date : DEFAULT_INCIDENT_FILTERS.date,
    // Bounds mean nothing outside the custom window, and a preset never sends them.
    from: custom ? isoDay(search.get("from")) : "",
    to: custom ? isoDay(search.get("to")) : "",
    sort: sort === "oldest" ? "oldest" : DEFAULT_INCIDENT_FILTERS.sort,
  };
}

/**
 * Write filters back as a query string.
 *
 * Defaults are omitted, so the plain `/incidents` URL is the default queue and
 * a shared link carries only what somebody changed.
 */
export function writeIncidentFilters(filters: IncidentQueueFilters): URLSearchParams {
  const out = new URLSearchParams();
  if (filters.status !== DEFAULT_INCIDENT_FILTERS.status) out.set("status", filters.status);
  if (filters.search.trim()) out.set("q", filters.search.trim());
  if (filters.category !== DEFAULT_INCIDENT_FILTERS.category) out.set("category", filters.category);
  if (filters.date !== DEFAULT_INCIDENT_FILTERS.date) out.set("date", filters.date);
  if (filters.date === "custom") {
    if (filters.from) out.set("from", filters.from);
    if (filters.to) out.set("to", filters.to);
  }
  if (filters.sort !== DEFAULT_INCIDENT_FILTERS.sort) out.set("sort", filters.sort);
  if (filters.page !== DEFAULT_INCIDENT_FILTERS.page) out.set("page", String(filters.page));
  if (filters.limit !== DEFAULT_INCIDENT_FILTERS.limit) out.set("limit", String(filters.limit));
  return out;
}

/** Where Back may go: the queue the row was opened from, never an arbitrary path. */
const BACK_TARGETS = new Set(["/incidents", "/incidents/assigned"]);

/**
 * The detail page's Back target, read from router state.
 *
 * Accepts `/incidents` or `/incidents/assigned`, optionally followed by the
 * queue's query string, which is re-serialised through the filter reader so
 * only known filters survive. Anything else — a missing state, an older
 * build's value, a path that is not a queue — goes to the full queue.
 */
export function incidentBackTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== "string") return "/incidents";
  const mark = from.indexOf("?");
  const path = mark >= 0 ? from.slice(0, mark) : from;
  if (!BACK_TARGETS.has(path)) return "/incidents";
  if (mark < 0) return path;
  const query = writeIncidentFilters(
    readIncidentFilters(new URLSearchParams(from.slice(mark + 1))),
  ).toString();
  return query ? `${path}?${query}` : path;
}
