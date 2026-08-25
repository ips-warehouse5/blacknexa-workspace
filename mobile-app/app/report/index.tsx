/**
 * Wizard entry.
 *
 * Resumes an unfinished draft at the step it stopped on, rather than always
 * starting at C1 — A12 promises the wizard "saves a draft as you go, so you can
 * stop at any step", which is only true if coming back honours it.
 */

import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { colors } from "@/constants/theme";
import { useReportDraft } from "@/providers/ReportDraftProvider";

/** Wizard step index → route. */
const STEP_ROUTES = [
  "/report/category",
  "/report/details",
  "/report/when",
  "/report/where",
  "/report/evidence",
  "/report/flags",
  "/report/review",
] as const;

export default function ReportEntryScreen(): React.ReactElement {
  const { ready, step, hasContent } = useReportDraft();

  useEffect(() => {
    if (!ready) return;
    // A restored draft with nothing in it is not a draft worth resuming.
    const target = hasContent ? STEP_ROUTES[Math.min(step, 7) - 1] : STEP_ROUTES[0];
    router.replace(target);
  }, [hasContent, ready, step]);

  // Deliberately blank: the redirect fires on the first committed frame, and a
  // spinner here would flash for one frame on every open of the wizard.
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
