import { LinearGradient } from "expo-linear-gradient";
import { Shield, Sparkles, ChevronRight } from "lucide-react-native";
import React, { useCallback } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";

/**
 * Subscription-tier exclusivity banner highlighting the BlackNexa Civil Rights
 * & Discrimination Reporting Tool. Surfaced at the top of the news feed so
 * users discover the premium justice-reporting capability.
 */
export default function CivilRightsPremiumBanner(): React.ReactElement {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push("/report");
  }, []);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
      ]}
    >
      <LinearGradient
        colors={[Colors.surfaceSecondary, Colors.surface3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconWrap}>
          <Shield size={22} color={Colors.gold} />
        </View>
        <View style={styles.content}>
          <View style={styles.badgeRow}>
            <View style={styles.premiumBadge}>
              <Sparkles size={9} color={Colors.background} />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
            <Text style={styles.title}>Civil Rights Reporting Tool</Text>
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>
            Document discrimination, police accountability issues, and civil
            rights violations with encrypted evidence and AI-verified legal routing.
          </Text>
        </View>
        <ChevronRight size={18} color={Colors.gold} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.gold + "33",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.gold + "1F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  content: {
    flex: 1,
    gap: 6,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  premiumText: {
    fontSize: 8,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.background,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    fontWeight: "500", fontFamily: fontFamily.medium,
  },
});
