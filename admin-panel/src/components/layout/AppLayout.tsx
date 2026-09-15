/**
 * The signed-in shell: sidebar plus the routed content column.
 *
 * Two details worth naming:
 *
 * A skip link is the first thing in the tab order, because the sidebar is a
 * dozen stops and a keyboard user should not have to walk it on every
 * navigation.
 *
 * Route changes move focus to the content heading and announce the new page.
 * A client-side navigation replaces the page without telling a screen reader
 * anything, so without this an operator hears silence and has no idea they
 * arrived.
 */

import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";

export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  /** Skips the focus move on first paint — nothing has navigated yet. */
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Focus the region rather than a specific heading: the heading belongs to
    // the screen, and not every screen guarantees one at the same depth.
    mainRef.current?.focus();
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <Sidebar />

      <main
        id="main-content"
        ref={mainRef}
        className="main"
        // -1 makes it programmatically focusable without adding a tab stop.
        tabIndex={-1}
      >
        <Suspense fallback={<div className="route-loading">Loading…</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export default AppLayout;
