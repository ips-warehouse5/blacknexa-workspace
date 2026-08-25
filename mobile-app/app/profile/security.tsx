/**
 * Profile → Signed-in devices. `DERIVED`.
 *
 * This screen exists because A15 makes a promise that is otherwise invisible: "You
 * are logged in on this device. Every other device has been signed out." Without a
 * session list, a person has no way to check that, and no way to act on a device
 * they no longer have.
 *
 * `user_sessions` makes it nearly free — the rows already exist to enforce the
 * reset behaviour, so listing them costs one endpoint.
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { SwitchRow } from "@/components/ui/Controls";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/providers/AuthProvider";
import authApi from "@/lib/api/auth";

function whenSeen(iso: string): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return "";
  const minutes = Math.round((Date.now() - value) / 60000);
  if (minutes < 5) return "Active now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function SecurityScreen(): React.ReactElement {
  const { biometricsAvailable, signOutEverywhere } = useAuth();
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [biometricLock, setBiometricLock] = useState(biometricsAvailable);

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => authApi.sessions(),
  });

  const signOutAll = useCallback(async () => {
    setBusy(true);
    try {
      // Includes this device: "everywhere" has to mean everywhere, or the label
      // is a lie.
      await signOutEverywhere();
    } finally {
      setBusy(false);
      setConfirmAll(false);
    }
  }, [signOutEverywhere]);

  const rows = sessions.data ?? [];

  return (
    <>
      <ScrollScreen padding={screenPadding.detail} testID="profile-security">
        <BackHeader title="Security" onBack={() => router.back()} padding={0} />

        {biometricsAvailable ? (
          <SwitchRow
            title="Unlock with Face ID"
            description="Asks for your face or fingerprint before opening your session and your vault."
            value={biometricLock}
            onValueChange={setBiometricLock}
            style={{ marginTop: 20 }}
            testID="biometric-lock"
          />
        ) : null}

        <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 24 }}>
          SIGNED-IN DEVICES
        </Text>

        {sessions.isLoading ? (
          <View style={{ gap: 9, marginTop: 10 }}>
            {[1, 0.6].map((opacity, index) => (
              <View key={index} style={[styles.session, { opacity }]}>
                <View style={[styles.bar, { width: 120, height: 13 }]} />
                <View style={[styles.bar, { width: 80, height: 11, marginTop: 8 }]} />
              </View>
            ))}
          </View>
        ) : rows.length === 0 ? (
          <Text variant="bodySm" color={colors.t3} style={{ marginTop: 10 }}>
            No other devices are signed in.
          </Text>
        ) : (
          <View style={{ gap: 9, marginTop: 10 }}>
            {rows.map((session) => (
              <View key={session.id} style={styles.session}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text variant="labelLg" color={colors.t0} style={{ flexShrink: 1 }}>
                      {session.deviceLabel}
                    </Text>
                    {session.current ? (
                      <View style={styles.thisDevice}>
                        <Text variant="eyebrow" color={colors.acc} style={{ fontSize: 9.5 }}>
                          This device
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="metaSm" color={colors.t4} style={{ marginTop: 3 }}>
                    {[session.platform, whenSeen(session.lastSeenAt)].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Button
          label="Sign out everywhere"
          variant="destructiveTint"
          height={50}
          onPress={() => setConfirmAll(true)}
          style={{ marginTop: 22 }}
          testID="sign-out-everywhere"
        />
        <Text variant="metaSm" color={colors.t4} style={{ marginTop: 10, lineHeight: 17 }}>
          Ends every session, including this one. Use this if a device has been lost
          or is no longer yours. Changing your password does the same thing, but
          keeps the device you change it on.
        </Text>
      </ScrollScreen>

      <ConfirmDialog
        visible={confirmAll}
        title="Sign out everywhere?"
        body="Every device is signed out, including this one. Your reports and drafts are untouched."
        confirmLabel="Sign out everywhere"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={signOutAll}
        onCancel={() => setConfirmAll(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  session: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  thisDevice: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: alpha(colors.acc, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  bar: { backgroundColor: colors.s5, borderRadius: 5 },
});
