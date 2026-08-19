import { Shield } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";

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
        <Text style={styles.watermarkText}>
          BlackNexa<Text style={styles.watermarkTm}>™</Text>
          {"  "}· By the people, for the people
        </Text>
        <Text style={styles.watermarkLegal}>
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
            <Shield size={14} color={Colors.background} fill={Colors.gold} />
          </View>
        )}
        <View>
          <View style={styles.brandLine}>
            <Text style={styles.brand}>BlackNexa</Text>
            <Text style={styles.tm}>TM</Text>
          </View>
          {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
        </View>
      </View>
    );
  }

  if (variant === "inline") {
    return (
      <View style={[styles.inline, style]} testID={testID}>
        <Text style={styles.inlineText}>
          BlackNexa<Text style={styles.inlineTm}>™</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, style]} testID={testID}>
      {showIcon && <Shield size={11} color={Colors.gold} />}
      <Text style={styles.chipText}>
        BlackNexa<Text style={styles.chipTm}>™</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "44",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: 0.4,
  },
  chipTm: {
    fontSize: 8,
    color: Colors.gold,
    fontWeight: "700", fontFamily: fontFamily.bold,
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
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  brandLine: { flexDirection: "row", alignItems: "flex-start", gap: 2 },
  brand: {
    fontSize: 16,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  tm: {
    fontSize: 8,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tagline: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  inline: { flexDirection: "row", alignItems: "center" },
  inlineText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  inlineTm: { fontSize: 8, color: Colors.gold },
  watermark: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 2,
  },
  watermarkText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    textAlign: "center",
  },
  watermarkTm: {
    fontSize: 8.5,
    color: Colors.gold,
    fontWeight: "700", fontFamily: fontFamily.bold,
  },
  watermarkLegal: {
    fontSize: 9.5,
    color: Colors.textMuted,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
