/**
 * React Query bindings for the contact-us queue.
 *
 * Every mutation invalidates the whole `contact` root rather than just the
 * list, because a status change moves a row *and* moves two KPI counts. A
 * narrower invalidation would leave the tiles contradicting the table directly
 * beneath them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/app/providers/ToastProvider";
import { queryKeys } from "@/lib/query-client";
import { contactApi } from "@/features/contact/contact.api";
import {
  CONTACT_STATUS_LABELS,
  type ContactListParams,
  type UpdateContactInput,
} from "@/features/contact/contact.types";
import { ApiError } from "@/types/api";

/** A page of the queue, matching the current filters. */
export function useContactList(params: ContactListParams) {
  return useQuery({
    queryKey: queryKeys.contact.list(params),
    queryFn: () => contactApi.list(params),
    // Keeps the previous page on screen while the next loads, so paging does
    // not flash an empty table between clicks.
    placeholderData: (previous) => previous,
  });
}

/** Counts per status. */
export function useContactSummary() {
  return useQuery({
    queryKey: queryKeys.contact.summary,
    queryFn: () => contactApi.summary(),
  });
}

/** Invalidate everything a write to the queue could have changed. */
function useInvalidateContact() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.contact.all });
}

/** Turn any thrown value into something worth showing an operator. */
function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useUpdateContactInquiry() {
  const invalidate = useInvalidateContact();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInput }) =>
      contactApi.update(id, input),
    onSuccess: (inquiry, variables) => {
      void invalidate();
      // The toast names whichever change the operator actually made, so saving
      // a note does not claim the status moved.
      toast.success(
        variables.input.status ? "Status updated" : "Note saved",
        variables.input.status
          ? `${inquiry.name}'s enquiry is now ${CONTACT_STATUS_LABELS[inquiry.status]}.`
          : `Your note on ${inquiry.name}'s enquiry has been saved.`,
      );
    },
    onError: (error) => {
      toast.error("Could not save the change", messageFor(error, "Please try again."));
    },
  });
}

export function useDeleteContactInquiry() {
  const invalidate = useInvalidateContact();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => contactApi.remove(id),
    onSuccess: () => {
      void invalidate();
      toast.success("Enquiry removed", "It has been taken off the queue.");
    },
    onError: (error) => {
      toast.error("Could not remove the enquiry", messageFor(error, "Please try again."));
    },
  });
}
