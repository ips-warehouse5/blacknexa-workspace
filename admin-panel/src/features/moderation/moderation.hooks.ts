/**
 * React Query bindings for Content Moderation.
 *
 * Every decision invalidates the whole `moderation` root — the case moves out of
 * the open list, a tab count drops, and the detail it was decided from now
 * shows the resolution — and the `incidents` root as well, because approving or
 * rejecting changes a report's publication state, which Incident Management
 * displays and gates its own actions on ("Resolve the moderation case first").
 * A narrower invalidation would leave one of those screens contradicting the
 * other.
 *
 * A 409 or 404 on a decision means the case changed underneath the moderator:
 * someone else decided it, the author deleted the report, an edit landed. The
 * error toast carries the server's explanation, and the case is refetched so
 * the page shows what actually happened instead of offering buttons that can
 * no longer work.
 */

import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/app/providers/ToastProvider";
import { queryKeys } from "@/lib/query-client";
import { moderationApi } from "@/features/moderation/moderation.api";
import { checkInFlight, checkPollInterval } from "@/features/moderation/moderation.detail";
import type {
  ApproveCaseInput,
  BanMemberInput,
  CaseListParams,
  RejectCaseInput,
  RejectEvidenceInput,
  UnbanMemberInput,
} from "@/features/moderation/moderation.types";
import { ApiError } from "@/types/api";

/** A page of the queue, matching the current tab, filters and sort. */
export function useCaseList(params: CaseListParams) {
  return useQuery({
    queryKey: queryKeys.moderation.list(params),
    queryFn: () => moderationApi.listCases(params),
    // Keeps the previous page on screen while the next one loads, so paging
    // and switching tabs do not flash an empty table between clicks.
    placeholderData: (previous) => previous,
  });
}

/** Open-case counts per tab. */
export function useCaseSummary() {
  return useQuery({
    queryKey: queryKeys.moderation.summary,
    queryFn: () => moderationApi.summary(),
  });
}

/**
 * Fetch one page of the queue on demand, through the same cache entry the
 * queue screen reads.
 *
 * Used by the detail page's previous/next when the moderator walks off the end
 * of the page they opened the case from (review Q12). Always a fresh read
 * (`staleTime: 0`): deciding cases shrinks the open list, and continuing from
 * a cached page would skip the cases that moved up into it.
 */
export function useFetchCasePage() {
  const queryClient = useQueryClient();
  return useCallback(
    (params: CaseListParams) =>
      queryClient.fetchQuery({
        queryKey: queryKeys.moderation.list(params),
        queryFn: () => moderationApi.listCases(params),
        staleTime: 0,
      }),
    [queryClient],
  );
}

/**
 * One case, with everything on it.
 *
 * Polled while an automated check on it is in flight (review Q13): after
 * Re-run AI, or while an owner edit is being checked, the run answers in
 * seconds and often closes the case, and without polling the page kept
 * offering Approve and Reject on a case the pipeline had already decided —
 * the moderator found out from a 409. The rules and the ceiling live in
 * `moderation.detail.ts`; polling pauses while the tab is hidden (React
 * Query's default) and stops once the case is closed or the target leaves
 * `pending`.
 */
export function useCaseDetail(caseId: string | undefined) {
  // When the current stretch of polling began. A ref: it is bookkeeping for
  // the interval callback (which React Query calls outside render), not
  // something any render shows.
  const pollingSince = useRef<number | null>(null);

  return useQuery({
    queryKey: queryKeys.moderation.detail(caseId ?? ""),
    queryFn: () => moderationApi.detail(caseId ?? ""),
    enabled: Boolean(caseId),
    refetchInterval: (query) => {
      // A failed refresh stops the polling rather than repeating it every few
      // seconds (a 429 would only earn another); the page says the refresh
      // failed and offers Try again, and a focus refetch resumes it (Q11).
      if (query.state.status === "error") return false;
      const detail = query.state.data;
      if (!detail || !checkInFlight(detail)) {
        pollingSince.current = null;
        return false;
      }
      const now = Date.now();
      pollingSince.current ??= now;
      return checkPollInterval(detail, pollingSince.current, now);
    },
  });
}

/** Queue health numbers. */
export function useModerationStats() {
  return useQuery({
    queryKey: queryKeys.moderation.stats,
    queryFn: () => moderationApi.stats(),
  });
}

/** Invalidate everything a moderation write could have changed. */
function useInvalidateModeration() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
    ]);
}

/** Turn any thrown value into something worth showing an operator. */
function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Whether a failed write means the case is no longer what the page shows.
 *
 * Exported for the page, which closes its dialog on these rather than leaving
 * a form open against a state that has moved on.
 */
export function isStaleCaseError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

/**
 * Report a failed decision, and refetch when the failure means the case moved.
 *
 * A D16 refusal (403 — "you posted this yourself") is expected behaviour, not a
 * fault, and gets the server's wording as-is; retrying it would change nothing.
 */
function useDecisionErrorHandler(title: string) {
  const invalidate = useInvalidateModeration();
  const toast = useToast();
  return (error: unknown) => {
    toast.error(title, messageFor(error, "Please try again."));
    if (isStaleCaseError(error)) void invalidate();
  };
}

/** Variables for a case decision. `subject` names the item in the toast. */
export interface CaseDecisionVariables<I> {
  caseId: string;
  input: I;
  /** "BNX-4471", or "The comment on BNX-4471". */
  subject: string;
}

export function useApproveCase() {
  const invalidate = useInvalidateModeration();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not approve");

  return useMutation({
    mutationFn: ({ caseId, input }: CaseDecisionVariables<ApproveCaseInput>) =>
      moderationApi.approve(caseId, input),
    onSuccess: (result, { subject }) => {
      void invalidate();
      if (result.targetType === "comment") {
        toast.success("Comment kept", `${subject} stays on the discussion thread.`);
      } else if (result.firstPublish) {
        toast.success("Published", `${subject} is now visible in the community feed.`);
      } else {
        toast.success("Approved", `${subject} is visible in the community feed.`);
      }
    },
    onError,
  });
}

export function useRejectCase() {
  const invalidate = useInvalidateModeration();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not reject");

  return useMutation({
    mutationFn: ({ caseId, input }: CaseDecisionVariables<RejectCaseInput>) =>
      moderationApi.reject(caseId, input),
    onSuccess: (result, { subject }) => {
      void invalidate();
      toast.success(
        result.targetType === "comment" ? "Comment removed" : "Rejected",
        result.targetType === "comment"
          ? `${subject} has been taken down. The commenter has been told why.`
          : `${subject} is not published. The author has been told why.`,
      );
    },
    onError,
  });
}

export function useRejectEvidence() {
  const invalidate = useInvalidateModeration();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not hide the file");

  return useMutation({
    mutationFn: ({
      caseId,
      evidenceId,
      input,
    }: {
      caseId: string;
      evidenceId: string;
      input: RejectEvidenceInput;
    }) => moderationApi.rejectEvidence(caseId, evidenceId, input),
    onSuccess: () => {
      void invalidate();
      toast.success("File hidden", "Members can no longer see this file. The report is unchanged.");
    },
    onError,
  });
}

export function useRerunCase() {
  const invalidate = useInvalidateModeration();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not re-run the AI check");

  return useMutation({
    mutationFn: ({ caseId }: { caseId: string; subject: string }) => moderationApi.rerun(caseId),
    onSuccess: (_result, { subject }) => {
      void invalidate();
      toast.success(
        "Sent back to the AI check",
        `${subject} is being checked again. This case updates when the result is in.`,
      );
    },
    onError,
  });
}

export function useBanMember() {
  const invalidate = useInvalidateModeration();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ memberId, input }: { memberId: string; input: BanMemberInput; name: string }) =>
      moderationApi.ban(memberId, input),
    onSuccess: (result, { name }) => {
      void invalidate();
      toast.success(
        "Member banned",
        result.sessionsRevoked > 0
          ? `${name} has been signed out of ${result.sessionsRevoked} session${result.sessionsRevoked === 1 ? "" : "s"} and can no longer sign in.`
          : `${name} can no longer sign in.`,
      );
    },
    onError: (error) => {
      toast.error("Could not ban the member", messageFor(error, "Please try again."));
      if (isStaleCaseError(error)) void invalidate();
    },
  });
}

export function useUnbanMember() {
  const invalidate = useInvalidateModeration();
  const toast = useToast();

  return useMutation({
    mutationFn: ({
      memberId,
      input,
    }: {
      memberId: string;
      input: UnbanMemberInput;
      name: string;
    }) => moderationApi.unban(memberId, input),
    onSuccess: (_result, { name }) => {
      void invalidate();
      toast.success("Ban lifted", `${name} can sign in again. Content decisions are unchanged.`);
    },
    onError: (error) => {
      toast.error("Could not lift the ban", messageFor(error, "Please try again."));
      if (isStaleCaseError(error)) void invalidate();
    },
  });
}

/**
 * Fetch a file's short-lived link.
 *
 * A mutation rather than a query: nothing about a presigned URL is worth
 * caching, and "View" is an action the moderator takes, not data the page
 * renders. No toast on success — the file opening is the confirmation.
 */
export function useEvidenceLink() {
  const toast = useToast();

  return useMutation({
    mutationFn: ({ caseId, evidenceId }: { caseId: string; evidenceId: string }) =>
      moderationApi.evidenceLink(caseId, evidenceId),
    onError: (error) => {
      toast.error("Could not open the file", messageFor(error, "Please try again."));
    },
  });
}
