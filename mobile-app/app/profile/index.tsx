/**
 * Profile — `DERIVED`. Not in the design.
 *
 * Sections A–D never draw a profile screen, but they establish everything it has to
 * hold: A9 sets the identity and the default visibility, A11 sets notifications to
 * "one switch, not four", C4 labels a default precision, D4's composer inherits an
 * anonymity default, and D2's copy references a Vault. So the contents are
 * determined even though the layout is not.
 *
 * Built from the SYSTEM artboard's own primitives rather than improvised, and it
 * needs a design review before release — see docs/FEATURE_BUILD_PLAN.md §7.
 *
 * ── Two defects this replaces ──────────────────────────────────────────────
 * The previous profile screen edited the display name and the vault PIN through
 * `Alert.prompt`, which is **iOS-only** — both were silently dead on Android. And
 * its "Sign out" cleared two consent flags and navigated, without revoking a token
 * or ending a session.
 */

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Chevron } from "@/app/report/details";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/providers/AuthProvider";
import reportsApi, { type Visibility } from "@/lib/api/reports";

const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "Public",
  trusted: "Trusted Circle",
  private: "Private",
};

const PRECISION_LABEL: Record<string, string> = {
  exact: "Exact",
  approximate: "Approximate",
  hidden: "Hidden",
};

export default function ProfileScreen(): React.ReactElement {
  const { user, signOut } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  /** "My reports" count — a real number, from the same endpoint the Vault uses. */
  const mine = useQuery({
    queryKey: ["feed", "mine-count"],
    queryFn: () => reportsApi.feed({ mine: true, limit: 50 }),
  });

  const reportCount = mine.data?.items.length ?? 0;

  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      // A real sign-out: revokes this device's session server-side and clears the
      // stored tokens. The gate swaps the stack on its own.
      await signOut();
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  }, [signOut]);

  const prefs = user?.preferences;

  return (
    <>
      <ScrollScreen padding={screenPadding.detail} testID="profile">
        <BackHeader title="Profile" onBack={() => router.back()} padding={0} />

        {/* Identity header. */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text variant="cardTitle" color={colors.acc}>
              {user?.initials ?? "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="sectionTitle" color={colors.t0}>
              {user?.displayName?.trim() || "Anonymous"}
            </Text>
            <Text variant="metaSm" color={colors.t4} style={{ marginTop: 3 }}>
              {user?.email ?? ""}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/(tabs)/vault")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.countCard, pressed && { opacity: 0.92 }]}
          testID="profile-my-reports"
        >
          <View>
            <Text variant="eyebrowSm" color={colors.t4}>
              MY REPORTS
            </Text>
            <Text variant="sectionTitle" color={colors.t0} style={{ marginTop: 5 }}>
              {mine.isLoading ? "—" : `${reportCount}`}
            </Text>
          </View>
          <Chevron open={false} />
        </Pressable>

        {/* Grouped settings. */}
        <Group label="IDENTITY">
          <Row
            title="Name and avatar"
            value={user?.avatarMode === "anonymous" ? "Anonymous" : user?.displayName || "Not set"}
            onPress={() => router.push("/profile/identity")}
            testID="row-identity"
          />
        </Group>

        <Group label="DEFAULTS FOR A NEW REPORT">
          <Row
            title="Who can see it"
            value={prefs ? VISIBILITY_LABEL[prefs.defaultVisibility] : "—"}
            onPress={() => router.push("/profile/defaults")}
            testID="row-visibility"
          />
          <Row
            title="Location precision"
            value={prefs ? PRECISION_LABEL[prefs.defaultPrecision] ?? "—" : "—"}
            onPress={() => router.push("/profile/defaults")}
          />
          <Row
            title="File anonymously"
            value={prefs?.anonymousByDefault ? "On" : "Off"}
            onPress={() => router.push("/profile/defaults")}
            last
          />
        </Group>

        <Group label="NOTIFICATIONS">
          <Row
            title="Notifications"
            // One switch, not four — A11 is explicit, so this row is one row.
            value={prefs?.notificationsEnabled ? "On" : "Off"}
            onPress={() => router.push("/profile/notifications")}
            testID="row-notifications"
            last
          />
        </Group>

        <Group label="SECURITY">
          <Row
            title="Signed-in devices"
            value="Manage"
            onPress={() => router.push("/profile/security")}
            testID="row-security"
            last
          />
        </Group>

        <Group label="LEGAL">
          <Row title="Terms of Service" onPress={() => router.push("/legal/terms")} />
          <Row title="Privacy Policy" onPress={() => router.push("/legal/privacy")} last />
        </Group>

        <Group label="ACCOUNT">
          <Row
            title="Delete account"
            destructive
            onPress={() => router.push("/profile/account")}
            testID="row-delete-account"
            last
          />
        </Group>

        <Button
          label="Sign out"
          variant="quiet"
          onPress={() => setConfirmSignOut(true)}
          style={{ marginTop: 22 }}
          testID="sign-out"
        />
      </ScrollScreen>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        body="This device is signed out. Your reports and drafts stay where they are, and any other devices stay signed in."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        destructive={false}
        busy={signingOut}
        onConfirm={doSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={{ marginTop: 22 }}>
      <Text variant="fieldLabel" color={colors.t3}>
        {label}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  title,
  value,
  onPress,
  destructive = false,
  last = false,
  testID,
}: {
  title: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text variant="labelLg" color={destructive ? colors.bad2 : colors.t0} style={{ flex: 1 }}>
        {title}
      </Text>
      {value ? (
        <Text variant="label" color={colors.t4}>
          {value}
        </Text>
      ) : null}
      <Chevron open={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: colors.s6,
    alignItems: "center",
    justifyContent: "center",
  },
  countCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 18,
  },
  group: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    marginTop: 10,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 15,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.07),
  },
});
