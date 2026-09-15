/**
 * Role-based access control — the shared vocabulary.
 *
 * Four roles, fixed at build time. This is deliberate: the brief calls for four
 * known roles, not a permission-authoring system, and a static union buys
 * compile-time checking that a dynamic matrix cannot. Adding a role is a code
 * change, which is the honest cost of the four-role model.
 *
 * The same four keys exist server-side (`AdminRole` in the backend), so a token
 * minted by the API maps straight onto this union with no translation table.
 */

/** Stable role keys. Sent by the API and stored in the token. */
export const ROLE_KEYS = ["superadmin", "moderator", "advocate", "staff"] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Human-facing role names, as they appear throughout the console. */
export const ROLE_LABELS: Record<RoleKey, string> = {
  superadmin: "Super Admin",
  moderator: "Moderator",
  advocate: "Advocate",
  staff: "Support Staff",
};

/** One-line description of the role's remit, shown on the roles screen. */
export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  superadmin: "Full console access, including staff and settings.",
  moderator: "Content moderation and incident triage. No staff or settings access.",
  advocate: "Assigned cases only. Read-only user profiles. No moderation queue.",
  staff: "Read-only across the console. Can add internal notes only.",
};

/** Short capability tag shown on the role KPI tiles. */
export const ROLE_TAGLINES: Record<RoleKey, string> = {
  superadmin: "Full Access",
  moderator: "Content Queue",
  advocate: "Case Handling",
  staff: "Inquiries & Triage",
};

/**
 * Navigable sections. One key per top-level sidebar entry.
 *
 * Sub-navigation is not keyed separately: a sub-item is reachable exactly when
 * its parent section is, with the single exception of "My Assigned Cases",
 * which is handled where it is rendered because its rule is about the shape of
 * the role rather than about access.
 */
export const NAV_SECTIONS = [
  "dashboard",
  "incidents",
  "moderation",
  "resources",
  "news",
  "notifications",
  "content",
  "users",
  "adminRoles",
  "settings",
] as const;

export type NavSection = (typeof NAV_SECTIONS)[number];

/**
 * Discrete abilities, named `<subject>.<verb>`.
 *
 * Viewing a section is governed by `nav`; these cover what can be *done* once
 * inside it. Keeping the two apart is what lets a role reach a screen read-only
 * — which is exactly the Support Staff and Advocate shape.
 */
export const PERMISSIONS = [
  "users.view",
  "users.edit",
  "users.role",
  "users.suspend",
  "users.delete",
  "users.bulk",

  "incidents.view",
  "incidents.verify",
  "incidents.dismiss",
  "incidents.notes",
  "incidents.assign",
  "incidents.deactivate",

  "moderation.view",
  "moderation.decide",
  "moderation.ban",
  "moderation.keywords",

  "staff.view",
  "staff.create",
  "staff.edit",
  "staff.role",
  "staff.reset",
  "staff.toggle",
  "staff.delete",

  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface RoleDefinition {
  key: RoleKey;
  label: string;
  description: string;
  tagline: string;
  nav: readonly NavSection[];
  permissions: readonly Permission[];
}
