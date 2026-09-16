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
 *   - "Require a passcode" — no passcode feature exists anywhere in the
 *     app; shown disabled.
 *   - "Blocked accounts" — the board's own caption flags this row
 *     "Not designed — awaiting yes or no," i.e. explicitly undecided in the
 *     design itself. Omitted entirely rather than inventing a placeholder
 *     for a feature the design doesn't actually specify yet.
 */

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Group, Row, SwitchRow } from "@/components/ui/SettingsRow";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useLocation } from "@/providers/LocationProvider";

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public",
  trusted: "Trusted Circle",
  private: "Private",
};

export default function SettingsScreen(): React.ReactElement {
  const { user, signOut, biometricsAvailable } = useAuth();
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

  return (
    <>
      <ScrollScreen padding={screenPadding.detail} testID="settings">
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
          <Row
            title="Notifications"
            // One switch, not four — the row itself just reflects it; the
            // actual toggle and OS permission handling live on the child
            // screen, same as before.
            value={prefs?.notificationsEnabled ? "On" : "Off"}
            onPress={() => router.push("/profile/notifications")}
            testID="row-notifications"
            last
          />
        </Group>

        <Group label="APPEARANCE">
          <Row
            title="Theme"
            value="Light"
            disabled
            testID="row-appearance"
            last
          />
        </Group>

        <Group label="PROTECTION">
          <SwitchRow
            title="Face ID unlock"
            description={
              biometricsAvailable
                ? undefined
                : "Not available on this device."
            }
            value={settings.biometrics && biometricsAvailable}
            disabled={!biometricsAvailable}
            onValueChange={(next) => update("biometrics", next)}
            testID="row-biometrics"
          />
          <Row title="Require a passcode" value="Off" disabled last />
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
            onPress={() => router.push("/legal/lookup")}
          />
          <Row title="Terms of Service" onPress={() => router.push("/legal/terms")} />
          <Row title="Privacy Policy" onPress={() => router.push("/legal/privacy")} last />
        </Group>

        <View style={{ marginTop: 22 }}>
          <View style={styles.logoutGroup}>
            <Row
              title="Log out"
              destructive
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
          <Pressable onPress={() => router.push("/profile/account")}>
            <Text variant="metaSm" color={colors.bad2} style={{ marginLeft: 8 }}>
              · Delete account
            </Text>
          </Pressable>
        </View>
      </ScrollScreen>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Log out of BlackNexa?"
        body="Your reports and evidence stay in the Vault. If you have an unfiled draft, it stays only on this device — logging out does not lose it, but it also won't sync anywhere else until you sign back in."
        confirmLabel="Log out"
        cancelLabel="Stay logged in"
        destructive={false}
        busy={signingOut}
        onConfirm={doSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  logoutGroup: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 26,
    marginBottom: 8,
  },
});
