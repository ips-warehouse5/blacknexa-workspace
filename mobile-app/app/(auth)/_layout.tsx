/**
 * The signed-out stack: A1 splash through A15 reset-done.
 *
 * The intro carousel and Welcome disable the back gesture on purpose — swiping
 * back from Welcome would land on the last intro slide, which is not a place
 * anyone meant to go.
 */

import React from "react";
import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function AuthLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="intro" options={{ gestureEnabled: false, animation: "fade" }} />
      <Stack.Screen name="location" />
      <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
      <Stack.Screen name="log-in" />
      <Stack.Screen name="sign-up/account" />
      <Stack.Screen name="sign-up/terms" />
      <Stack.Screen name="sign-up/verify" />
      {/* Once the code is accepted the account exists; going back is meaningless. */}
      <Stack.Screen name="sign-up/profile" options={{ gestureEnabled: false }} />
      <Stack.Screen name="reset/request" />
      <Stack.Screen name="reset/confirm" />
      <Stack.Screen name="reset/done" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
