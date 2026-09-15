/**
 * React Query bindings for the staff directory.
 *
 * Every mutation invalidates both the list and the summary, because a role
 * change or a disable moves a row *and* moves a KPI count. Invalidating only
 * the list would leave the tiles showing a number that contradicts the table
 * directly beneath them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/app/providers/ToastProvider";
import { queryKeys } from "@/lib/query-client";
import { staffApi } from "@/features/admin-roles/staff.api";
import type {
  CreateStaffInput,
  StaffListParams,
  UpdateStaffInput,
} from "@/features/admin-roles/staff.types";
import { ApiError } from "@/types/api";

/** A page of the directory, matching the current filters. */
export function useStaffList(params: StaffListParams) {
  return useQuery({
    queryKey: queryKeys.staff.list(params),
    queryFn: () => staffApi.list(params),
    // Keeps the previous page on screen while the next one loads, so paging
    // does not flash an empty table between clicks.
    placeholderData: (previous) => previous,
  });
}

/** Active-account counts per role. */
export function useStaffSummary() {
  return useQuery({
    queryKey: queryKeys.staff.summary,
    queryFn: () => staffApi.summary(),
  });
}

/** Invalidate everything a write to the directory could have changed. */
function useInvalidateStaff() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
}

/** Turn any thrown value into something worth showing an operator. */
function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useCreateStaff() {
  const invalidate = useInvalidateStaff();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateStaffInput) => staffApi.create(input),
    onSuccess: (staff) => {
      void invalidate();
      toast.success("Account created", `${staff.name} can now sign in to the console.`);
    },
    onError: (error) => {
      toast.error("Could not create the account", messageFor(error, "Please try again."));
    },
  });
}

export function useUpdateStaff() {
  const invalidate = useInvalidateStaff();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffInput }) =>
      staffApi.update(id, input),
    onSuccess: (staff) => {
      void invalidate();
      toast.success("Account updated", `Changes to ${staff.name} have been saved.`);
    },
    onError: (error) => {
      toast.error("Could not save the changes", messageFor(error, "Please try again."));
    },
  });
}

export function useSetStaffActive() {
  const invalidate = useInvalidateStaff();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      staffApi.setActive(id, isActive),
    onSuccess: (staff) => {
      void invalidate();
      toast.success(
        staff.isActive ? "Account enabled" : "Account disabled",
        staff.isActive
          ? `${staff.name} can sign in again.`
          : `${staff.name} has been signed out and can no longer sign in.`,
      );
    },
    onError: (error) => {
      toast.error("Could not change the account", messageFor(error, "Please try again."));
    },
  });
}

/**
 * Reset a staff member's password.
 *
 * No toast on success: the caller shows the generated password in a dialog, and
 * a toast that vanishes after four seconds is the wrong place for a value the
 * operator has to copy.
 */
export function useResetStaffPassword() {
  const invalidate = useInvalidateStaff();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => staffApi.resetPassword(id),
    onSuccess: () => void invalidate(),
    onError: (error) => {
      toast.error("Could not reset the password", messageFor(error, "Please try again."));
    },
  });
}

export function useDeleteStaff() {
  const invalidate = useInvalidateStaff();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => staffApi.remove(id),
    onSuccess: () => {
      void invalidate();
      toast.success("Account removed", "The operator account has been deleted.");
    },
    onError: (error) => {
      toast.error("Could not remove the account", messageFor(error, "Please try again."));
    },
  });
}
