/**
 * The dashboard's own endpoints.
 *
 * Only two calls are the dashboard's alone. The KPI tiles and the moderation
 * half of Urgent Queue Alerts read Incident Management's and Content
 * Moderation's endpoints through those modules' API objects (see
 * `dashboard.hooks.ts`), so their cache entries are the modules' own and a
 * decision anywhere in the console refreshes the tile that counts it.
 *
 *   metrics          `GET /admin/incidents/metrics?range=` — the activity
 *                    chart and the category breakdown (contract §3.7).
 *   urgentIncidents  `GET /admin/incidents` narrowed to the urgent incidents
 *                    nobody is working yet, oldest first — the C6 promise ("a
 *                    moderator looks at it within the hour") at risk. The
 *                    queue screen's own query builder has no `urgent` or
 *                    `assignee=unassigned` filter, which is why this slice is
 *                    asked for here rather than through `incidentsApi.list`.
 *
 * Both answer in the caller's scope: an advocate's figures and list are their
 * own assignments whatever is sent (contract §3.0).
 */

import { apiGet, apiGetPage } from "@/lib/http";
import type { IncidentListItem } from "@/features/incidents/incidents.types";
import type { IncidentMetrics, IncidentMetricsRange } from "@/features/dashboard/dashboard.types";

const BASE = "/admin/incidents";

/** How many urgent incidents the alert card asks for — it shows a handful, oldest first. */
export const URGENT_INCIDENT_LIMIT = 5;

export interface UrgentIncidentParams {
  /**
   * The caller only ever sees their own assignments (advocates). For them
   * "unassigned" can never match, and an incident assigned to them moves to
   * under review as soon as it is published (D17) — so their slice is the
   * urgent incidents they hold that are still under review. Everyone else
   * gets the urgent incidents still submitted with nobody assigned: the ones
   * the response SLA is counting down on.
   */
  assignedOnly: boolean;
}

export const dashboardApi = {
  /** Activity buckets, category counts and the status split for one range. */
  metrics(range: IncidentMetricsRange): Promise<IncidentMetrics> {
    return apiGet<IncidentMetrics>(`${BASE}/metrics`, { params: { range } });
  },

  /** Urgent incidents waiting on someone — oldest (most overdue) first. */
  async urgentIncidents(
    params: UrgentIncidentParams,
  ): Promise<{ items: IncidentListItem[]; total: number }> {
    const { items, pagination } = await apiGetPage<IncidentListItem>(BASE, {
      params: {
        page: 1,
        limit: URGENT_INCIDENT_LIMIT,
        urgent: true,
        sort: "oldest",
        ...(params.assignedOnly
          ? { status: "under_review" }
          : { status: "submitted", assignee: "unassigned" }),
      },
    });
    return { items, total: pagination?.total ?? items.length };
  },
};

export default dashboardApi;
