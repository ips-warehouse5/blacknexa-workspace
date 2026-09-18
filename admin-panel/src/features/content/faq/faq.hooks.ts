/**
 * React Query bindings for the FAQ editor.
 *
 * Every mutation invalidates the whole `faq` root rather than just the list,
 * because a publish moves a row *and* moves two tab counts. A narrower
 * invalidation would leave the tabs contradicting the table beneath them —
 * the same reasoning as the contact queue.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/app/providers/ToastProvider";
import { queryKeys } from "@/lib/query-client";
import { faqApi } from "@/features/content/faq/faq.api";
import type {
  CreateFaqInput,
  FaqListParams,
  UpdateFaqInput,
} from "@/features/content/faq/faq.types";
import { ApiError } from "@/types/api";

export function useFaqList(params: FaqListParams) {
  return useQuery({
    queryKey: queryKeys.faq.list(params),
    queryFn: () => faqApi.list(params),
    // Keeps the previous page on screen while the next loads, so paging does
    // not flash an empty table between clicks.
    placeholderData: (previous) => previous,
  });
}

export function useFaqSummary() {
  return useQuery({
    queryKey: queryKeys.faq.summary,
    queryFn: () => faqApi.summary(),
  });
}

export function useFaqCategories() {
  return useQuery({
    queryKey: queryKeys.faq.categories,
    queryFn: () => faqApi.categories(),
    // Categories are seeded and change about never; refetching them on every
    // dialog open would be a request for data that cannot have moved.
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateFaq() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.faq.all });
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useCreateFaq() {
  const invalidate = useInvalidateFaq();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateFaqInput) => faqApi.create(input),
    onSuccess: (faq) => {
      void invalidate();
      // Names the state it landed in, because a new entry defaults to draft and
      // an editor who expected it live needs to know it is not.
      toast.success(
        "FAQ created",
        faq.status === "published"
          ? "It is now live on the surfaces you selected."
          : "It is saved as a draft and is not shown to anyone yet.",
      );
    },
    onError: (error) => {
      toast.error("Could not create the FAQ", messageFor(error, "Please try again."));
    },
  });
}

export function useUpdateFaq() {
  const invalidate = useInvalidateFaq();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFaqInput }) =>
      faqApi.update(id, input),
    onSuccess: (faq, variables) => {
      void invalidate();
      // A status change is the one edit worth calling out by name: it is the
      // difference between a private draft and something every member reads.
      if (variables.input.status && variables.input.status !== undefined) {
        toast.success(
          faq.status === "published" ? "FAQ published" : "FAQ unpublished",
          faq.status === "published"
            ? "It is now live on the surfaces you selected."
            : "It has been taken down and is no longer shown.",
        );
        return;
      }
      toast.success("FAQ updated", "The answer has been saved.");
    },
    onError: (error) => {
      toast.error("Could not save the change", messageFor(error, "Please try again."));
    },
  });
}

export function useDeleteFaq() {
  const invalidate = useInvalidateFaq();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => faqApi.remove(id),
    onSuccess: () => {
      void invalidate();
      toast.success("FAQ removed", "It is no longer shown in the app or on the website.");
    },
    onError: (error) => {
      toast.error("Could not remove the FAQ", messageFor(error, "Please try again."));
    },
  });
}
