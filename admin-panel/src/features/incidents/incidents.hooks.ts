/**
 * React Query bindings for Incident Management.
 *
 * Every decision invalidates the whole `incidents` root rather than just the
 * detail, because a verify or an assignment moves a row between tabs *and*
 * moves two tab counts; a narrower invalidation would leave the tabs
 * contradicting the table beneath them. Deactivate and Reactivate also reach
 * into Content Moderation — deactivation supersedes every open moderation case
 * on the report and its comments, and a reactivation may queue a fresh check —
 * so those two invalidate the `moderation` root as well.
 *
 * ── Failures ────────────────────────────────────────────────────────────────
 * Every error is a toast carrying the server's own message, which is written to
 * be shown as-is (contract §0.2). Three statuses mean the incident is no longer
 * in the state the operator was looking at, and the page refetches on them:
 *   409 — someone else decided first, the incident was deactivated or edited,
 *         or a lock wait timed out (contract §0.3);
 *   404 — gone, or (for an advocate) no longer assigned to them;
 *   403 — a D16 self-dealing refusal: another operator has to decide.
 * `isStaleDecision` names that set, so a dialog can close on it (retrying the
 * same click cannot succeed) and stay open on anything else — a 400 or a
 * network drop — so a typed note is not thrown away.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/app/providers/ToastProvider";
import { queryKeys } from "@/lib/query-client";
import { incidentsApi } from "@/features/incidents/incidents.api";
import type {
  AddIncidentNoteInput,
  AssignIncidentInput,
  DeactivateIncidentInput,
  DismissIncidentInput,
  IncidentListParams,
  IncidentScope,
  IncidentStateView,
  ReactivateIncidentInput,
  ReopenIncidentInput,
  VerifyIncidentInput,
} from "@/features/incidents/incidents.types";
import { ApiError } from "@/types/api";

// ── Reads ───────────────────────────────────────────────────────────────────

/** A page of the queue, matching the current filters. */
export function useIncidentList(params: IncidentListParams) {
  return useQuery({
    queryKey: queryKeys.incidents.list(params),
    queryFn: () => incidentsApi.list(params),
    // Keeps the previous page on screen while the next loads, so paging does
    // not flash an empty table between clicks.
    placeholderData: (previous) => previous,
  });
}

/** Tab counts for a scope. */
export function useIncidentSummary(scope: IncidentScope) {
  return useQuery({
    queryKey: queryKeys.incidents.summary(scope),
    queryFn: () => incidentsApi.summary(scope),
  });
}

/**
 * The people a case can be assigned to.
 *
 * Only fetched for operators holding `incidents.assign` (superadmin): the
 * endpoint answers 403 to everyone else, and asking anyway would put a failed
 * request in the console on every detail page an advocate opens.
 */
export function useIncidentAssignees(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.incidents.assignees,
    queryFn: () => incidentsApi.assignees(),
    enabled,
    // The roster changes when staff accounts change, not per incident.
    staleTime: 5 * 60_000,
  });
}

/** One incident, cut to the caller's tier. `enabled` is false for ids that cannot be one. */
export function useIncidentDetail(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.incidents.detail(id),
    queryFn: () => incidentsApi.get(id),
    enabled,
  });
}

// ── Shared failure handling ─────────────────────────────────────────────────

/** Turn any thrown value into something worth showing an operator. */
function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Whether a failed decision means "the incident moved on" rather than "try
 * again": the dialog that sent it should close, and the page shows the state
 * the refetch brings back.
 */
export function isStaleDecision(error: unknown): boolean {
  return error instanceof ApiError && [403, 404, 409].includes(error.status);
}

/** Invalidate everything a decision could have changed. */
function useInvalidateIncidents() {
  const queryClient = useQueryClient();
  return (options: { moderation?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
    if (options.moderation) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all });
    }
  };
}

/**
 * The common shape of a decision's error path: say what the server said, and
 * refetch when the failure means the page is showing a state that is gone.
 */
function useDecisionErrorHandler(title: string) {
  const toast = useToast();
  const invalidate = useInvalidateIncidents();
  return (error: unknown) => {
    toast.error(title, messageFor(error, "Please try again."));
    if (isStaleDecision(error)) invalidate();
  };
}

// ── Decisions ───────────────────────────────────────────────────────────────

export function useVerifyIncident() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not verify the incident");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VerifyIncidentInput }) =>
      incidentsApi.verify(id, input),
    onSuccess: (state) => {
      invalidate();
      // "Publication unchanged" is the D1 promise the Verify modal makes; the
      // toast repeats it so nobody reads verification as a content decision.
      toast.success(
        "Incident verified",
        `${state.caseRef} is now verified. Its publication is unchanged.`,
      );
    },
    onError,
  });
}

export function useDismissIncident() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not dismiss the incident");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DismissIncidentInput }) =>
      incidentsApi.dismiss(id, input),
    onSuccess: (state) => {
      invalidate();
      toast.success(
        "Incident dismissed",
        `${state.caseRef} was dismissed. The reporter has been told the reason.`,
      );
    },
    onError,
  });
}

export function useReopenIncident() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not reopen the case");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReopenIncidentInput }) =>
      incidentsApi.reopen(id, input),
    onSuccess: (state) => {
      invalidate();
      toast.success(
        "Case reopened",
        `${state.caseRef} is back under review. The reporter has been told.`,
      );
    },
    onError,
  });
}

export function useDeactivateIncident() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not deactivate the incident");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeactivateIncidentInput }) =>
      incidentsApi.deactivate(id, input),
    onSuccess: (state) => {
      invalidate({ moderation: true });
      toast.success(
        "Incident deactivated",
        `${state.caseRef} was taken down from public view. The reporter has been told why.`,
      );
    },
    onError,
  });
}

export function useReactivateIncident() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not reactivate the incident");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReactivateIncidentInput }) =>
      incidentsApi.reactivate(id, input),
    onSuccess: (state) => {
      invalidate({ moderation: true });
      // The server decides which of the two happened (§9.1); the toast says
      // which, so an operator expecting it back in the feed is not surprised.
      toast.success(
        "Incident reactivated",
        state.moderationState === "approved"
          ? `${state.caseRef} is published again.`
          : `${state.caseRef} goes through the check again before it is published.`,
      );
    },
    onError,
  });
}

/** What the assignment toast says, from what the server did. */
function assignmentMessage(state: IncidentStateView): { title: string; body: string } {
  if (!state.changed) {
    return {
      title: "No change",
      body: state.assignee
        ? `${state.caseRef} is already with ${state.assignee.name}.`
        : `${state.caseRef} is already unassigned.`,
    };
  }
  if (state.assignee) {
    return {
      title: "Case assigned",
      body: `${state.caseRef} is now with ${state.assignee.name}.`,
    };
  }
  return { title: "Case unassigned", body: `${state.caseRef} is back in the unassigned queue.` };
}

export function useAssignIncident() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not change the assignment");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignIncidentInput }) =>
      incidentsApi.assign(id, input),
    onSuccess: (state) => {
      // The assignees' open-case counts move too, so their cache goes with it
      // (it lives under the incidents root).
      invalidate();
      const { title, body } = assignmentMessage(state);
      toast.success(title, body);
    },
    onError,
  });
}

export function useAddIncidentNote() {
  const invalidate = useInvalidateIncidents();
  const toast = useToast();
  const onError = useDecisionErrorHandler("Could not add the note");

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddIncidentNoteInput }) =>
      incidentsApi.addNote(id, input),
    onSuccess: () => {
      invalidate();
      toast.success("Note added", "Your note is on the case record.");
    },
    onError,
  });
}

/**
 * A presigned link for one file.
 *
 * A mutation rather than a query: the link is short-lived and asked for on a
 * click, and caching it would hand out an expired URL on the second click.
 * No success toast — the file opening is the confirmation.
 */
export function useIncidentEvidenceLink() {
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, evidenceId }: { id: string; evidenceId: string }) =>
      incidentsApi.evidenceLink(id, evidenceId),
    onError: (error) => {
      toast.error("Could not open the file", messageFor(error, "Please try again."));
    },
  });
}
