/**
 * Incident Management endpoints — `/api/v1/admin/incidents`.
 *
 * The contract is `blacknexa-backend/docs/ADMIN_MODERATION_API.md` §3 (plan
 * §9.1). Filtering, paging and the access tiers are all server-side: an
 * advocate's list is forced to their own assignments whatever this module
 * sends, and staff get the metadata tier. Nothing here decides what a caller
 * may see — the server does, and the page renders `IncidentDetail.access`.
 *
 * ── Dates ───────────────────────────────────────────────────────────────────
 * The prototype's date filter (All Dates · Today · Past 7 Days · This Month ·
 * Custom) is sent as `from` / `to` date-times computed here in the operator's
 * local time, not as the server's `range` preset or bare dates — both of which
 * the contract defines on UTC days. Every timestamp in the console is printed
 * in local time, so a report shown as "Sep 24, 00:30" has to fall under
 * "Today" on Sep 24; bounding by UTC midnight would put it under yesterday for
 * anyone east of Greenwich. The bounds are computed when the request is made
 * (inside the query function), not when the filter is chosen, so a refetch
 * after midnight asks for the new day while the query key stays stable.
 */

import { apiGet, apiGetPage, apiPost } from "@/lib/http";
import type { Paginated } from "@/types/api";
import type {
  AddIncidentNoteInput,
  AssignIncidentInput,
  AssigneeOption,
  DeactivateIncidentInput,
  DismissIncidentInput,
  EvidenceLink,
  IncidentDetail,
  IncidentListItem,
  IncidentListParams,
  IncidentNoteView,
  IncidentScope,
  IncidentStateView,
  IncidentSummary,
  ReactivateIncidentInput,
  ReopenIncidentInput,
  VerifyIncidentInput,
} from "@/features/incidents/incidents.types";

const BASE = "/admin/incidents";

/** The server caps search at 120 characters and rejects longer input. */
const SEARCH_MAX = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The `from` / `to` bounds for a date filter, as ISO date-times, or nothing.
 *
 * `to` is inclusive on the server, so a custom end date runs to the last
 * millisecond of that local day. A custom window with neither end picked is no
 * filter at all, which is what the prototype did with empty inputs.
 */
export function dateBounds(
  params: Pick<IncidentListParams, "date" | "from" | "to">,
  now: Date = new Date(),
): { from?: string; to?: string } {
  switch (params.date) {
    case "today":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      };
    case "week":
      return { from: new Date(now.getTime() - 7 * DAY_MS).toISOString() };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    case "custom": {
      const bounds: { from?: string; to?: string } = {};
      const from = localDay(params.from, false);
      const to = localDay(params.to, true);
      if (from) bounds.from = from;
      if (to) bounds.to = to;
      return bounds;
    }
    case "all":
    default:
      return {};
  }
}

/** A `YYYY-MM-DD` from a date input, as the start or end of that local day. */
function localDay(value: string, endOfDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** `assignee` for a scope. *My Assigned Cases* is `me`; the full list sends nothing. */
function assigneeFor(scope: IncidentScope): { assignee?: string } {
  return scope === "assigned" ? { assignee: "me" } : {};
}

/**
 * Turn UI filter state into query parameters.
 *
 * "all" sentinels are dropped rather than sent, so the API sees an absent
 * filter instead of having to understand a sentinel — except `status`, where
 * "all" is a real tab the server knows (it excludes deactivated incidents).
 */
function toQuery(params: IncidentListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
    status: params.status,
    sort: params.sort,
    ...assigneeFor(params.scope),
    ...dateBounds(params),
  };
  const search = params.search.trim().slice(0, SEARCH_MAX);
  if (search) query.search = search;
  if (params.category !== "all") query.category = params.category;
  return query;
}

export const incidentsApi = {
  /** One page of the queue. */
  async list(params: IncidentListParams): Promise<Paginated<IncidentListItem>> {
    const { items, pagination } = await apiGetPage<IncidentListItem>(BASE, {
      params: toQuery(params),
    });
    return {
      items,
      // A server that omits the block still yields a usable single page rather
      // than crashing the footer on a missing `total`.
      pagination: pagination ?? {
        page: params.page,
        limit: params.limit,
        total: items.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  },

  /**
   * Tab counts in the same scope as the list.
   *
   * A separate call rather than counting the current page: the tabs describe
   * the whole queue (as the prototype's did — counts ignore the search, date
   * and category filters), and page one of a filtered list is not that.
   */
  summary(scope: IncidentScope): Promise<IncidentSummary> {
    return apiGet<IncidentSummary>(`${BASE}/summary`, { params: assigneeFor(scope) });
  },

  /** Active moderators and advocates (D17). Needs `incidents.assign`. */
  assignees(): Promise<AssigneeOption[]> {
    return apiGet<AssigneeOption[]>(`${BASE}/assignees`);
  },

  /** One incident, cut to the caller's access tier. */
  get(id: string): Promise<IncidentDetail> {
    return apiGet<IncidentDetail>(`${BASE}/${id}`);
  },

  /**
   * A short-lived link to one sealed file.
   *
   * Asked for on "View", never prefetched: the link expires in minutes, and a
   * detail page left open would otherwise hold dead URLs.
   */
  evidenceLink(id: string, evidenceId: string): Promise<EvidenceLink> {
    return apiGet<EvidenceLink>(`${BASE}/${id}/evidence/${evidenceId}`);
  },

  verify(id: string, input: VerifyIncidentInput): Promise<IncidentStateView> {
    return apiPost<IncidentStateView>(`${BASE}/${id}/verify`, input);
  },

  dismiss(id: string, input: DismissIncidentInput): Promise<IncidentStateView> {
    return apiPost<IncidentStateView>(`${BASE}/${id}/dismiss`, input);
  },

  reopen(id: string, input: ReopenIncidentInput): Promise<IncidentStateView> {
    return apiPost<IncidentStateView>(`${BASE}/${id}/reopen`, input);
  },

  deactivate(id: string, input: DeactivateIncidentInput): Promise<IncidentStateView> {
    return apiPost<IncidentStateView>(`${BASE}/${id}/deactivate`, input);
  },

  reactivate(id: string, input: ReactivateIncidentInput): Promise<IncidentStateView> {
    return apiPost<IncidentStateView>(`${BASE}/${id}/reactivate`, input);
  },

  assign(id: string, input: AssignIncidentInput): Promise<IncidentStateView> {
    return apiPost<IncidentStateView>(`${BASE}/${id}/assign`, input);
  },

  /** Answers 201 with the stored note. */
  addNote(id: string, input: AddIncidentNoteInput): Promise<IncidentNoteView> {
    return apiPost<IncidentNoteView>(`${BASE}/${id}/notes`, input);
  },
};

export default incidentsApi;
