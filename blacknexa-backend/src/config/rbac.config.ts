/**
 * The permission matrix — the server's copy, and the authoritative one.
 *
 * The admin console carries the same matrix so it can hide controls a role
 * cannot use. That copy is a convenience; this one is the access control.
 * Anything the console hides is still reachable by hand, and every such call
 * lands on `requirePermission` before it reaches a controller.
 *
 * The two files must stay in step. They are small, static, and deliberately
 * parallel in shape (`admin-panel/src/lib/rbac.ts`) so a change to one is an
 * obvious prompt to change the other.
 */

import type { AdminRole } from "@/types/admin.interface";

/**
 * Discrete abilities, named `<subject>.<verb>`.
 *
 * `platform.*` has no counterpart in the console: those cover the operational
 * routes the Worker left open — refresh, backfill, prune, restore, payout
 * transitions — which no console screen exposes but which still need a guard.
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

  "contact.view",
  "contact.manage",
  "contact.delete",

  "faq.view",
  "faq.manage",
  "faq.delete",

  "audit.view",

  // Operational surface — not represented in the console.
  "platform.content",
  "platform.operate",
  "platform.restore",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Abilities per role.
 *
 * `superadmin` is listed exhaustively rather than given an implicit "everything"
 * shortcut. A wildcard would mean a new permission is granted to super admins
 * the moment it is declared, which is convenient right up to the first time it
 * is the wrong default.
 */
const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  superadmin: [
    "users.view", "users.edit", "users.role", "users.suspend", "users.delete", "users.bulk",
    "incidents.view", "incidents.verify", "incidents.dismiss", "incidents.notes",
    "incidents.assign", "incidents.deactivate",
    "moderation.view", "moderation.decide", "moderation.ban", "moderation.keywords",
    "staff.view", "staff.create", "staff.edit", "staff.role", "staff.reset",
    "staff.toggle", "staff.delete",
    "contact.view", "contact.manage", "contact.delete",
    "faq.view", "faq.manage", "faq.delete",
    "audit.view",
    "platform.content", "platform.operate", "platform.restore",
  ],
  moderator: [
    "users.view", "users.suspend",
    "incidents.view", "incidents.verify", "incidents.dismiss", "incidents.notes",
    "moderation.view", "moderation.decide", "moderation.ban", "moderation.keywords",
    "contact.view", "contact.manage",
    // Publishing an answer the whole user base reads is editorial work a
    // moderator does; deleting one is not, so `faq.delete` stays with superadmin.
    "faq.view", "faq.manage",
  ],
  /*
   * Advocate and Support Staff were once identical sets kept apart only by
   * intent: an advocate works assigned cases, support staff answer inquiries.
   * The contact queue is where that intent finally has a permission behind it,
   * which is the payoff for having listed them separately rather than aliased.
   */
  advocate: ["users.view", "incidents.view", "incidents.notes"],
  staff: [
    "users.view", "incidents.view", "incidents.notes",
    "contact.view", "contact.manage",
    // Read-only: support staff answer questions using the FAQ, they do not
    // decide what it says.
    "faq.view",
  ],
};

/** Sets for O(1) checks — `can()` runs on every guarded request. */
const PERMISSION_SETS = new Map<AdminRole, ReadonlySet<Permission>>(
  (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).map((role) => [
    role,
    new Set(ROLE_PERMISSIONS[role]),
  ]),
);

/** Whether `role` holds `permission`. An unknown role holds nothing. */
export function roleHasPermission(role: string, permission: Permission): boolean {
  return PERMISSION_SETS.get(role as AdminRole)?.has(permission) ?? false;
}

/** Every permission a role holds. Returned to the console on sign-in. */
export function permissionsForRole(role: AdminRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export default ROLE_PERMISSIONS;
