/**
 * The status pill — URGENT, VERIFIED, PUBLIC, CORROBORATED, the owner's display
 * status, and the category chip.
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
 *
 * ── The owner's display status (docs/INCIDENT_MODULE_PLAN.md §3.2) ────────
 * D2 and the Vault label a report with one owner-facing word — Checking, With a
 * moderator, Not published, Taken down, Published, and the case words Under
 * review, Verified, Dismissed, Private. Those words and their tones come from
 * `lib/report/moderation.ts` (`DISPLAY_STATUS_LABELS`, `ownerStatusCopy`), so a
 * pill here, the D2 banner and a Vault chip can never disagree about what
 * colour "With a moderator" is. The publication words are **owner-only**: D1
 * never draws Checking, With a moderator or Under review for someone else's
 * report — a viewer only ever reaches published reports, and only Verified is
 * news to a reader.
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import {
  DISPLAY_STATUS_LABELS,
  ownerStatusCopy,
  type DisplayStatus,
  type StatusTone,
} from "@/lib/report/moderation";

/**
 * Every pill. The display statuses are part of the union, so `verified`,
 * `under_review`, `dismissed` and `private` are one kind each whichever screen
 * asks — the case badge on D1 and the owner's status on D2 share a colour.
 */
export type PillKind =
  | "urgent"
  | "public"
  | "trusted"
  | "anonymous"
  | "corroborated"
  /** A file the server hashed on arrival — D11's facts panel. Not a verdict. */
  | "sealed"
  | DisplayStatus;

export type PillVariant = "tint" | "onMedia";

interface PillSpec {
  label: string;
  /** Null means the neutral raised surface rather than a status colour. */
  color: string | null;
}

/**
 * A moderation tone as a colour token — read at render time, because `colors`
 * is the live theme. `neutral` is the plain raised surface, like visibility.
 */
function toneColor(tone: StatusTone): string | null {
  switch (tone) {
    case "ok":
      return colors.ok;
    case "attention":
      return colors.warn;
    case "bad":
      return colors.bad;
    case "progress":
      return colors.acc;
    case "muted":
      return colors.t3;
    case "neutral":
    default:
      return null;
  }
}

/** A display status's pill: the owner's word and the tone D2's banner uses. */
function displaySpec(status: DisplayStatus): PillSpec {
  return { label: DISPLAY_STATUS_LABELS[status], color: toneColor(ownerStatusCopy(status).tone) };
}

function specFor(kind: PillKind, count?: number): PillSpec {
  switch (kind) {
    case "urgent":
      return { label: "Urgent", color: colors.bad };
    case "sealed":
      return { label: "Sealed", color: colors.ok };
    case "checking":
    case "with_moderator":
    case "not_published":
    case "taken_down":
    case "published":
    case "verified":
    case "under_review":
    case "dismissed":
      return displaySpec(kind);
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
        // against a 16% red ground, where `bad` starts to vibrate — Urgent,
        // Not published and Taken down alike.
        spec.color === colors.bad
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

/**
 * The owner's display status as a pill (D2, the Vault). `published` on a private
 * report reads *Private* — §3.2's substitution — for a caller that has only the
 * visibility to go on.
 */
export function DisplayStatusPill({
  displayStatus,
  isPrivate = false,
  variant = "tint",
  style,
}: {
  displayStatus: DisplayStatus;
  isPrivate?: boolean;
  variant?: PillVariant;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const kind: PillKind = displayStatus === "published" && isPrivate ? "private" : displayStatus;
  return <StatusPill kind={kind} variant={variant} style={style} />;
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
