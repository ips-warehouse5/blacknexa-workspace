/**
 * Route guards.
 *
 * `RequireAuth` keeps unauthenticated visitors out of the console.
 * `RequireSection` keeps a signed-in operator out of a section their role does
 * not cover.
 *
 * Both are conveniences, not defences. Anyone can edit the bundle; what stops
 * them reading data is that the API refuses the request. The value here is that
 * an operator never lands on a screen that will only show them errors.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Icon } from "@/components/ui/Icon";
import { useAuthStore } from "@/stores/auth.store";
import { ROLE_LABELS, type NavSection } from "@/types/rbac";

/**
 * Hold rendering until the stored session has been checked.
 *
 * Without this, a reload paints the login screen for the frame before the
 * refresh completes, and the operator sees a flash of being signed out.
 */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === "restoring") {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        Restoring your session…
      </div>
    );
  }

  if (status !== "authenticated") {
    // `state.from` lets the login screen return them to where they were headed.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/** Bar a section the role does not hold, and say so. */
export function RequireSection({ section }: { section: NavSection }) {
  const allowed = useAuthStore((s) => s.canNavigate(section));
  const role = useAuthStore((s) => s.admin?.role ?? null);

  if (allowed) return <Outlet />;

  return (
    <div id="accessDeniedView">
      <div className="denied-card">
        <div className="denied-icon">
          <Icon name="lock" />
        </div>
        <div className="denied-title">Access Restricted</div>
        <p className="denied-text">
          You do not have permission to open this section. If you need access, ask a Super
          Admin to review your role.
        </p>
        {role ? <div className="denied-role-chip">Signed in as {ROLE_LABELS[role]}</div> : null}
      </div>
    </div>
  );
}

/** Send a signed-in operator away from the login screen. */
export function RedirectIfAuthenticated() {
  const status = useAuthStore((s) => s.status);

  if (status === "restoring") {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  // "awaitingMfa" deliberately stays on the login route — the second factor is
  // rendered there, and redirecting mid-challenge would strand the operator.
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
