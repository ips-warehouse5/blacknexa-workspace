/**
 * Keyword rule endpoints (contract §2.10, plan §4.5).
 *
 * Paged and filtered server-side like every other console list. The rule set is
 * small today, but the matcher's cache on the server is keyed by the table's
 * own change marker, so an edit made here is live on the next moderation run on
 * every replica — there is no "publish rules" step for the console to model.
 *
 * Delete is a soft delete: the rule stops matching and disappears from the
 * list, while its detection history stays behind for the audit log.
 */

import { apiDelete, apiGetPage, apiPatch, apiPost } from "@/lib/http";
import type { Paginated } from "@/types/api";
import type {
  CreateKeywordRuleInput,
  KeywordRule,
  KeywordRuleListParams,
  UpdateKeywordRuleInput,
} from "@/features/moderation/keywordRules.types";

const BASE = "/admin/moderation/keyword-rules";

/**
 * The server's cap on `search` (`moderation.ruleList`). Longer input is refused
 * with a 400, which would replace the table with an error for what is only an
 * over-long search; no rule name (80) or term (80) is that long anyway.
 */
const SEARCH_MAX = 120;

/**
 * Turn UI filter state into query parameters.
 *
 * "all" is dropped rather than sent, so the API sees an absent filter instead
 * of having to understand a sentinel value.
 */
function toQuery(params: KeywordRuleListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  const search = params.search.trim().slice(0, SEARCH_MAX);
  if (search) query.search = search;
  if (params.action !== "all") query.action = params.action;
  if (params.category !== "all") query.category = params.category;
  return query;
}

export const keywordRulesApi = {
  /** One page of rules — system rules first, then by name. */
  async list(params: KeywordRuleListParams): Promise<Paginated<KeywordRule>> {
    const { items, pagination } = await apiGetPage<KeywordRule>(BASE, {
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

  create(input: CreateKeywordRuleInput): Promise<KeywordRule> {
    return apiPost<KeywordRule>(BASE, input);
  },

  /** Change any subset of the fields — including just `enabled`, for the table's switch. */
  update(id: string, input: UpdateKeywordRuleInput): Promise<KeywordRule> {
    return apiPatch<KeywordRule>(`${BASE}/${id}`, input);
  },

  remove(id: string): Promise<{ id: string; deleted: true }> {
    return apiDelete<{ id: string; deleted: true }>(`${BASE}/${id}`);
  },
};

export default keywordRulesApi;
