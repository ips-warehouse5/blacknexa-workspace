/**
 * A9 · Create account, step 4 of 4 — Profile.
 *
 * From the caption: "The anonymity switch dims the identity block and
 * live-previews the author row. Each sharing card states its consequence."
 *
 * The live preview is the point of the screen: someone choosing to publish
 * anonymously should see exactly what the feed will show before committing, not
 * discover it after their first report. So the author row below is rendered from
 * the same state the feed card will read.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { StepHeader } from "@/components/ui/Progress";
import { ChipGroup, SwitchRow } from "@/components/ui/Controls";
import { useAuth } from "@/providers/AuthProvider";
import { LEGAL_VERSION } from "@/constants/legal-copy";
import type { AvatarMode, Visibility } from "@/lib/api/auth";

/** The three sharing options, each with the consequence the artboard prints. */
const VISIBILITY_OPTIONS: {
  value: Visibility;
  title: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    value: "public",
    title: "Public",
    description: "Anyone in the community feed can read and stand with it.",
  },
  {
    value: "trusted",
    title: "Trusted Circle",
    description: "Verified advocates only. Nothing appears in the public feed.",
    recommended: true,
  },
  {
    value: "private",
    title: "Private",
    description: "Only you. It still counts toward your own record.",
  },
];

export default function SignUpProfileScreen(): React.ReactElement {
  const { user, updateProfile, recordConsents, completeOnboarding, busy, error } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(user?.avatarMode ?? "initials");
  const [anonymous, setAnonymous] = useState(user?.preferences.anonymousByDefault ?? false);
  const [visibility, setVisibility] = useState<Visibility>(
    user?.preferences.defaultVisibility ?? "trusted",
  );

  /** Same derivation the server uses, so the tile matches the feed. */
  const initials = useMemo(() => {
    const name = displayName.trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    return (user?.email[0] ?? "?").toUpperCase();
  }, [displayName, user?.email]);

  /** What the author row will actually say once a report is filed. */
  const publishedName = anonymous || avatarMode === "anonymous" ? "Anonymous" : displayName.trim() || "Anonymous";

  const finish = useCallback(async () => {
    const saved = await updateProfile({
      displayName: displayName.trim(),
      avatarMode,
      anonymousByDefault: anonymous,
      defaultVisibility: visibility,
    });
    if (!saved) return;
    // Recorded here rather than on A7, because there was no account to attach the
    // consent to until the code on A8 was accepted.
    await recordConsents(LEGAL_VERSION);
    completeOnboarding();
    router.replace("/(onboarding)/notifications");
  }, [
    anonymous,
    avatarMode,
    completeOnboarding,
    displayName,
    recordConsents,
    updateProfile,
    visibility,
  ]);

  const identityDimmed = anonymous;

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="signup-profile"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="Back"
            variant="quiet"
            block={false}
            height={52}
            style={{ width: 96 }}
            onPress={() => router.back()}
          />
          <Button
            label="Finish"
            onPress={finish}
            loading={busy}
            style={{ flex: 1 }}
            testID="profile-finish"
          />
        </View>
      }
    >
      <BackHeader title="Create account" onBack={() => router.back()} padding={0} />
      <StepHeader step={4} total={4} name="Profile" />

      {error ? (
        <Text variant="bodySm" color={colors.bad2} style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      {/* Identity block — dimmed, not disabled, when publishing anonymously. */}
      <View style={{ opacity: identityDimmed ? 0.45 : 1, marginTop: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 20,
              backgroundColor: colors.s6,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
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
              testID="avatar-mode"
            />
          </View>
        </View>

        <TextField
          label="DISPLAY NAME"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How should people see you?"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          height={50}
          containerStyle={{ marginTop: 20 }}
          testID="display-name"
        />
      </View>

      <SwitchRow
        title="Stay anonymous"
        description="Reports publish without your name or photo."
        value={anonymous}
        onValueChange={setAnonymous}
        style={{ marginTop: 12 }}
        testID="stay-anonymous"
      />

      {/* Live preview — the same row the feed and D1 will render. */}
      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 18 }}>
        HOW YOUR NAME WILL APPEAR
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.s2,
          borderRadius: 12,
          paddingVertical: 11,
          paddingHorizontal: 13,
          marginTop: 8,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 11,
            backgroundColor: colors.s6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
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

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 20 }}>
        WHO SEES A NEW REPORT BY DEFAULT
      </Text>
      <View style={{ gap: 9, marginTop: 9 }}>
        {VISIBILITY_OPTIONS.map((option) => {
          const selected = option.value === visibility;
          return (
            <Pressable
              key={option.value}
              onPress={() => setVisibility(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              // The description is part of the label: the consequence is the
              // reason to pick one, so a screen reader must hear it too.
              accessibilityLabel={`${option.title}. ${option.description}`}
              testID={`visibility-${option.value}`}
              style={({ pressed }) => [
                {
                  backgroundColor: selected ? colors.s5 : colors.s3,
                  borderRadius: radius.md,
                  // The selected card gains a 1.5px border, so its padding drops
                  // by the same amount and the row height never shifts.
                  borderWidth: selected ? 1.5 : 0,
                  borderColor: selected ? colors.acc : "transparent",
                  paddingVertical: selected ? 10.5 : 12,
                  paddingHorizontal: selected ? 12.5 : 14,
                },
                pressed && { opacity: 0.88 },
              ]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
                  {option.title}
                </Text>
                {option.recommended ? (
                  <Text variant="eyebrow" color={colors.acc} style={{ fontSize: 10 }}>
                    Recommended
                  </Text>
                ) : null}
              </View>
              <Text
                variant="metaSm"
                color={selected ? colors.t2 : colors.t3}
                style={{ marginTop: 2, lineHeight: 17 }}
              >
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollScreen>
  );
}
