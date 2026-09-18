/**
 * Shown the instant a navigation to `/` starts, while it re-renders
 * server-side (`export const dynamic = "force-dynamic"` in `page.tsx`,
 * needed so the News section always reflects the backend's current state).
 *
 * Without this, clicking the header logo — or any other link back to the
 * homepage — gave no feedback for however long that render took: the URL
 * and page stayed exactly as they were until the response arrived, which
 * reads exactly like the click did nothing. The root layout keeps Header
 * and Footer mounted around this (see `src/app/layout.tsx`), so only the
 * content area between them swaps to this state.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 py-24"
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 animate-spin rounded-full border-[3px] border-border border-t-accent"
      />
      <span className="text-sm text-text-muted">Loading BlackNexa…</span>
    </div>
  );
}
