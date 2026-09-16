/**
 * H1 · Profile — the person, not a dashboard.
 *
 * `DERIVED` until this pass: the module previously here (identity + every
 * settings group flattened into one screen) was built against a different,
 * earlier scope doc (its own comments cited "A9", "A11", "C4", "D4" —
 * not this board's H-numbering). Reconciled against `BlackNexa Screen
 * Board-v7.html`'s H section: H1 is now just identity, real counts, and an
 * "Edit profile" action; every settings group that used to live here moved
 * to a dedicated H2 (`/profile/settings`), reachable from the gear icon —
 * matching the board's own separation between the two screens.
 *
 * Stats: "Reports" and "Reports you filed" both come from the same real,
 * live count (`reportsApi.feed({ mine: true })`) the Vault uses.
 * Corroborations/Files/Comments/Saved-articles have no backing endpoint
 * anywhere in this API surface — rather than leave the screen looking
 * broken (a near-empty page next to the board's dense reference), they're
 * shown as the placeholder value `0` with `PLACEHOLDER_STATS` naming
 * exactly which numbers these are, so nobody mistakes them for real zeros
 * later. Wire each one up the moment a real endpoint exists — search this
 * file for `PLACEHOLDER_STATS` first.
 *
 * ── Two defects this replaces ──────────────────────────────────────────────
 * The previous profile screen edited the display name and the vault PIN through
 * `Alert.prompt`, which is **iOS-only** — both were silently dead on Android. And
 * its "Sign out" cleared two consent flags and navigated, without revoking a token
 * or ending a session.
 */

import React, { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Settings as SettingsIcon } from "lucide-react-native";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Chevron } from "@/app/report/details";
import { useAuth } from "@/providers/AuthProvider";
import reportsApi from "@/lib/api/reports";

/**
 * Stats with no backing endpoint. Named explicitly so a future integration
 * is a one-line change here, not a hunt through JSX for a stray `0`.
 */
const PLACEHOLDER_STATS = {
  corroborations: 0,
  files: 0,
  reportsCorroborated: 0,
  comments: 0,
  savedArticles: 0,
};

function formatMemberSince(createdAt: string | undefined): string {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return `Member since ${date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })}`;
}

export default function ProfileScreen(): React.ReactElement {
  const { user } = useAuth();

  /** "My reports" count — a real number, from the same endpoint the Vault uses. */
  const mine = useQuery({
    queryKey: ["feed", "mine-count"],
    queryFn: () => reportsApi.feed({ mine: true, limit: 50 }),
  });

  const reportCount = mine.data?.items.length ?? 0;
  const prefs = user?.preferences;

  const openSettings = useCallback(() => router.push("/profile/settings"), []);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile">
      <BackHeader
        title="Profile"
        onBack={() => router.back()}
        padding={0}
        right={
          <Pressable
            onPress={openSettings}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            testID="profile-settings-gear"
          >
            <SettingsIcon size={20} color={colors.t1} />
          </Pressable>
        }
      />

      {/* Identity header. */}
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: colors.s6 }]}>
          <Text variant="cardTitle" color={colors.acc}>
            {user?.initials ?? "?"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="profileName" color={colors.t0}>
            {user?.displayName?.trim() || "Anonymous"}
          </Text>
          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 3 }}>
            {formatMemberSince(user?.createdAt) || user?.email || ""}
          </Text>
        </View>
      </View>

      {prefs ? (
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: colors.s5 }]}>
            <Text variant="metaSm" color={colors.t1}>
              {prefs.defaultVisibility === "trusted"
                ? "Trusted Circle by default"
                : prefs.defaultVisibility === "private"
                  ? "Private by default"
                  : "Community by default"}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.s5 }]}>
            <Text variant="metaSm" color={colors.t1}>
              Anonymous {prefs.anonymousByDefault ? "on" : "off"}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.statsRow, { backgroundColor: colors.s3 }]}>
        <Stat label="Reports" value={mine.isLoading ? "—" : reportCount} />
        <View style={[styles.statDivider, { backgroundColor: alpha(colors.t0, 0.1) }]} />
        <Stat label="Corroborations" value={PLACEHOLDER_STATS.corroborations} />
        <View style={[styles.statDivider, { backgroundColor: alpha(colors.t0, 0.1) }]} />
        <Stat label="Files" value={PLACEHOLDER_STATS.files} />
      </View>

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
        YOUR WORK
      </Text>
      <View style={[styles.group, { backgroundColor: colors.s3 }]}>
        <WorkRow
          title="Reports you filed"
          value={mine.isLoading ? "—" : reportCount}
          onPress={() => router.push("/(tabs)/vault")}
          testID="profile-my-reports"
        />
        <WorkRow
          title="Reports you corroborated"
          value={PLACEHOLDER_STATS.reportsCorroborated}
        />
        <WorkRow title="Comments" value={PLACEHOLDER_STATS.comments} />
        <WorkRow
          title="Saved articles"
          value={PLACEHOLDER_STATS.savedArticles}
          last
        />
      </View>

      <Button
        label="Edit profile"
        variant="quiet"
        onPress={() => router.push("/profile/identity")}
        style={{ marginTop: 18 }}
        testID="profile-edit"
      />
    </ScrollScreen>
  );
}

function Stat({ label, value }: { label: string; value: number | string }): React.ReactElement {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text variant="statNumber" color={colors.t0}>
        {value}
      </Text>
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

function WorkRow({
  title,
  value,
  onPress,
  last = false,
  testID,
}: {
  title: string;
  value: number | string;
  onPress?: () => void;
  last?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${title}, ${value}`}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: alpha(colors.t0, 0.07),
        },
        pressed && onPress && { opacity: 0.9 },
      ]}
    >
      <Text variant="labelLg" color={colors.t0} style={{ flex: 1 }}>
        {title}
      </Text>
      <Text variant="label" color={colors.t4}>
        {value}
      </Text>
      {onPress ? <Chevron open={false} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badges: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  badge: {
    borderRadius: radius.lg,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.xl,
    paddingVertical: 16,
    marginTop: 18,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
  },
  group: {
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
});
