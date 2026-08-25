/**
 * The report wizard's stack — C1 through C11.
 *
 * ── No gesture, no header, no way out but × ────────────────────────────────
 * C8's caption says it plainly: "There is no way to close this screen — nothing is
 * half-filed." That applies to the whole flow, not just the submit step: the
 * swipe-to-dismiss is off everywhere, because dismissing a wizard mid-step would
 * skip C10 and silently abandon what someone wrote.
 *
 * The stack is mounted as a full-screen modal by the root layout, and the draft
 * provider wraps it here so state survives moving between steps.
 */

import React from "react";
import { Stack } from "expo-router";
import { colors } from "@/constants/theme";
import { ReportDraftProvider } from "@/providers/ReportDraftProvider";

export default function ReportWizardLayout(): React.ReactElement {
  return (
    <ReportDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ animation: "none" }} />
        <Stack.Screen name="category" />
        <Stack.Screen name="details" />
        <Stack.Screen name="when" />
        <Stack.Screen name="where" />
        <Stack.Screen name="evidence" />
        <Stack.Screen name="flags" />
        <Stack.Screen name="review" />
        {/* C8 — fades in, and the Android back button is swallowed inside. */}
        <Stack.Screen name="submitting" options={{ animation: "fade" }} />
        {/* C9 — the flow is over; there is nothing behind it to go back to. */}
        <Stack.Screen name="receipt" options={{ animation: "fade" }} />
        {/*
          C10 / C11. A transparent modal so the dimmed step stays visible behind
          it — the sheet interrupts the step rather than replacing it.
        */}
        <Stack.Screen
          name="save-or-discard"
          options={{
            presentation: "transparentModal",
            animation: "slide_from_bottom",
            gestureEnabled: true,
          }}
        />
      </Stack>
    </ReportDraftProvider>
  );
}
