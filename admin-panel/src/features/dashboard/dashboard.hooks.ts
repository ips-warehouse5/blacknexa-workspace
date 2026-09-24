/**
 * React Query bindings for the dashboard.
 *
 * ── Shared cache entries ────────────────────────────────────────────────────
 * The tiles count what other screens manage, so they read through those
 * screens' query keys and API functions — the same key, the same function,
 * the same data. A verify in Incident Management, an approval in Content
 * Moderation or a status change on an inquiry already invalidates its module's
 * root, and the tile that counts it refreshes with the screen it came from.
 * The modules' own hooks are not called directly because they have no
 * `enabled` switch: a role without `moderation.view` would put a 403 in the
 * console on every visit to the dashboard.
 *
 * ── Freshness ───────────────────────────────────────────────────────────────
 * The page is a command centre left open on a second screen, so the tiles and
 * the urgent alerts poll every minute (React Query pauses that while the tab
 * is hidden). The metrics and the urgent-incident slice live under the
 * `dashboard` root, which no decision invalidates, so they rely on that
 * interval and on the focus refetch.
 */

import { useQuery } from "@tanstack/react-query";

import { usePermission } from "@/components/rbac/Can";
import { queryKeys } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import { staffApi } from "@/features/admin-roles/staff.api";
import { contactApi } from "@/features/contact/contact.api";
import { incidentsApi } from "@/features/incidents/incidents.api";
import type { IncidentScope } from "@/features/incidents/incidents.types";
import { moderationApi } from "@/features/moderation/moderation.api";
import { DEFAULT_QUEUE_PARAMS } from "@/features/moderation/moderation.queue";
import { dashboardApi } from "@/features/dashboard/dashboard.api";
import type { DashboardAccess, IncidentMetricsRange } from "@/features/dashboard/dashboard.types";

/** How often the live parts refresh while the tab is visible. */
const LIVE_INTERVAL_MS = 60_000;

/** The full queue's scope. Advocates are cut to their assignments by the server. */
const ALL_INCIDENTS: IncidentScope = "all";

// ── Access ──────────────────────────────────────────────────────────────────

/** What the signed-in role may read on this page (see `DashboardAccess`). */
export function useDashboardAccess(): DashboardAccess {
  const incidents = usePermission("incidents.view");
  const moderation = usePermission("moderation.view");
  const contact = usePermission("contact.view");
  const staff = usePermission("staff.view");
  const role = useAuthStore((s) => s.admin?.role ?? null);
  const selfId = useAuthStore((s) => s.admin?.id ?? null);
  return {
    incidents,
    moderation,
    contact,
    staff,
    // The server's access tier (contract §3.0), mirrored as the Incidents
    // screens mirror it: an advocate's incident figures are their assignments.
    assignedOnly: role === "advocate",
    selfId,
  };
}

// ── KPI tiles ───────────────────────────────────────────────────────────────

/** Incident tab counts — the Incidents screen's own cache entry. Needs `incidents.view`. */
export function useDashboardIncidentSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.incidents.summary(ALL_INCIDENTS),
    queryFn: () => incidentsApi.summary(ALL_INCIDENTS),
    enabled,
    refetchInterval: LIVE_INTERVAL_MS,
  });
}

/** Open moderation cases, with the urgent and safety totals. Needs `moderation.view`. */
export function useDashboardCaseSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.moderation.summary,
    queryFn: () => moderationApi.summary(),
    enabled,
    refetchInterval: LIVE_INTERVAL_MS,
  });
}

/** Contact inquiries per status. Needs `contact.view`. */
export function useDashboardContactSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.contact.summary,
    queryFn: () => contactApi.summary(),
    enabled,
    refetchInterval: LIVE_INTERVAL_MS,
  });
}

/** Active console accounts per role. Needs `staff.view` (superadmin). */
export function useDashboardStaffSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.staff.summary,
    queryFn: () => staffApi.summary(),
    enabled,
    // The roster changes when accounts change, not minute to minute.
    staleTime: 5 * 60_000,
  });
}

// ── Charts ──────────────────────────────────────────────────────────────────

/**
 * Activity and categories for one range. Both cards call this with the same
 * range, so they share one request. Switching range keeps the previous figures
 * on screen (dimmed) until the new ones arrive, rather than collapsing both
 * cards to a loading state between clicks.
 */
export function useIncidentMetrics(range: IncidentMetricsRange) {
  return useQuery({
    queryKey: queryKeys.dashboard.metrics(range),
    queryFn: () => dashboardApi.metrics(range),
    placeholderData: (previous) => previous,
    refetchInterval: 5 * LIVE_INTERVAL_MS,
  });
}

// ── Urgent Queue Alerts ─────────────────────────────────────────────────────

/**
 * The first page of the open queue in priority order — exactly what the
 * moderation queue opens on, so the two share a cache entry. Urgent and
 * safety-risk cases carry priority 100 or more (plan §4.4), so they lead it;
 * the card keeps only those. Needs `moderation.view`.
 */
export function useUrgentCases(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.moderation.list(DEFAULT_QUEUE_PARAMS),
    queryFn: () => moderationApi.listCases(DEFAULT_QUEUE_PARAMS),
    enabled,
    refetchInterval: LIVE_INTERVAL_MS,
  });
}

/**
 * Urgent incidents still waiting on someone (see `dashboardApi.urgentIncidents`
 * for what that means per role). Needs `incidents.view`.
 */
export function useUrgentIncidents(assignedOnly: boolean, enabled: boolean) {
  const params = { assignedOnly };
  return useQuery({
    queryKey: queryKeys.dashboard.urgentIncidents(params),
    queryFn: () => dashboardApi.urgentIncidents(params),
    enabled,
    refetchInterval: LIVE_INTERVAL_MS,
  });
}
