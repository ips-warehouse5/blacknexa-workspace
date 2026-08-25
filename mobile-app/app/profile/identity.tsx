/**
 * Profile → Name and avatar. `DERIVED`.
 *
 * Reuses A9's controls and its live author-row preview, because this is the same
 * decision made a second time — and someone changing their name should see the same
 * consequence they saw when they first set it.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ChipGroup } from "@/components/ui/Controls";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import type { AvatarMode } from "@/lib/api/auth";

export default function IdentityScreen(): React.ReactElement {
  const { user, updateProfile, busy } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(user?.avatarMode ?? "initials");

  const initials = useMemo(() => {
    const name = displayName.trim();
    if (!name) return (user?.email[0] ?? "?").toUpperCase();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [displayName, user?.email]);

  /** What a report or comment will actually publish. */
  const publishedName =
    avatarMode === "anonymous" || !displayName.trim() ? "Anonymous" : displayName.trim();

  const save = useCallback(async () => {
    const ok = await updateProfile({ displayName: displayName.trim(), avatarMode });
    if (ok) router.back();
  }, [avatarMode, displayName, updateProfile]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="profile-identity"
      footer={<Button label="Save" onPress={save} loading={busy} testID="save-identity" />}
    >
      <BackHeader title="Name and avatar" onBack={() => router.back()} padding={0} />

      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text variant="cardTitle" color={colors.acc}>
            {initials}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <ChipGroup<AvatarMode>
            value={avatarMode}
            onChange={setAvatarMode}
            options={[
              { value: "photo", label: "Photo" },
              { value: "initials", label: "Initials" },
              { value: "anonymous", label: "Anonymous" },
            ]}
            testID="identity-avatar-mode"
          />
        </View>
      </View>

      <TextField
        label="DISPLAY NAME"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How should people see you?"
        autoCapitalize="words"
        height={50}
        containerStyle={{ marginTop: 20 }}
        testID="identity-name"
      />

      {/* The same preview A9 shows, for the same reason. */}
      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 20 }}>
        HOW YOUR NAME WILL APPEAR
      </Text>
      <View style={styles.preview}>
        <View style={styles.previewAvatar}>
          {publishedName === "Anonymous" ? null : (
            <Text variant="labelSm" color={colors.acc}>
              {initials}
            </Text>
          )}
        </View>
        <View>
          <Text variant="label" color={colors.t0}>
            {publishedName}
          </Text>
          <Text variant="metaSm" color={colors.t4}>
            Your area · just now
          </Text>
        </View>
      </View>

      <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 16, lineHeight: 19 }}>
        Changing this affects new reports and comments. Anything already published
        keeps the name it was published under.
      </Text>
    </ScrollScreen>
  );
}

const styles = {
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 14, marginTop: 20 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: colors.s6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  preview: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: colors.s2,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  previewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.s6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
