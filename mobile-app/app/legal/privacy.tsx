import { Stack } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import BrandMark from "@/components/BrandMark";
import { PRIVACY } from "@/constants/legal";

export default function PrivacyScreen(): React.ReactElement {
  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        testID="privacy-screen"
      >
        <BrandMark variant="chip" style={styles.brand} testID="privacy-brand" />
        <Text variant="cardTitle" color={colors.t0} style={styles.title}>{PRIVACY.title}</Text>
        <Text variant="metaSm" color={colors.t3} style={styles.updated}>{PRIVACY.updated}</Text>

        {PRIVACY.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text variant="labelLg" color={colors.acc} style={styles.heading}>{s.heading}</Text>
            <Text variant="body" color={colors.t2} style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <Text variant="bodySm" color={colors.t3} center style={styles.footer}>{PRIVACY.footer}</Text>
        <Text variant="metaSm" color={colors.t4} center style={styles.tm}>
          BlackNexa™ is a trademark pending with the USPTO. © {new Date().getFullYear()} BlackNexa.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 60 },
  brand: { marginBottom: 14 },
  title: {
    marginBottom: 4,
  },
  updated: {
    marginBottom: 18,
  },
  section: {
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
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
