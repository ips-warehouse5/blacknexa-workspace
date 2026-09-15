/**
 * Contact-us inquiry endpoints.
 *
 * Filtering and paging happen server-side. An inbox is the one list in this
 * console that only grows — nobody prunes enquiries the way they close
 * incidents — so downloading it whole was never going to hold.
 */

import { apiDelete, apiGet, apiGetPage, apiPatch } from "@/lib/http";
import type { Paginated } from "@/types/api";
import type {
  ContactInquiry,
  ContactListParams,
  ContactSummary,
  UpdateContactInput,
} from "@/features/contact/contact.types";

const BASE = "/admin/contact";

/**
 * Turn UI filter state into query parameters.
 *
 * "all" is dropped rather than sent, so the API sees an absent filter instead
 * of having to understand a sentinel.
 */
function toQuery(params: ContactListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search.trim()) query.search = params.search.trim();
  if (params.status !== "all") query.status = params.status;
  if (params.subject !== "all") query.subject = params.subject;
  return query;
}

export const contactApi = {
  /** One page of the queue. */
  async list(params: ContactListParams): Promise<Paginated<ContactInquiry>> {
    const { items, pagination } = await apiGetPage<ContactInquiry>(BASE, {
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
   * Counts per status.
   *
   * A separate call rather than counting the current page: the tiles describe
   * the whole queue, and page one of a filtered list is not that.
   */
  summary(): Promise<ContactSummary> {
    return apiGet<ContactSummary>(`${BASE}/summary`);
  },

  get(id: string): Promise<ContactInquiry> {
    return apiGet<ContactInquiry>(`${BASE}/${id}`);
  },

  /** Change the status, the internal note, or both. */
  update(id: string, input: UpdateContactInput): Promise<ContactInquiry> {
    return apiPatch<ContactInquiry>(`${BASE}/${id}`, input);
  },

  remove(id: string): Promise<null> {
    return apiDelete<null>(`${BASE}/${id}`);
  },
};

export default contactApi;
