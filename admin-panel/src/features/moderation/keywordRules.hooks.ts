/**
 * React Query bindings for keyword rules.
 *
 * Every write invalidates the `keywordRules` root. The moderation queue is left
 * alone on purpose: a rule change affects the *next* automated check, never a
 * case already open, so there is nothing in the queue for it to refresh — and
 * saying so is part of the delete dialog's copy.
 *
 * A failed update or delete that answers 404 or 409 also invalidates (review
 * Q16): the rule was deleted or renamed by someone else, so the row on screen
 * is stale, and without a refetch it stayed there — every toggle or Save
 * against it failing the same way until the window next regained focus.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/app/providers/ToastProvider";
import { queryKeys } from "@/lib/query-client";
import { keywordRulesApi } from "@/features/moderation/keywordRules.api";
import type {
  CreateKeywordRuleInput,
  KeywordRuleListParams,
  UpdateKeywordRuleInput,
} from "@/features/moderation/keywordRules.types";
import { ApiError } from "@/types/api";

/** A page of rules, matching the current filters. */
export function useKeywordRules(params: KeywordRuleListParams) {
  return useQuery({
    queryKey: queryKeys.keywordRules.list(params),
    queryFn: () => keywordRulesApi.list(params),
    // Keeps the previous page on screen while the next loads, so paging does
    // not flash an empty table between clicks.
    placeholderData: (previous) => previous,
  });
}

/** Invalidate everything a write to the rules could have changed. */
function useInvalidateKeywordRules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.keywordRules.all });
}

/** Turn any thrown value into something worth showing an operator. */
function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Whether a failed write means the list on screen no longer matches the
 * server: the rule is gone (404) or its name now clashes with a concurrent
 * rename (409).
 */
function isStaleRuleError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 409);
}

export function useCreateKeywordRule() {
  const invalidate = useInvalidateKeywordRules();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateKeywordRuleInput) => keywordRulesApi.create(input),
    onSuccess: (rule) => {
      void invalidate();
      toast.success(
        "Rule added",
        `${rule.name} ${rule.enabled ? "applies from the next automated check" : "is saved, switched off"}.`,
      );
    },
    onError: (error) => {
      toast.error("Could not add the rule", messageFor(error, "Please try again."));
    },
  });
}

export function useUpdateKeywordRule() {
  const invalidate = useInvalidateKeywordRules();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateKeywordRuleInput }) =>
      keywordRulesApi.update(id, input),
    onSuccess: (rule, { input }) => {
      void invalidate();
      // The table's switch sends `enabled` alone; that change gets its own
      // wording so a toggle does not read as "rule edited".
      const toggleOnly = Object.keys(input).length === 1 && input.enabled !== undefined;
      if (toggleOnly) {
        toast.success(
          rule.enabled ? "Rule switched on" : "Rule switched off",
          rule.enabled
            ? `${rule.name} applies from the next automated check.`
            : `${rule.name} no longer matches new content.`,
        );
      } else {
        toast.success(
          "Rule updated",
          `${rule.name} now matches ${rule.terms.length} term${rule.terms.length === 1 ? "" : "s"}.`,
        );
      }
    },
    onError: (error) => {
      toast.error("Could not save the rule", messageFor(error, "Please try again."));
      if (isStaleRuleError(error)) void invalidate();
    },
  });
}

export function useDeleteKeywordRule() {
  const invalidate = useInvalidateKeywordRules();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => keywordRulesApi.remove(id),
    onSuccess: (_result, { name }) => {
      void invalidate();
      toast.success("Rule removed", `${name} no longer flags content automatically.`);
    },
    onError: (error) => {
      toast.error("Could not remove the rule", messageFor(error, "Please try again."));
      if (isStaleRuleError(error)) void invalidate();
    },
  });
}
