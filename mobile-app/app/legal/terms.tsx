import { Stack } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import { TERMS } from "@/constants/legal";
import { fontFamily } from "@/constants/theme";

export default function TermsScreen(): React.ReactElement {
  return (
    <>
      <Stack.Screen options={{ title: "Terms of Service" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={styles.content}
        testID="terms-screen"
      >
        <BrandMark variant="chip" style={styles.brand} testID="terms-brand" />
        <Text style={styles.title}>{TERMS.title}</Text>
        <Text style={styles.updated}>{TERMS.updated}</Text>

        {TERMS.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <Text style={styles.footer}>{TERMS.footer}</Text>
        <Text style={styles.tm}>
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
    fontSize: 22,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  updated: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    marginBottom: 18,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  heading: { fontSize: 14, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.gold, marginBottom: 6 },
  body: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20 },
  footer: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 18,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
  tm: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
