import { Stack } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import { PRIVACY } from "@/constants/legal";

export default function PrivacyScreen(): React.ReactElement {
  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        contentContainerStyle={styles.content}
        testID="privacy-screen"
      >
        <BrandMark variant="chip" style={styles.brand} testID="privacy-brand" />
        <Text style={styles.title}>{PRIVACY.title}</Text>
        <Text style={styles.updated}>{PRIVACY.updated}</Text>

        {PRIVACY.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <Text style={styles.footer}>{PRIVACY.footer}</Text>
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
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  updated: {
    fontSize: 12,
    color: Colors.textMute,
    fontWeight: "600",
    marginBottom: 18,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  heading: { fontSize: 14, fontWeight: "800", color: Colors.gold, marginBottom: 6 },
  body: { fontSize: 13.5, color: Colors.textDim, lineHeight: 20 },
  footer: {
    fontSize: 12,
    color: Colors.textDim,
    textAlign: "center",
    marginTop: 18,
    fontWeight: "600",
  },
  tm: {
    fontSize: 10,
    color: Colors.textMute,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
