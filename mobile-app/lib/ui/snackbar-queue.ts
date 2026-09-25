/**
 * The snackbar's duplicate rule, kept pure so it can be tested without React.
 *
 * One action can reach `showSnackbar` more than once — most often several
 * mounted screens reacting to the same shared auth error. The queue shows items
 * one after another, so each extra call surfaced as the same message again a
 * few seconds later. A request whose text and type are already on screen or
 * waiting is dropped. Once the message has gone, the same text shows again,
 * because by then it is a new event (a retry that failed the same way).
 */

import type { SnackbarType } from "@/components/ui/Snackbar";

type SnackbarContent = { message: string; type: SnackbarType };

export function isDuplicateSnackbar(
  candidate: SnackbarContent,
  queued: readonly SnackbarContent[],
  current: SnackbarContent | null,
): boolean {
  const same = (item: SnackbarContent | null) =>
    item !== null && item.message === candidate.message && item.type === candidate.type;
  return same(current) || queued.some(same);
}
