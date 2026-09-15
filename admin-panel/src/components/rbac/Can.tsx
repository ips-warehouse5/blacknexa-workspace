/**
 * Permission-aware rendering.
 *
 * There are two honest ways to handle an action a role cannot take, and they
 * suit different cases:
 *
 *   `<Can>`     — render nothing. Right when the control would be meaningless,
 *                 e.g. a bulk-action bar for a read-only role.
 *   `deniedReason` on Button — render it disabled, with a reason. Right when the
 *                 action visibly exists for other operators, so hiding it would
 *                 read as a missing feature rather than a closed door.
 *
 * Neither is a security boundary. The API decides.
 */

import type { ReactNode } from "react";

import { useAuthStore } from "@/stores/auth.store";
import { ROLE_LABELS, type NavSection, type Permission } from "@/types/rbac";

export interface CanProps {
  /** Render children only if the role holds this. */
  perform?: Permission;
  /** Render children only if the role may open this section. */
  section?: NavSection;
  /** Rendered instead when the check fails. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ perform, section, fallback = null, children }: CanProps) {
  const allowed = useAuthStore((s) => {
    if (perform && !s.can(perform)) return false;
    if (section && !s.canNavigate(section)) return false;
    return true;
  });

  return <>{allowed ? children : fallback}</>;
}

/** Imperative form, for logic that is not a render decision. */
export function usePermission(permission: Permission): boolean {
  return useAuthStore((s) => s.can(permission));
}

/** Whether the current role may open a section. */
export function useCanNavigate(section: NavSection): boolean {
  return useAuthStore((s) => s.canNavigate(section));
}

/**
 * The reason a control is locked, or undefined when it is not.
 *
 * Shaped to drop straight into `Button`'s `deniedReason`, so a call site reads
 * `deniedReason={useDeniedReason("staff.create")}` and needs no branch.
 */
export function useDeniedReason(permission: Permission): string | undefined {
  const allowed = usePermission(permission);
  const role = useAuthStore((s) => s.admin?.role ?? null);
  if (allowed) return undefined;
  // Naming the role makes the lock legible: "this needs a bigger account" reads
  // very differently from "this is broken".
  return role
    ? `Not available for ${ROLE_LABELS[role]} — requires elevated permission.`
    : "Sign in to do that.";
}
