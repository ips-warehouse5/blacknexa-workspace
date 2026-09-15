/**
 * The permission matrix, and the helpers that read it.
 *
 * This file is the single client-side source of truth for who can see and do
 * what. It mirrors the matrix the API enforces — and mirroring is all it is.
 * Hiding a button stops an honest user from reaching a dead end; it stops
 * nobody from calling the endpoint. Every ability listed here is checked again
 * server-side, and that check is the one that matters.
 */

import {
  ROLE_DESCRIPTIONS,
  ROLE_KEYS,
  ROLE_LABELS,
  ROLE_TAGLINES,
  type NavSection,
  type Permission,
  type RoleDefinition,
  type RoleKey,
} from "@/types/rbac";

/** Ability sets, defined once per role and shared by the derived lookups below. */
const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  superadmin: [
    "users.view", "users.edit", "users.role", "users.suspend", "users.delete", "users.bulk",
    "incidents.view", "incidents.verify", "incidents.dismiss", "incidents.notes",
    "incidents.assign", "incidents.deactivate",
    "moderation.view", "moderation.decide", "moderation.ban", "moderation.keywords",
    "staff.view", "staff.create", "staff.edit", "staff.role", "staff.reset",
    "staff.toggle", "staff.delete",
    "audit.view",
  ],
  moderator: [
    "users.view", "users.suspend",
    "incidents.view", "incidents.verify", "incidents.dismiss", "incidents.notes",
    "moderation.view", "moderation.decide", "moderation.ban", "moderation.keywords",
  ],
  // Advocate and Support Staff carry the same abilities but differ in intent:
  // an advocate works the cases assigned to them, support staff answer
  // inquiries. They are listed separately rather than aliased so that changing
  // one later does not silently change the other.
  advocate: ["users.view", "incidents.view", "incidents.notes"],
  staff: ["users.view", "incidents.view", "incidents.notes"],
};

/** Sections each role may open. */
const ROLE_NAV: Record<RoleKey, readonly NavSection[]> = {
  superadmin: [
    "dashboard", "incidents", "moderation", "resources", "news",
    "notifications", "content", "users", "adminRoles", "settings",
  ],
  moderator: ["dashboard", "incidents", "moderation", "users"],
  advocate: ["dashboard", "incidents", "users"],
  staff: ["dashboard", "incidents", "users"],
};

/** Fully-resolved definitions, keyed by role. */
export const ROLES: Record<RoleKey, RoleDefinition> = ROLE_KEYS.reduce(
  (acc, key) => {
    acc[key] = {
      key,
      label: ROLE_LABELS[key],
      description: ROLE_DESCRIPTIONS[key],
      tagline: ROLE_TAGLINES[key],
      nav: ROLE_NAV[key],
      permissions: ROLE_PERMISSIONS[key],
    };
    return acc;
  },
  {} as Record<RoleKey, RoleDefinition>,
);

/** Every role, in console display order (most to least privileged). */
export const ROLE_LIST: RoleDefinition[] = ROLE_KEYS.map((k) => ROLES[k]);

/**
 * Sets rather than arrays for the hot path: `can()` runs on most renders, and
 * an O(1) lookup keeps a permission check off the profiler.
 */
const PERMISSION_SETS: Record<RoleKey, ReadonlySet<Permission>> = ROLE_KEYS.reduce(
  (acc, key) => {
    acc[key] = new Set(ROLE_PERMISSIONS[key]);
    return acc;
  },
  {} as Record<RoleKey, Set<Permission>>,
);

const NAV_SETS: Record<RoleKey, ReadonlySet<NavSection>> = ROLE_KEYS.reduce(
  (acc, key) => {
    acc[key] = new Set(ROLE_NAV[key]);
    return acc;
  },
  {} as Record<RoleKey, Set<NavSection>>,
);

/** Whether `role` holds `permission`. Unknown roles hold nothing. */
export function roleCan(role: RoleKey | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_SETS[role]?.has(permission) ?? false;
}

/** Whether `role` may open `section`. */
export function roleCanNavigate(role: RoleKey | null | undefined, section: NavSection): boolean {
  if (!role) return false;
  return NAV_SETS[role]?.has(section) ?? false;
}

/** Narrowing guard for values arriving from the API or storage. */
export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && (ROLE_KEYS as readonly string[]).includes(value);
}

/**
 * The section a role should land on after signing in.
 *
 * Every role can reach the dashboard today, so this is constant — but routing
 * through a function means a role that loses dashboard access later fails
 * visibly here rather than landing on a denied screen.
 */
export function landingSection(role: RoleKey): NavSection {
  return roleCanNavigate(role, "dashboard") ? "dashboard" : (ROLE_NAV[role][0] ?? "dashboard");
}
