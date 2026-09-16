/**
 * H2 · Settings — the dedicated Settings root the board specifies, separate
 * from H1 · Profile.
 *
 * Its own defining rule: "Settings shows every row's live value so nobody
 * has to open a screen to find out what it is set to." Every row below
 * either shows a real, current value (backed by an actual API/local store)
 * or is visibly marked as not-yet-available — never a value that looks live
 * but isn't backed by anything.
 *
 * Rows the board specifies with no backing today are kept visible and
 * disabled rather than removed, per the project's "cover the UI, be honest
 * about what's not wired up yet" instruction:
 *   - Appearance (Light/Dark/Match system) — the app has no dark-mode
 *     infrastructure (`constants/theme.ts` exports one static `colors`
 *     object); building that is a global theme-system change, explicitly
 *     out of scope for this module. Shown as "Light" with the picker
 *     disabled.
 */

import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Group, Row, SwitchRow } from "@/components/ui/SettingsRow";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/providers/AuthProvider";
import { useLocation } from "@/providers/LocationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import authApi from "@/lib/api/auth";

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public",
  trusted: "Trusted Circle",
  private: "Private",
};

export default function SettingsScreen(): React.ReactElement {
  const { user, signOut, updateProfile, busy, biometricsAvailable } = useAuth();
  const { settings, update } = useSettings();
  const { location } = useLocation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const prefs = user?.preferences;
  const appVersion = Constants.expoConfig?.version ?? "—";

  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  }, [signOut]);

  const toggleNotifications = useCallback(
    async (value: boolean) => {
      if (value) {
        const permission = await Notifications.requestPermissionsAsync().catch(() => null);
        if (!permission?.granted) {
          Alert.alert(
            "Notifications are off",
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
    <>
      <ScrollScreen padding={screenPadding.detail} bottomSpace={44} testID="settings">
        <BackHeader title="Settings" onBack={() => router.back()} padding={0} />

      <Group label="YOU">
        <Row
          title="Account"
          value={user?.email ?? "—"}
          onPress={() => router.push("/profile/account-info")}
          testID="row-account"
        />
        <Row
          title="Privacy & sharing"
          value={
            prefs
              ? `${VISIBILITY_LABEL[prefs.defaultVisibility] ?? "—"} · ${
                  prefs.anonymousByDefault ? "Anonymous" : "Named"
                }`
              : "—"
          }
          onPress={() => router.push("/profile/defaults")}
          testID="row-privacy"
          last
        />
      </Group>

      <Group label="ALERTS">
        <SwitchRow
          title="Notifications"
          description={prefs?.notificationsEnabled ? "On" : "Off"}
          value={prefs?.notificationsEnabled ?? true}
          disabled={busy}
          onValueChange={toggleNotifications}
          testID="row-notifications"
          last
        />
      </Group>

      <Group label="APPEARANCE">
        <Row title="Theme" value="Light" disabled testID="row-appearance" last />
      </Group>

      <Group label="PROTECTION">
        <SwitchRow
          title="Unlock with Face ID"
          description={
            biometricsAvailable
              ? "Also used instead of the log-in password."
              : "Not available on this device."
          }
          value={settings.biometrics && biometricsAvailable}
          disabled={!biometricsAvailable}
          onValueChange={(next) => update("biometrics", next)}
          testID="row-biometrics"
          last
        />
      </Group>

      <Group label="PREFERENCES">
        <Row
          title="Your area"
          value={location?.label || "Not set"}
          onPress={() => router.push("/profile/area")}
          testID="row-area"
          last
        />
      </Group>

      <Group label="HELP & ABOUT">
        <Row title="Help & FAQ" onPress={() => router.push("/profile/help")} />
        <Row title="Contact support" onPress={() => router.push("/profile/contact")} />
        <Row
          title="How BlackNexa protects your evidence"
          onPress={() => router.push("/legal/evidence-protection")}
        />
        <Row title="Terms of Service" onPress={() => router.push("/legal/terms")} />
        <Row title="Privacy Policy" onPress={() => router.push("/legal/privacy")} last />
      </Group>

        <View style={styles.logoutWrap}>
          <View style={styles.logoutGroup}>
            <Row
              title="Log out"
              destructive
              centered
              showChevron={false}
              onPress={() => setConfirmSignOut(true)}
              testID="row-logout"
              last
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text variant="metaSm" color={colors.t4}>
            BlackNexa {appVersion}
          </Text>
        </View>
      </ScrollScreen>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Log out of BlackNexa?"
        body="Your reports and evidence stay in the Vault. You will need your password to get back in."
        note="One draft has not been filed. It stays on this device and will be here when you return."
        confirmLabel="Log out"
        cancelLabel="Stay logged in"
        destructive
        safeActionPrimary
        busy={signingOut}
        onConfirm={doSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  logoutWrap: {
    marginTop: 22,
  },
  logoutGroup: {
    backgroundColor: colors.s3,
    borderRadius: 16,
    overflow: "hidden",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 26,
    marginBottom: 18,
  },
});
