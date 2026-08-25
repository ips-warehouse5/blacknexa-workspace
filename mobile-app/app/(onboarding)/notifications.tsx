/**
 * A11 · Notification priming.
 *
 * The screen names exactly four kinds and says which one always arrives. Two
 * details from the caption are load-bearing:
 *
 *   "Names exactly four types before the OS prompt, and says plainly which one
 *    always arrives. In Settings this is one switch, not four."
 *
 * So this list is descriptive, not a set of toggles — offering four switches here
 * would contradict the Settings design and imply the urgent one can be turned off.
 * The dot colours are the status palette doing status work: green for a state
 * change, purple for corroboration, accent for a dispatch, red for urgent.
 */

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";
import { Screen, StickyFooter } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import authApi from "@/lib/api/auth";

const KINDS = [
  {
    dot: colors.ok,
    title: "Your report changes status",
    body: "Submitted, under review, verified or dismissed.",
  },
  {
    dot: colors.corro,
    title: "Someone corroborates or replies",
    body: "Only on reports you filed or commented on.",
  },
  {
    dot: colors.acc,
    title: "A dispatch is ready",
    body: "Sent once, when every recipient has it.",
  },
  {
    dot: colors.bad,
    title: "Urgent safety notices",
    body: "Rare, and for your area only. These cannot be turned off.",
  },
];

export default function NotificationPrimingScreen(): React.ReactElement {
  const { updateProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  const next = useCallback(() => router.replace("/(onboarding)/tour"), []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      // `granted` rather than comparing `status`: on iOS a provisional
      // authorisation is neither "granted" nor "denied" as a string, and the
      // boolean is the one field that means the same thing on both platforms.
      const { granted } = await Notifications.requestPermissionsAsync();
      if (granted) {
        // Register the token against this session, so revoking the device later
        // also stops its pushes.
        const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
        if (token?.data) await authApi.registerPushToken(token.data).catch(() => {});
        await updateProfile({ notificationsEnabled: true });
      } else {
        // Declining here turns the preference off rather than leaving the app
        // believing it can notify.
        await updateProfile({ notificationsEnabled: false });
      }
    } catch {
      /* a failed registration must not block onboarding */
    } finally {
      setBusy(false);
      next();
    }
  }, [next, updateProfile]);

  const skip = useCallback(async () => {
    await updateProfile({ notificationsEnabled: false }).catch(() => {});
    next();
  }, [next, updateProfile]);

  return (
    <Screen padding={0} testID="notification-priming">
      <View style={{ flex: 1, paddingHorizontal: screenPadding.hero, paddingTop: 36 }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: radius.lg,
            backgroundColor: colors.s5,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BellGlyph />
        </View>

        <Text variant="displayMd" color={colors.t0} style={{ marginTop: 22 }}>
          We will only send you four things
        </Text>

        <View style={{ gap: 12, marginTop: 26 }}>
          {KINDS.map((kind) => (
            <View key={kind.title} style={{ flexDirection: "row", gap: 13 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: kind.dot,
                  marginTop: 6,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text variant="labelLg" color={colors.t0}>
                  {kind.title}
                </Text>
                <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 2 }}>
                  {kind.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text variant="bodyXs" color={colors.t4} style={{ marginTop: 24 }}>
          No digests, no marketing, no engagement nudges.
        </Text>
      </View>

      <StickyFooter padding={screenPadding.hero}>
        <Button
          label="Turn on notifications"
          onPress={enable}
          loading={busy}
          testID="notifications-enable"
        />
        <TextButton label="Not now" onPress={skip} testID="notifications-skip" />
      </StickyFooter>
    </Screen>
  );
}

function BellGlyph(): React.ReactElement {
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 15,
          height: 13,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderWidth: 1.7,
          borderBottomWidth: 0,
          borderColor: colors.acc,
        }}
      />
      <View
        style={{
          width: 19,
          height: 1.7,
          backgroundColor: colors.acc,
          marginTop: -0.5,
        }}
      />
      <View
        style={{
          width: 6,
          height: 3,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          borderWidth: 1.7,
          borderTopWidth: 0,
          borderColor: colors.acc,
          marginTop: 1.5,
        }}
      />
    </View>
  );
}

