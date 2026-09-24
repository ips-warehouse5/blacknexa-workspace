import { router } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { BackHeader, ScrollScreen } from "@/components/ui/Screen";
import BrandMark from "@/components/BrandMark";
import { TERMS } from "@/constants/legal";

export default function TermsScreen(): React.ReactElement {
  useThemeSync();
  return (
    <ScrollScreen
      padding={screenPadding.detail}
      contentStyle={styles.content}
      testID="terms-screen"
    >
      <BackHeader title="Terms of Service" onBack={() => router.back()} padding={0} />
      <BrandMark variant="chip" style={styles.brand} testID="terms-brand" />
      <Text variant="cardTitle" color={colors.t0} style={styles.title}>{TERMS.title}</Text>
      <Text variant="metaSm" color={colors.t3} style={styles.updated}>{TERMS.updated}</Text>

      {TERMS.sections.map((s) => (
        <View
          key={s.heading}
          style={[
            styles.section,
            { backgroundColor: colors.s3, borderColor: colors.line },
          ]}
        >
          <Text variant="labelLg" color={colors.acc} style={styles.heading}>{s.heading}</Text>
          <Text variant="body" color={colors.t2} style={styles.body}>{s.body}</Text>
        </View>
      ))}

      <Text variant="bodySm" color={colors.t3} center style={styles.footer}>{TERMS.footer}</Text>
      <Text variant="metaSm" color={colors.t4} center style={styles.tm}>
        © {new Date().getFullYear()} News Moves Markets Forex LLC. All Rights Reserved. BlackNexa™ is a trademark of News Moves Markets Forex LLC.
      </Text>
    </ScrollScreen>
  );
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
  footer: {
    marginTop: 18,
  },
  tm: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
