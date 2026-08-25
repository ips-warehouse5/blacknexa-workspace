/**
 * D1's single trust card, and the author row beside it.
 *
 * The section header is explicit: "There is exactly one trust card on the page and
 * it holds **three plain signals**; every hash, cipher and percentage lives one
 * sheet down."
 *
 * So this card has room for three lines and no more, and each is a sentence rather
 * than a metric. The temptation is to add a fourth — a hash prefix, a percentage,
 * an algorithm name — and that is precisely what D3 exists to absorb.
 */

import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { Chevron } from "@/app/report/details";
import type { AuthorView, EvidenceStrength, ReportStatus } from "@/lib/api/reports";

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  thin: "Thin",
  fair: "Fair",
  strong: "Strong",
  very_strong: "Very strong",
};

/** Only `strong` and above are green: the label must not flatter a thin report. */
function strengthColor(strength: EvidenceStrength): string {
  if (strength === "very_strong" || strength === "strong") return colors.ok;
  if (strength === "fair") return colors.warn;
  return colors.t3;
}

export function TrustCard({
  status,
  strength,
  fileCount,
  onOpen,
  style,
}: {
  status: ReportStatus;
  strength: EvidenceStrength;
  fileCount: number;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const verified = status === "verified";

  /** Exactly three, and each one a plain statement. */
  const signals: React.ReactNode[] = [
    <Text key="sealed" variant="bodySm" color={colors.t2}>
      {fileCount === 0
        ? "No files were attached to this report."
        : fileCount === 1
          ? "The attached file was sealed when it arrived."
          : `All ${fileCount} files were sealed when they arrived.`}
    </Text>,
    <Text key="unchanged" variant="bodySm" color={colors.t2}>
      {fileCount === 0 ? "The account above is the whole record." : "Nothing has changed since."}
    </Text>,
    <Text key="strength" variant="bodySm" color={colors.t2}>
      Evidence strength:{" "}
      <Text variant="label" color={strengthColor(strength)}>
        {STRENGTH_LABEL[strength]}
      </Text>
    </Text>,
  ];

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Open the trust details"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.94 }, style]}
      testID="trust-card"
    >
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <ShieldGlyph tint={verified ? colors.ok : colors.t3} />
          <Text variant="labelLg" color={colors.t0} style={{ fontSize: 14.5 }}>
            {verified ? "Protected & verified" : "Protected"}
          </Text>
        </View>
        <Chevron open={false} />
      </View>

      <View style={styles.signals}>{signals}</View>
    </Pressable>
  );
}

/** The 18px shield used across D1, D3, C5 and the lightbox. */
export function ShieldGlyph({
  tint = colors.ok,
  size = 18,
}: {
  tint?: string;
  size?: number;
}): React.ReactElement {
  return (
    <View style={{ width: size, height: size * 1.1, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: size,
          height: size * 1.1,
          borderWidth: 1.2,
          borderColor: tint,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottomLeftRadius: size * 0.48,
          borderBottomRightRadius: size * 0.48,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.28,
          height: 1.2,
          borderRadius: 1,
          backgroundColor: tint,
          transform: [{ rotate: "45deg" }, { translateX: -size * 0.13 }, { translateY: size * 0.09 }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.46,
          height: 1.2,
          borderRadius: 1,
          backgroundColor: tint,
          transform: [{ rotate: "-45deg" }, { translateX: size * 0.06 }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    padding: 15,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 },
  signals: {
    gap: 9,
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(colors.t0, 0.07),
  },
});

export default TrustCard;
