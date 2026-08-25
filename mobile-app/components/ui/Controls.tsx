/**
 * Switch, checkbox, chip and segmented control.
 *
 * Grouped in one file because they share the same job — expressing a discrete
 * choice — and the same measurements from the SYSTEM artboard:
 *
 *   Switch    44 × 26 · r 13 · knob 20 inset 3 · on `acc`, off `s7` + `t3` knob
 *   Checkbox  22 × 22 · r 7  · on `acc` with a white tick, off 1.5px `line`
 *   Chip      h 32–34 · r 16–17 · pad 0 12–13 · selected `acc`, idle `s5`
 *   Segment   h 36–38 · r 12 · selected `acc`, idle `s5`
 *
 * ── Touch targets ──────────────────────────────────────────────────────────
 * A 22px checkbox and a 26px switch are both under the 44px minimum, and the
 * design draws them that size. Rather than change the visuals, every control here
 * takes `hitSlop` to reach 44 — and where the design gives the control a label
 * (A9's "Stay anonymous", C3's "I'm not sure of the time"), the whole row is the
 * target, which is both correct and what a person expects.
 */

import React, { useCallback, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

function tap(): void {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Switch
// ─────────────────────────────────────────────────────────────────────────────

export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}): React.ReactElement {
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: 170,
      useNativeDriver: true,
    }).start();
  }, [position, value]);

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tap();
        onValueChange(!value);
      }}
      disabled={disabled}
      // 44 − 26 = 18, so 9 either side reaches the minimum target height.
      hitSlop={{ top: 9, bottom: 9, left: 6, right: 6 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.switchTrack,
        { backgroundColor: value ? colors.acc : colors.s7 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Animated.View
        style={[
          styles.switchKnob,
          {
            backgroundColor: value ? colors.bg : colors.t3,
            transform: [
              { translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

/**
 * A switch with its label and consequence text, as drawn on A9, C3 and C6.
 *
 * The design pairs almost every switch with a sentence saying what it does — "Your
 * report is published without your name or photo" — so the row, not the switch, is
 * the component worth having.
 */
export function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  icon,
  style,
  testID,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  const toggle = useCallback(() => {
    tap();
    onValueChange(!value);
  }, [onValueChange, value]);

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      testID={testID}
      style={({ pressed }) => [styles.switchRow, pressed && { opacity: 0.9 }, style]}
    >
      {icon ? <View style={styles.switchRowIcon}>{icon}</View> : null}
      <View style={styles.switchRowText}>
        <Text variant="labelLg" color={colors.t0}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      {/* The row already handles the press, so the switch itself is decorative. */}
      <View pointerEvents="none">
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkbox
// ─────────────────────────────────────────────────────────────────────────────

export function Checkbox({
  checked,
  onToggle,
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tap();
        onToggle();
      }}
      disabled={disabled}
      hitSlop={11}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.checkbox,
        checked ? styles.checkboxOn : styles.checkboxOff,
        disabled && { opacity: 0.5 },
      ]}
    >
      {checked ? <TickGlyph /> : null}
    </Pressable>
  );
}

/** The tick from the A7 / C7 artboards — two strokes, 2.2px, rounded. */
function TickGlyph(): React.ReactElement {
  return (
    <View style={styles.tick}>
      <View style={styles.tickShort} />
      <View style={styles.tickLong} />
    </View>
  );
}

/**
 * A7's consent row: a checkbox, a label, and the consequence underneath.
 *
 * `locked` renders the dimmed state the artboard shows for the Privacy row before
 * its document has been read — the design's rule is that "each checkbox unlocks
 * only once its own document is read to the end", and a locked row states why.
 */
export function CheckboxRow({
  checked,
  onToggle,
  title,
  description,
  locked = false,
  style,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  description?: string;
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={locked ? undefined : onToggle}
      disabled={locked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      testID={testID}
      style={({ pressed }) => [
        styles.checkboxRow,
        locked && { opacity: 0.5 },
        pressed && !locked && { opacity: 0.85 },
        style,
      ]}
    >
      <View pointerEvents="none">
        <Checkbox checked={checked} onToggle={onToggle} disabled={locked} />
      </View>
      <View style={styles.checkboxRowText}>
        <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
          {title}
        </Text>
        {description ? (
          <Text variant="metaSm" color={colors.t3} style={{ marginTop: 2, lineHeight: 17 }}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip
// ─────────────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  selected = false,
  onPress,
  count,
  dotColor,
  height = 34,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Trailing count, as on B1's category rail. */
  count?: number;
  /** Category dot — 6px inside a chip, per the design's rule. */
  dotColor?: string;
  height?: number;
  testID?: string;
}): React.ReactElement {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      // 34px tall, so 5 either side reaches 44.
      hitSlop={{ top: 5, bottom: 5, left: 0, right: 0 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          height,
          borderRadius: height / 2,
          backgroundColor: selected ? colors.acc : colors.s5,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      {dotColor ? <View style={[styles.chipDot, { backgroundColor: dotColor }]} /> : null}
      <Text variant="chip" color={selected ? colors.onAcc : colors.t1}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text
          variant="chip"
          // Selected: the count dims within the accent. Idle: it steps back to t4.
          color={selected ? colors.onAcc : colors.t4}
          style={selected ? { opacity: 0.6 } : undefined}
        >
          {String(count)}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Segmented control
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * The equal-width segment row from A7 (Terms / Privacy), C3 (Today / Yesterday /
 * This week) and C4 (Exact / Approximate / Hidden).
 *
 * `variant="tabs"` is A7's inset pill-in-a-tray; `variant="chips"` is the flat
 * row used on C3 and C4.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "chips",
  height = 38,
  style,
  testID,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  variant?: "chips" | "tabs";
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.ReactElement {
  const isTabs = variant === "tabs";

  return (
    <View
      style={[
        isTabs ? styles.segmentTray : styles.segmentRow,
        isTabs && { padding: 3 },
        style,
      ]}
      accessibilityRole="tablist"
      testID={testID}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              tap();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [
              styles.segment,
              {
                height: isTabs ? height - 4 : height,
                borderRadius: isTabs ? 9 : 12,
                backgroundColor: selected
                  ? isTabs
                    ? colors.s7
                    : colors.acc
                  : isTabs
                    ? "transparent"
                    : colors.s5,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              variant="chip"
              color={selected ? (isTabs ? colors.t0 : colors.onAcc) : colors.t2}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A9's avatar-mode row: Photo / Initials / Anonymous.
 *
 * Scrollable because at a large accessibility text size three chips no longer fit
 * a 390px screen, and clipping the third would hide a real choice.
 */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  testID?: string;
}): React.ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipGroup}
      testID={testID}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => {
            tap();
            onChange(option.value);
          }}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          style={({ pressed }) => [
            styles.chipGroupItem,
            {
              backgroundColor: option.value === value ? colors.s7 : colors.s5,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text variant="chipSm" color={option.value === value ? colors.t0 : colors.t1}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** The 7px category dot. Never a fill — the design is explicit about this. */
export function CategoryDot({
  color,
  size = 7,
}: {
  color: string;
  size?: number;
}): React.ReactElement {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
    />
  );
}

const styles = StyleSheet.create({
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: "center",
  },
  switchKnob: { width: 20, height: 20, borderRadius: 10 },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  switchRowIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  switchRowText: { flex: 1, paddingRight: 12 },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.acc },
  checkboxOff: { borderWidth: 1.5, borderColor: colors.line },
  tick: { width: 13, height: 13, alignItems: "center", justifyContent: "center" },
  tickShort: {
    position: "absolute",
    width: 5,
    height: 2.2,
    borderRadius: 1.1,
    backgroundColor: colors.bg,
    transform: [{ rotate: "45deg" }, { translateX: -3 }, { translateY: 2 }],
  },
  tickLong: {
    position: "absolute",
    width: 9,
    height: 2.2,
    borderRadius: 1.1,
    backgroundColor: colors.bg,
    transform: [{ rotate: "-45deg" }, { translateX: 1 }],
  },

  checkboxRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  checkboxRowText: { flex: 1, paddingTop: 1 },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },

  segmentRow: { flexDirection: "row", gap: 8 },
  segmentTray: {
    flexDirection: "row",
    backgroundColor: colors.s3,
    borderRadius: 12,
  },
  segment: { flex: 1, alignItems: "center", justifyContent: "center" },

  chipGroup: { flexDirection: "row", gap: 8, paddingRight: 4 },
  chipGroupItem: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});

/** The in-card hairline the design uses between rows inside a control group. */
export const controlHairline = alpha(colors.t0, 0.07);
