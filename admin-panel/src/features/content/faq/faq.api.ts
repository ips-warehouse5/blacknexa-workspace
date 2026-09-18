/**
 * FAQ endpoints.
 *
 * Paging and filtering happen server-side, matching the contact queue. The list
 * is small today, but it is content an editor adds to indefinitely and there is
 * no reason to build the one screen that has to be rewritten when it grows.
 */

import { apiDelete, apiGet, apiGetPage, apiPatch, apiPost } from "@/lib/http";
import type { Paginated } from "@/types/api";
import type {
  CreateFaqInput,
  Faq,
  FaqCategory,
  FaqListParams,
  FaqSummary,
  UpdateFaqInput,
} from "@/features/content/faq/faq.types";

const BASE = "/admin/faqs";

/** UI filter state → query parameters. "all" is dropped rather than sent. */
function toQuery(params: FaqListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search.trim()) query.search = params.search.trim();
  if (params.status !== "all") query.status = params.status;
  if (params.categoryId !== "all") query.categoryId = params.categoryId;
  return query;
}

export const faqApi = {
  async list(params: FaqListParams): Promise<Paginated<Faq>> {
    const { items, pagination } = await apiGetPage<Faq>(BASE, { params: toQuery(params) });
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

  /** Counts for the tabs. The whole table, not the current page. */
  summary(): Promise<FaqSummary> {
    return apiGet<FaqSummary>(`${BASE}/summary`);
  },

  /**
   * Every category, for the editor's dropdown.
   *
   * Its own call rather than derived from the rows on screen: page two of a
   * filtered table does not contain every category, and an editor moving an
   * entry needs the full set regardless of what is currently listed.
   */
  categories(): Promise<FaqCategory[]> {
    return apiGet<FaqCategory[]>(`${BASE}/categories`);
  },

  create(input: CreateFaqInput): Promise<Faq> {
    return apiPost<Faq>(BASE, input);
  },

  update(id: string, input: UpdateFaqInput): Promise<Faq> {
    return apiPatch<Faq>(`${BASE}/${id}`, input);
  },

  remove(id: string): Promise<null> {
    return apiDelete<null>(`${BASE}/${id}`);
  },
};

export default faqApi;
