/**
 * The status pill — URGENT, VERIFIED, PUBLIC, CORROBORATED, and the category chip.
 *
 * ── Two variants, and why ──────────────────────────────────────────────────
 * The design draws this pill two ways, and the difference is not stylistic:
 *
 *   `tint`     h24 · r7 · status colour at 13–16% behind full-strength text.
 *              Used on D1, D2 and the no-image feed card, where the ground is a
 *              plain surface.
 *
 *   `onMedia`  h23 · r7 · the status colour at ~90% behind white text.
 *              Used on the 1a feed card's lead image, because a 16% tint over a
 *              photograph is invisible.
 *
 * Same token, different alpha. Keeping both here means a card cannot pick the
 * wrong one by accident — the surface it sits on decides.
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

export type PillKind =
  | "urgent"
  | "verified"
  | "public"
  | "trusted"
  | "private"
  | "anonymous"
  | "corroborated"
  | "under_review"
  | "dismissed";

export type PillVariant = "tint" | "onMedia";

interface PillSpec {
  label: string;
  /** Null means the neutral raised surface rather than a status colour. */
  color: string | null;
}

function specFor(kind: PillKind, count?: number): PillSpec {
  switch (kind) {
    case "urgent":
      return { label: "Urgent", color: colors.bad };
    case "verified":
      return { label: "Verified", color: colors.ok };
    case "under_review":
      return { label: "Under review", color: colors.warn };
    case "dismissed":
      return { label: "Dismissed", color: colors.t3 };
    case "corroborated":
      return {
        label: count === undefined ? "Corroborated" : `Corroborated · ${count}`,
        color: colors.corro,
      };
    // Visibility is not a status, so it takes the neutral surface — the design
    // reserves green/amber/red for status meaning only.
    case "public":
      return { label: "Public", color: null };
    case "trusted":
      return { label: "Trusted", color: null };
    case "private":
      return { label: "Private", color: null };
    case "anonymous":
      return { label: "Anonymous", color: null };
    default:
      return { label: kind, color: null };
  }
}

export function StatusPill({
  kind,
  variant = "tint",
  count,
  icon,
  style,
}: {
  kind: PillKind;
  variant?: PillVariant;
  /** For the corroborated pill's "· 12". */
  count?: number;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const spec = specFor(kind, count);
  const onMedia = variant === "onMedia";

  const background = spec.color
    ? onMedia
      ? alpha(spec.color, 0.9)
      : alpha(spec.color, kind === "verified" ? 0.13 : 0.16)
    : onMedia
      ? alpha(colors.deep, 0.72)
      : colors.s5;

  const foreground = spec.color
    ? onMedia
      ? colors.onAcc
      : // `bad2` rather than `bad` for text: the darker red keeps its contrast
        // against a 16% red ground, where `bad` starts to vibrate.
        kind === "urgent"
        ? colors.bad2
        : spec.color
    : onMedia
      ? colors.onDeep
      : colors.t2;

  return (
    <View
      style={[
        styles.pill,
        { height: onMedia ? 23 : 24, backgroundColor: background },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={spec.label}
    >
      {icon}
      <Text
        variant="eyebrow"
        color={foreground}
        style={{ fontSize: 10.5, letterSpacing: 0.44 }}
        numberOfLines={1}
      >
        {spec.label}
      </Text>
    </View>
  );
}

/** The category chip — a 6px dot plus the label, never a coloured fill. */
export function CategoryPill({
  label,
  dotColor,
  style,
}: {
  label: string;
  dotColor: string;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View style={[styles.pill, { height: 24, backgroundColor: colors.s5 }, style]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
      <Text variant="eyebrow" color={colors.t1} style={{ fontSize: 10.5, letterSpacing: 0.44 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: radius.xs,
    alignSelf: "flex-start",
  },
});

export default StatusPill;
