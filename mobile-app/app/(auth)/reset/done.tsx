/**
 * A15 · Reset done.
 *
 * The caption explains why the second sentence exists: "States the side effect —
 * other sessions ended — because a person resetting a password usually needs to
 * know that."
 *
 * So the side effect is stated plainly rather than buried, and the CTA goes
 * straight to the feed: by this point the reset has already signed the caller in
 * on this device.
 */

import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { alpha, colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { Screen, StickyFooter } from "@/components/ui/Screen";

export default function ResetDoneScreen(): React.ReactElement {
  useEffect(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  return (
    <Screen padding={0} testID="reset-done">
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingBottom: 80 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: alpha(colors.ok, 0.14),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SuccessTick />
        </View>

        <Text variant="displaySm" color={colors.t0} center style={{ marginTop: 22, fontSize: 26 }}>
          Your password is changed
        </Text>
        <Text variant="body" color={colors.t2} center style={{ marginTop: 10 }}>
          You&rsquo;re logged in on this device. Every other device has been signed out.
        </Text>
      </View>

      <StickyFooter padding={screenPadding.detail}>
        <Button
          label="Go to the feed"
          // The gate is already showing the signed-in stack by now, so this only
          // has to dismiss the auth flow.
          onPress={() => router.replace("/(tabs)")}
          testID="reset-done-continue"
        />
      </StickyFooter>
    </Screen>
  );
}

/** The 28px green tick used by A15, C9 and D9. */
export function SuccessTick({ color = colors.ok, size = 28 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: size * 0.32,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
          transform: [
            { rotate: "45deg" },
            { translateX: -size * 0.19 },
            { translateY: size * 0.12 },
          ],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.55,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }, { translateX: size * 0.06 }],
        }}
      />
    </View>
  );
}
