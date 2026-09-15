/**
 * Staff directory shapes.
 *
 * A staff member and the signed-in operator are the same kind of record, but
 * they are typed separately: `AdminProfile` is "who I am" and carries session
 * concerns, while `StaffMember` is "a row in the directory" and carries
 * management concerns. Collapsing them would mean the list endpoint had to
 * return session fields it has no business knowing.
 */

import type { RoleKey } from "@/types/rbac";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  /** Whether the account may sign in. Disabled accounts are kept, not deleted. */
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type StaffStatusFilter = "all" | "active" | "disabled";
export type StaffRoleFilter = RoleKey | "all";

export interface StaffListParams {
  page: number;
  limit: number;
  search: string;
  role: StaffRoleFilter;
  status: StaffStatusFilter;
}

/** Active-account counts per role, for the KPI tiles. */
export type StaffSummary = Record<RoleKey, number>;

export interface CreateStaffInput {
  name: string;
  email: string;
  role: RoleKey;
  password: string;
}

export interface UpdateStaffInput {
  name?: string;
  role?: RoleKey;
}
