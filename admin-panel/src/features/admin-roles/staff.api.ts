/**
 * Staff directory endpoints.
 *
 * Filters go to the server rather than being applied to a full download. A
 * four-row fixture would not care, but a directory that grows to hundreds would,
 * and moving that later means rewriting the screen — so it is server-side from
 * the start.
 */

import { apiDelete, apiGet, apiGetPage, apiPatch, apiPost } from "@/lib/http";
import type { Paginated } from "@/types/api";
import type {
  CreateStaffInput,
  StaffListParams,
  StaffMember,
  StaffSummary,
  UpdateStaffInput,
} from "@/features/admin-roles/staff.types";

const BASE = "/admin/staff";

/**
 * Turn UI filter state into query parameters.
 *
 * "all" is dropped rather than sent, so the API sees an absent filter instead
 * of having to understand a sentinel value.
 */
function toQuery(params: StaffListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search.trim()) query.search = params.search.trim();
  if (params.role !== "all") query.role = params.role;
  if (params.status !== "all") query.status = params.status;
  return query;
}

export const staffApi = {
  /** One page of the directory. */
  async list(params: StaffListParams): Promise<Paginated<StaffMember>> {
    const { items, pagination } = await apiGetPage<StaffMember>(BASE, {
      params: toQuery(params),
    });
    return {
      items,
      // A server that omits the block still yields a usable single page rather
      // than crashing the footer on a missing `total`.
      pagination: pagination ?? {
        page: params.page,
        limit: params.limit,
        total: items.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  },

  /**
   * Active-account counts per role.
   *
   * A separate call rather than counting the current page: the tiles describe
   * the whole directory, and page one of a filtered list is not that.
   */
  summary(): Promise<StaffSummary> {
    return apiGet<StaffSummary>(`${BASE}/summary`);
  },

  create(input: CreateStaffInput): Promise<StaffMember> {
    return apiPost<StaffMember>(BASE, input);
  },

  update(id: string, input: UpdateStaffInput): Promise<StaffMember> {
    return apiPatch<StaffMember>(`${BASE}/${id}`, input);
  },

  /** Enable or disable console access without deleting the account. */
  setActive(id: string, isActive: boolean): Promise<StaffMember> {
    return apiPatch<StaffMember>(`${BASE}/${id}/status`, { isActive });
  },

  /**
   * Issue a new temporary password.
   *
   * The API returns it once, in this response, and stores only the hash — so
   * the value shown to the operator afterwards is the only copy that exists.
   */
  resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    return apiPost<{ temporaryPassword: string }>(`${BASE}/${id}/reset-password`);
  },

  remove(id: string): Promise<null> {
    return apiDelete<null>(`${BASE}/${id}`);
  },
};

export default staffApi;
