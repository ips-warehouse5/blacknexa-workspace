import { Shield } from "lucide-react-native";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

type Variant = "chip" | "header" | "watermark" | "inline";

interface BrandMarkProps {
  variant?: Variant;
  tagline?: string;
  showIcon?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export default function BrandMark({
  variant = "chip",
  tagline,
  showIcon = true,
  style,
  testID = "brand-mark",
}: BrandMarkProps): React.ReactElement {
  if (variant === "watermark") {
    return (
      <View style={[styles.watermark, style]} testID={testID}>
        <Text variant="bodyXs" color={colors.t3} center style={styles.watermarkText}>
          BlackNexa<Text variant="eyebrowSm" color={colors.acc}>™</Text>
          {"  "}· By the people, for the people
        </Text>
        <Text variant="eyebrowSm" color={colors.t4} center style={styles.watermarkLegal}>
          Trademark pending · USPTO
        </Text>
      </View>
    );
  }

  if (variant === "header") {
    return (
      <View style={[styles.headerRow, style]} testID={testID}>
        {showIcon && (
          <View style={styles.headerIcon}>
            <Shield size={14} color={colors.bg} fill={colors.acc} />
          </View>
        )}
        <View>
          <View style={styles.brandLine}>
            <Text variant="sectionTitle" color={colors.t0}>BlackNexa</Text>
            <Text variant="eyebrowSm" color={colors.acc} style={styles.tm}>TM</Text>
          </View>
          {tagline ? <Text variant="metaSm" color={colors.t3}>{tagline}</Text> : null}
        </View>
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View style={[styles.inline, style]} testID={testID}>
        <Text variant="labelSm" color={colors.acc}>
          BlackNexa<Text variant="eyebrowSm" color={colors.acc}>™</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, style]} testID={testID}>
      {showIcon && <Shield size={11} color={colors.acc} />}
      <Text variant="labelSm" color={colors.t0}>
        BlackNexa<Text variant="eyebrowSm" color={colors.acc}>™</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.s5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(colors.acc, 0.3),
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.xl,
    alignSelf: "flex-start",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.s5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: alpha(colors.acc, 0.3),
  },
  brandLine: { flexDirection: "row", alignItems: "flex-start", gap: 2 },
  tm: {
    marginTop: 2,
  },
  inline: { flexDirection: "row", alignItems: "center" },
  watermark: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 2,
  },
  watermarkText: {
    letterSpacing: 0.4,
  },
  watermarkLegal: {
    letterSpacing: 0.6,
  },
});
