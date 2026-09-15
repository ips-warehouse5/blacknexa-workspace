/**
 * React Query configuration.
 *
 * The defaults here are tuned for an operations console rather than a public
 * site: data is read by a handful of people who act on it, so freshness matters
 * more than request count, but a 403 or a 404 is a settled answer and retrying
 * it only delays the message the operator needs to see.
 */

import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/types/api";

/** Retry transient failures only, and not many times. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) {
    // 4xx means the request was understood and refused. Asking again changes
    // nothing, and on 401 the interceptor has already tried a refresh.
    if (error.status >= 400 && error.status < 500) return false;
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Long enough that moving between screens does not refetch everything,
      // short enough that a queue does not go visibly stale while being worked.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetry,
      // Coming back to the tab after a while should show current data: in a
      // moderation queue, acting on a stale row is the failure mode that costs.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      // A write is not safe to repeat on its own — the caller decides.
      retry: false,
    },
  },
});

/**
 * Query key roots.
 *
 * Centralised so an invalidation cannot miss a cache through a typo, and so the
 * full set of cached resources is readable in one place.
 */
export const queryKeys = {
  auth: { me: ["auth", "me"] as const },
  staff: {
    all: ["staff"] as const,
    list: (params: unknown) => ["staff", "list", params] as const,
    detail: (id: string) => ["staff", "detail", id] as const,
    summary: ["staff", "summary"] as const,
  },
} as const;

export default queryClient;
