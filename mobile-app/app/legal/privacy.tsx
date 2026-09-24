import { router } from "expo-router";
import React from "react";
import { Text as RNText, StyleSheet, View } from "react-native";
import { colors, fonts, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { BackHeader, ScrollScreen } from "@/components/ui/Screen";
import BrandMark from "@/components/BrandMark";
import { PRIVACY } from "@/constants/legal";

export default function PrivacyScreen(): React.ReactElement {
  useThemeSync();
  return (
    <ScrollScreen
      padding={screenPadding.detail}
      contentStyle={styles.content}
      testID="privacy-screen"
    >
      <BackHeader title="Privacy Policy" onBack={() => router.back()} padding={0} />
      <BrandMark variant="chip" style={styles.brand} testID="privacy-brand" />
      <Text variant="cardTitle" color={colors.t0} style={styles.title}>{PRIVACY.title}</Text>
      <Text variant="metaSm" color={colors.t3} style={styles.updated}>{PRIVACY.updated}</Text>

      {PRIVACY.sections.map((s) => (
        <View
          key={s.heading}
          style={[
            styles.section,
            { backgroundColor: colors.s3, borderColor: colors.line },
          ]}
        >
          <Text variant="labelLg" color={colors.acc} style={styles.heading}>{s.heading}</Text>
          <Text variant="body" color={colors.t2} style={styles.body}>{renderInline(s.body)}</Text>
        </View>
      ))}

      <Text variant="bodySm" color={colors.t3} center style={styles.footer}>{PRIVACY.footer}</Text>
      <Text variant="metaSm" color={colors.t4} center style={styles.tm}>
        BlackNexa™ is a trademark pending with the USPTO.
      </Text>
    </ScrollScreen>
  );
}

/**
 * Section bodies are plain strings. `**…**` marks bold and `_…_` italic — the
 * two emphases the client's §12 copy uses. Nested `RNText` inherits the
 * parent's size, colour and line height; only the family changes, because
 * Android does not synthesise weights or italics for custom fonts.
 */
function renderInline(body: string): React.ReactNode[] {
  return body.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <RNText key={i} style={styles.bold}>{part.slice(2, -2)}</RNText>;
    }
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return <RNText key={i} style={styles.italic}>{part.slice(1, -1)}</RNText>;
    }
    return part;
  });
}

const styles = StyleSheet.create({
  content: { paddingBottom: 60 },
  brand: { marginTop: 8, marginBottom: 14 },
  title: {
    marginBottom: 4,
  },
  updated: {
    marginBottom: 18,
  },
  section: {
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  heading: { marginBottom: 6 },
  body: { lineHeight: 20 },
  bold: { fontFamily: fonts.bodySemi },
  italic: { fontFamily: fonts.bodyItalic },
  footer: {
    marginTop: 18,
  },
  tm: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
