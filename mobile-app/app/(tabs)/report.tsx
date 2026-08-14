import { router } from "expo-router";
import { ArrowRight, Shield } from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";

export default function ReportTabRedirect(): React.ReactElement {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const t = setTimeout(() => {
      router.push("/report");
    }, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <BrandMark variant="chip" style={styles.brandChip} testID="report-tab-brand" />
      <View style={styles.icon}>
        <Shield size={28} color={Colors.gold} />
      </View>
      <Text style={styles.title}>Opening secure report...</Text>
      <Pressable
        onPress={() => router.push("/report")}
        style={styles.btn}
        testID="manual-report-open"
      >
        <Text style={styles.btnText}>Continue</Text>
        <ArrowRight size={16} color={Colors.bg} strokeWidth={3} />
      </Pressable>
      <BrandMark variant="watermark" testID="report-tab-watermark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  brandChip: { marginBottom: 18 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.gold + "18",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.gold,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
  },
  btnText: { color: Colors.bg, fontWeight: "800", fontSize: 14 },
});
