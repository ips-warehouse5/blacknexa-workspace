/**
 * H6 · Account.
 *
 * SIGN IN group (email, password → H7, connected sign-in), DEVICES group
 * (reuses the real session list already built for `/profile/security`
 * rather than duplicating it), YOUR DATA group (Delete account).
 *
 * "Connected sign-in" (which OAuth provider, if any, is linked) has no
 * client-exposed field anywhere in this API surface — `UserIdentity` rows
 * exist server-side but nothing in `lib/api/auth.ts`'s `UserProfile`
 * returns them. Shown as unavailable rather than guessed from
 * `hasPassword` (a passwordless account could be Apple OR Google — that
 * distinction genuinely isn't knowable client-side today).
 *
 * "Password — last changed" has no timestamp field on the backend
 * (`AppUser` has no `password_changed_at`), so only the action is shown,
 * not a fabricated date.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import authApi, { type SessionSummary } from "@/lib/api/auth";

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

export default function AccountInfoScreen(): React.ReactElement {
  const { user } = useAuth();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => authApi.sessions(),
  });
  const visibleSessions = (sessions.data ?? []).slice(0, 2);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-account-info">
      <BackHeader title="Account" onBack={() => router.back()} padding={0} />

      <AccountGroup label="SIGN IN">
        <AccountRow title="Email" detail={user?.email ?? "—"} disabled />
        {user?.hasPassword ? (
          <AccountRow
            title="Password"
            detail="Last changed date unavailable"
            onPress={() => router.push("/profile/change-password")}
            testID="row-change-password"
          />
        ) : (
          <AccountRow
            title="Password"
            detail="Not set — signed in with Apple or Google"
            disabled
          />
        )}
        <AccountRow title="Connected sign-in" detail="Not shown" disabled last />
      </AccountGroup>

      <AccountGroup label="DEVICES">
        {sessions.isLoading ? (
          <DeviceSkeleton />
        ) : visibleSessions.length > 0 ? (
          visibleSessions.map((session, index) => (
            <DeviceRow
              key={session.id}
              session={session}
              last={index === visibleSessions.length - 1}
            />
          ))
        ) : (
          <AccountRow title="No other devices" detail="This device is the only active session." disabled />
        )}
      </AccountGroup>

      <AccountGroup label="YOUR DATA">
        <AccountRow
          title="Delete account"
          destructive
          onPress={() => router.push("/profile/account")}
          testID="row-delete-account"
          last
        />
      </AccountGroup>

      <View style={{ marginTop: 14 }}>
        <Text variant="metaSm" color={colors.t4}>
          Signing out of another device is not available from this screen yet.
        </Text>
      </View>
    </ScrollScreen>
  );
}

function AccountGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <Text variant="fieldLabel" color={colors.t3}>
        {label}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function AccountRow({
  title,
  detail,
  onPress,
  destructive = false,
  disabled = false,
  last = false,
  testID,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  last?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole={disabled ? "text" : "button"}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        !last && styles.divider,
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <View style={styles.rowText}>
        <Text
          variant="label"
          color={destructive ? colors.bad2 : disabled ? colors.t3 : colors.t0}
        >
          {title}
        </Text>
        {detail ? (
          <Text variant="metaSm" color={colors.t4} numberOfLines={1} style={{ marginTop: 3 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress && !disabled ? <Chevron /> : null}
    </Pressable>
  );
}

function DeviceRow({
  session,
  last,
}: {
  session: SessionSummary;
  last: boolean;
}): React.ReactElement {
  const detail = [session.current ? "Active now" : `Last used ${whenSeen(session.lastSeenAt)}`, session.platform]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={styles.rowText}>
        <Text variant="label" color={colors.t0}>
          {session.current ? `${session.deviceLabel} · this device` : session.deviceLabel}
        </Text>
        <Text
          variant="metaSm"
          color={session.current ? colors.ok : colors.t4}
          numberOfLines={1}
          style={{ marginTop: 3 }}
        >
          {detail}
        </Text>
      </View>
      {!session.current ? (
        <Text variant="metaSm" color={colors.bad2}>
          Manage
        </Text>
      ) : null}
    </View>
  );
}

function DeviceSkeleton(): React.ReactElement {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <View style={[styles.bar, { width: 120, height: 13 }]} />
        <View style={[styles.bar, { width: 88, height: 11, marginTop: 8 }]} />
      </View>
    </View>
  );
}

function Chevron(): React.ReactElement {
  return (
    <View style={styles.chevronBox}>
      <View style={styles.chevron} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 22,
  },
  group: {
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    marginTop: 8,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    paddingVertical: 11,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.07),
  },
  chevronBox: {
    width: 14,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    width: 7,
    height: 7,
    borderRightWidth: 1.4,
    borderBottomWidth: 1.4,
    borderColor: colors.t4,
    transform: [{ rotate: "-45deg" }],
  },
  bar: {
    backgroundColor: colors.s5,
    borderRadius: 5,
  },
});
