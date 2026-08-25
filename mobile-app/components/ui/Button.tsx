/**
 * Buttons, at the four weights the design uses.
 *
 * From the SYSTEM artboard's PARTS card:
 *   primary     h 50–52 · r 14 · accent fill      · Work Sans 600 15.5
 *   secondary   h 46–50 · r 13 · raised surface   · Work Sans 600 14
 *   quiet       h 46–52 · r 13 · 1px ink-16% edge · Work Sans 600 15
 *   destructive h 50    · r 14 · red fill (C11) or red-tint + red text (D2)
 *
 * ── On `disabled` ──────────────────────────────────────────────────────────
 * The design is emphatic that the forward action is **never disabled**: on A6,
 * "Continue is always enabled; tapping it early scrolls to what is missing", and
 * C1–C7 repeat it for Next. So `disabled` here is reserved for the genuinely
 * unavailable — a submit already in flight — and a screen that wants "not yet
 * valid" should keep the button live and handle the tap. `loading` covers the
 * in-flight case and is what most callers actually want.
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { alpha, colors, controlHeight, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive" | "destructiveTint";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Rendered before the label — a provider mark on A5, an icon elsewhere. */
  icon?: React.ReactNode;
  /** Fill the available width. Default true; false for an inline pill. */
  block?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  /** Suppress the selection tap. Set for a destructive confirm. */
  noHaptics?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  block = true,
  height,
  style,
  testID,
  accessibilityLabel,
  noHaptics = false,
}: ButtonProps): React.ReactElement {
  const inert = disabled || loading;

  const handlePress = useCallback(() => {
    if (inert) return;
    if (!noHaptics && Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress?.();
  }, [inert, noHaptics, onPress]);

  const surface = SURFACE[variant];
  const resolvedHeight = height ?? surface.height;

  return (
    <Pressable
      onPress={handlePress}
      disabled={inert}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      android_ripple={
        surface.ripple ? { color: surface.ripple, borderless: false } : undefined
      }
      style={({ pressed }) => [
        styles.base,
        {
          height: resolvedHeight,
          borderRadius: surface.radius,
          backgroundColor: surface.background,
          borderWidth: surface.borderWidth,
          borderColor: surface.borderColor,
          alignSelf: block ? "stretch" : "flex-start",
          paddingHorizontal: block ? 16 : 20,
        },
        // iOS has no ripple, so the press state is an opacity shift instead.
        pressed && Platform.OS !== "android" ? { opacity: 0.82 } : null,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={surface.foreground} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text variant={surface.textVariant} color={surface.foreground} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const SURFACE: Record<
  ButtonVariant,
  {
    height: number;
    radius: number;
    background: string;
    foreground: string;
    borderWidth: number;
    borderColor: string;
    textVariant: "buttonPrimary" | "button" | "buttonSm";
    ripple?: string;
  }
> = {
  primary: {
    height: controlHeight.button,
    radius: radius.lg,
    background: colors.acc,
    foreground: colors.onAcc,
    borderWidth: 0,
    borderColor: "transparent",
    textVariant: "buttonPrimary",
    ripple: alpha(colors.onAcc, 0.18),
  },
  secondary: {
    height: controlHeight.buttonSecondary,
    radius: radius.md,
    background: colors.s6,
    foreground: colors.t0,
    borderWidth: 0,
    borderColor: "transparent",
    textVariant: "buttonSm",
    ripple: alpha(colors.t0, 0.08),
  },
  quiet: {
    height: controlHeight.buttonQuiet,
    radius: radius.md,
    background: "transparent",
    foreground: colors.t1,
    borderWidth: 1,
    borderColor: alpha(colors.t0, 0.16),
    textVariant: "button",
    ripple: alpha(colors.t0, 0.06),
  },
  /** C11's "Discard it" — a solid red, used only on a confirmed destruction. */
  destructive: {
    height: controlHeight.buttonSecondary,
    radius: radius.lg,
    background: colors.bad,
    foreground: colors.onAcc,
    borderWidth: 0,
    borderColor: "transparent",
    textVariant: "button",
    ripple: alpha("#FFFFFF", 0.2),
  },
  /** D2's "Delete" — a tint, because it opens a confirmation rather than acting. */
  destructiveTint: {
    height: controlHeight.buttonQuiet,
    radius: radius.md,
    background: alpha(colors.bad, 0.12),
    foreground: colors.bad2,
    borderWidth: 0,
    borderColor: "transparent",
    textVariant: "buttonSm",
    ripple: alpha(colors.bad, 0.14),
  },
};

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  icon: { alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
});

/**
 * A text-only action. Used for A4/A11's "Not now", C10's "Discard", and the
 * A13/A10 footer links — the design gives these a 50px row and no surface.
 */
export function TextButton({
  label,
  onPress,
  color = colors.t2,
  height = 50,
  testID,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  height?: number;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { height, alignItems: "center", justifyContent: "center" },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text variant="buttonSm" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

export default Button;
