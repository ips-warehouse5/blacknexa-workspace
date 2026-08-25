/**
 * The post-sign-up stack: A11 notification priming, then A12's tour.
 *
 * Back gestures are off throughout. This runs once, immediately after A9, and
 * swiping back into a completed sign-up step is not a place anyone means to go.
 */

import React from "react";
import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function OnboardingLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="notifications" />
      <Stack.Screen name="tour" options={{ animation: "fade" }} />
    </Stack>
  );
}
