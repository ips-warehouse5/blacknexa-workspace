/**
 * The × behaviour shared by C1–C7, and the Android back button with it.
 *
 * Both lead to the same place: C10's save-or-discard sheet, never a dismissal.
 * "There is no way to close this screen — nothing is half-filed" is a property of
 * the whole wizard, and the hardware back button is the easiest way to violate it
 * by accident, so it is intercepted here rather than per screen.
 *
 * A wizard with nothing in it exits cleanly — there is no draft to save, and
 * asking "keep this?" about an empty form is noise.
 */

import { useCallback, useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { router } from "expo-router";
import { useReportDraft } from "@/providers/ReportDraftProvider";

export function useWizardExit(): () => void {
  const { hasContent, reset } = useReportDraft();

  const exit = useCallback(() => {
    if (!hasContent) {
      // Nothing written, nothing attached: close without a prompt.
      reset();
      router.dismissTo("/(tabs)");
      return;
    }
    router.push("/report/save-or-discard");
  }, [hasContent, reset]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      exit();
      // Handled — the default would pop the step and eventually leave the wizard,
      // skipping C10 entirely.
      return true;
    });
    return () => subscription.remove();
  }, [exit]);

  return exit;
}

export default useWizardExit;
