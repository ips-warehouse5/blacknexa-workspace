/**
 * Shared row/group primitives for the Profile & Settings screens (H section).
 *
 * Extracted from `app/profile/index.tsx` so the new dedicated Settings root
 * (H2) can use the exact same visual language instead of a second,
 * competing implementation.
 */

import React from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

export function Group({
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

export function Row({
  title,
  value,
  onPress,
  destructive = false,
  disabled = false,
  centered = false,
  showChevron = true,
  last = false,
  testID,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  /** Visible but not actionable — used for board rows with no backing API yet. */
  disabled?: boolean;
  centered?: boolean;
  showChevron?: boolean;
  last?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole={disabled ? "text" : "button"}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        centered && styles.centeredRow,
        pressed && !disabled && { opacity: 0.9 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        variant="labelLg"
        color={destructive ? colors.bad2 : colors.t0}
        style={[styles.title, centered && styles.centeredTitle]}
      >
        {title}
      </Text>
      {value ? (
        <Text variant="label" color={colors.t4}>
          {value}
        </Text>
      ) : null}
      {onPress && !disabled && showChevron ? <SettingsChevron /> : null}
    </Pressable>
  );
}

/** A boolean-switch row, for board rows that toggle rather than navigate. */
export function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  last = false,
  testID,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <View
      style={[styles.row, !last && styles.rowDivider, disabled && { opacity: 0.5 }]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="labelLg" color={colors.t0}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 3 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || !onValueChange}
        trackColor={{ false: alpha(colors.t0, 0.14), true: colors.acc }}
        thumbColor={colors.bg}
        testID={testID}
      />
    </View>
  );
}

function SettingsChevron(): React.ReactElement {
  return (
    <View style={styles.chevronBox}>
      <View style={styles.chevron} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    marginTop: 8,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  centeredRow: {
    justifyContent: "center",
  },
  title: {
    flex: 1,
  },
  centeredTitle: {
    flex: 0,
    textAlign: "center",
  },
  rowDivider: {
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
});
