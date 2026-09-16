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
import { Chevron } from "@/app/report/details";

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
  last = false,
  testID,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  /** Visible but not actionable — used for board rows with no backing API yet. */
  disabled?: boolean;
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
        pressed && !disabled && { opacity: 0.9 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        variant="labelLg"
        color={destructive ? colors.bad2 : colors.t0}
        style={{ flex: 1 }}
      >
        {title}
      </Text>
      {value ? (
        <Text variant="label" color={colors.t4}>
          {value}
        </Text>
      ) : null}
      {onPress && !disabled ? <Chevron open={false} /> : null}
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

const styles = StyleSheet.create({
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
