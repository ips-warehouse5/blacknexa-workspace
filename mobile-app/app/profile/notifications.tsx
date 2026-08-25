/**
 * Profile → Notifications. `DERIVED`.
 *
 * A11 is unambiguous about the shape of this screen: "In Settings this is **one
 * switch, not four**." So the four types are listed read-only — they explain what
 * arrives — and there is exactly one control.
 *
 * The fourth type is shown as permanently on, because it is: `urgent_safety`
 * bypasses the preference server-side. Rendering it as a disabled switch would
 * imply it might one day be switchable; a plain "Always on" says what is true.
 */

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { SwitchRow } from "@/components/ui/Controls";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import authApi from "@/lib/api/auth";

const KINDS = [
  {
    dot: colors.ok,
    title: "Your report changes status",
    body: "Submitted, under review, verified or dismissed.",
    always: false,
  },
  {
    dot: colors.corro,
    title: "Someone corroborates or replies",
    body: "Only on reports you filed or commented on.",
    always: false,
  },
  {
    dot: colors.acc,
    title: "A dispatch is ready",
    body: "Sent once, when every recipient has it.",
    always: false,
  },
  {
    dot: colors.bad,
    title: "Urgent safety notices",
    body: "Rare, and for your area only.",
    always: true,
  },
];

export default function NotificationSettingsScreen(): React.ReactElement {
  const { user, updateProfile, busy } = useAuth();
  const [enabled, setEnabled] = useState(user?.preferences.notificationsEnabled ?? true);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = useCallback(
    async (value: boolean) => {
      setEnabled(value);
      setNotice(null);

      if (value) {
        // Turning it on here has to go through the OS too, or the preference would
        // claim something the device will not do.
        const permission = await Notifications.requestPermissionsAsync().catch(() => null);
        if (!permission?.granted) {
          setEnabled(false);
          setNotice(
            "Notifications are switched off for BlackNexa in your device settings. Turn them on there first.",
          );
          return;
        }
        const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
        if (token?.data) await authApi.registerPushToken(token.data).catch(() => {});
      }

      await updateProfile({ notificationsEnabled: value });
    },
    [updateProfile],
  );

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-notifications">
      <BackHeader title="Notifications" onBack={() => router.back()} padding={0} />

      {/* The one switch. */}
      <SwitchRow
        title="Send me notifications"
        description="Four kinds only, listed below."
        value={enabled}
        onValueChange={toggle}
        style={{ marginTop: 20 }}
        testID="notifications-toggle"
      />

      {notice ? (
        <Text variant="bodyXs" color={colors.warn} style={{ marginTop: 10, lineHeight: 19 }}>
          {notice}
        </Text>
      ) : null}

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 24 }}>
        WHAT WE SEND
      </Text>

      {/* Read-only. Four rows, not four switches. */}
      <View style={{ gap: 12, marginTop: 12 }}>
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="labelLg" color={colors.t0} style={{ flex: 1 }}>
                  {kind.title}
                </Text>
                {kind.always ? (
                  <Text variant="metaSm" color={colors.bad2}>
                    Always on
                  </Text>
                ) : null}
              </View>
              <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 2, lineHeight: 18 }}>
                {kind.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.promiseCard}>
        <Text variant="bodyXs" color={colors.t2} style={{ lineHeight: 19 }}>
          No digests, no marketing, no engagement nudges. Urgent safety notices are
          the one kind that cannot be turned off — they are rare, and only for your
          area.
        </Text>
      </View>
    </ScrollScreen>
  );
}

const styles = {
  promiseCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 22,
  },
};
