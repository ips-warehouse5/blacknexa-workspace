/**
 * Status pills.
 *
 * The ported CSS defines a class per status (`.badge.verified`, `.badge.draft`
 * …). Rather than let callers pass a raw class name, the statuses are enumerated
 * here so a typo is a type error instead of an unstyled grey pill.
 */

import type { ReactNode } from "react";

/** Every status the design has a pill for. */
export type BadgeTone =
  | "public"
  | "private"
  | "submitted"
  | "under_review"
  | "verified"
  | "dismissed"
  | "deactivated"
  | "pending"
  | "published"
  | "active"
  | "draft"
  | "approved"
  | "rejected"
  | "suspended"
  | "deleted";

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone, children, className = "" }: BadgeProps) {
  return <span className={`badge ${tone} ${className}`.trim()}>{children}</span>;
}

/**
 * The role pill used in the staff directory and the role KPI tiles.
 *
 * Separate from `Badge` because it is a different scale in the design and keys
 * off role rather than status — sharing one component would mean one union
 * covering two unrelated vocabularies.
 */
export function RoleBadge({
  role,
  children,
  className = "",
}: {
  role: "superadmin" | "moderator" | "advocate" | "staff";
  children: ReactNode;
  className?: string;
}) {
  return <span className={`role-badge-pill ${role} ${className}`.trim()}>{children}</span>;
}

export default Badge;
