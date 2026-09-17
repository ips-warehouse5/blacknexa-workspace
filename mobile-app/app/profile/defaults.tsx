/**
 * H8 · Privacy & sharing.
 *
 * This screen owns the defaults a new report inherits: public/private audience,
 * anonymous-by-default, and location precision. The API currently backs these as
 * `defaultVisibility`, `anonymousByDefault`, and `defaultPrecision`.
 */

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, Globe2, Lock } from "lucide-react-native";
import { router } from "expo-router";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Switch } from "@/components/ui/Controls";
import { useAuth } from "@/providers/AuthProvider";
import type { LocationPrecision, Visibility } from "@/lib/api/auth";

type VisibleAudience = Extract<Visibility, "public" | "private">;

const PRECISION: { value: LocationPrecision; label: string }[] = [
  { value: "exact", label: "Exact" },
  { value: "approximate", label: "About 500 m" },
  { value: "hidden", label: "City only" },
];

export default function DefaultsScreen(): React.ReactElement {
  useThemeSync();
  const { user, updateProfile } = useAuth();
  const prefs = user?.preferences;

  const [audience, setAudience] = useState<VisibleAudience>(
    prefs?.defaultVisibility === "private" ? "private" : "public",
  );
  const [precision, setPrecision] = useState<LocationPrecision>(
    prefs?.defaultPrecision ?? "approximate",
  );
  const [anonymous, setAnonymous] = useState(prefs?.anonymousByDefault ?? false);

  const chooseAudience = useCallback(
    async (next: VisibleAudience) => {
      setAudience(next);
      await updateProfile({ defaultVisibility: next });
    },
    [updateProfile],
  );

  const choosePrecision = useCallback(
    async (next: LocationPrecision) => {
      setPrecision(next);
      await updateProfile({ defaultPrecision: next });
    },
    [updateProfile],
  );

  const toggleAnonymous = useCallback(
    async (next: boolean) => {
      setAnonymous(next);
      await updateProfile({ anonymousByDefault: next });
    },
    [updateProfile],
  );

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-defaults">
      <BackHeader title="Privacy & sharing" onBack={() => router.back()} padding={0} />

      <SectionLabel>WHO SEES A NEW REPORT</SectionLabel>
      <View style={styles.optionStack}>
        <AudienceCard
          title="Public"
          description="Appears in the public feed to build awareness."
          selected={audience === "public"}
          icon={<Globe2 size={16} color={audience === "public" ? colors.acc : colors.t4} />}
          onPress={() => void chooseAudience("public")}
          testID="default-visibility-public"
        />
        <AudienceCard
          title="Private"
          description="Only visible to you. Stored in your Vault."
          selected={audience === "private"}
          icon={<Lock size={16} color={audience === "private" ? colors.acc : colors.t4} />}
          onPress={() => void chooseAudience("private")}
          testID="default-visibility-private"
        />
      </View>

      <Text variant="metaSm" color={colors.t3} style={styles.helpCopy}>
        Each new report inherits this and shows it as “Your default” on the Flags
        step. Whichever you pick, evidence stays encrypted — visibility changes who
        reads the report, never who can open the files.
      </Text>

      <SectionLabel>YOUR NAME</SectionLabel>
      <View style={[styles.group, { backgroundColor: colors.s3 }]}>
        <ToggleRow
          title="Stay anonymous"
          description="Applies to new reports and comments alike."
          value={anonymous}
          onValueChange={toggleAnonymous}
        />
        <ToggleRow
          title="Let advocates contact me"
          description="Off. A verified advocate cannot reach you about a report."
          value={false}
          disabled
          last
        />
      </View>

      <SectionLabel>LOCATION</SectionLabel>
      <View style={[styles.locationCard, { backgroundColor: colors.s3 }]}>
        <Text variant="label" color={colors.t0}>
          Default precision
        </Text>
        <View style={styles.segment}>
          {PRECISION.map((option) => {
            const selected = option.value === precision;
            return (
              <Pressable
                key={option.value}
                onPress={() => void choosePrecision(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.segmentOption,
                  { backgroundColor: selected ? colors.acc : colors.s5 },
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text
                  variant="labelSm"
                  color={selected ? colors.onAcc : colors.t2}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="metaSm" color={colors.t3} style={styles.locationHelp}>
          Every report can still override this on the Location step.
        </Text>
      </View>

      <SectionLabel>READ MORE</SectionLabel>
      <View style={[styles.group, { backgroundColor: colors.s3 }]}>
        <ReadMoreRow
          title="How BlackNexa protects your evidence"
          onPress={() => router.push("/legal/evidence-protection")}
        />
        <ReadMoreRow title="Privacy Policy" onPress={() => router.push("/legal/privacy")} last />
      </View>
    </ScrollScreen>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Text variant="fieldLabel" color={colors.t3} style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

function AudienceCard({
  title,
  description,
  selected,
  icon,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  selected: boolean;
  icon: React.ReactNode;
  onPress: () => void;
  testID: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.audienceCard,
        {
          backgroundColor: selected ? alpha(colors.acc, 0.045) : colors.s3,
          borderColor: selected ? colors.acc : "transparent",
        },
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={styles.audienceIcon}>{icon}</View>
      <View style={styles.audienceText}>
        <Text variant="label" color={colors.t0}>
          {title}
        </Text>
        <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 4 }}>
          {description}
        </Text>
      </View>
      {selected ? <Check size={17} color={colors.acc} /> : null}
    </Pressable>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  last = false,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}): React.ReactElement {
  return (
    <View
      style={[
        styles.toggleRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: alpha(colors.t0, 0.07),
        },
        disabled && { opacity: 0.72 },
      ]}
    >
      <View style={styles.toggleText}>
        <Text variant="label" color={disabled ? colors.t2 : colors.t0}>
          {title}
        </Text>
        <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 3 }}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange ?? (() => {})}
        disabled={disabled || !onValueChange}
        accessibilityLabel={title}
      />
    </View>
  );
}

function ReadMoreRow({
  title,
  onPress,
  last = false,
}: {
  title: string;
  onPress: () => void;
  last?: boolean;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.readRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: alpha(colors.t0, 0.07),
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text variant="label" color={colors.t0} style={{ flex: 1 }}>
        {title}
      </Text>
      <Chevron />
    </Pressable>
  );
}

function Chevron(): React.ReactElement {
  return (
    <View style={styles.chevronBox}>
      <View style={[styles.chevron, { borderColor: colors.t4 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: 22,
  },
  optionStack: {
    gap: 9,
    marginTop: 8,
  },
  audienceCard: {
    minHeight: 66,
    borderRadius: radius.lg,
    borderWidth: 1.4,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  audienceIcon: {
    width: 18,
    alignItems: "center",
    paddingTop: 1,
  },
  audienceText: {
    flex: 1,
    minWidth: 0,
  },
  helpCopy: {
    marginTop: 12,
    lineHeight: 17,
  },
  group: {
    borderRadius: radius.lg,
    marginTop: 8,
    overflow: "hidden",
  },
  toggleRow: {
    minHeight: 66,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
  },
  locationCard: {
    marginTop: 8,
    borderRadius: radius.lg,
    padding: 14,
  },
  segment: {
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
  },
  segmentOption: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  locationHelp: {
    marginTop: 10,
    lineHeight: 17,
  },
  readRow: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    transform: [{ rotate: "-45deg" }],
  },
});
