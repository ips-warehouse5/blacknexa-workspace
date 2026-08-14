import { Eye, Lock, Users } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { PrivacyLevel } from "@/mocks/incidents";

type Props = { level: PrivacyLevel; compact?: boolean };

export default function PrivacyBadge({ level, compact }: Props) {
  const config = {
    private: { label: "Private", color: Colors.violet, Icon: Lock },
    trusted: { label: "Trusted", color: Colors.sky, Icon: Users },
    public: { label: "Public", color: Colors.emerald, Icon: Eye },
  }[level];

  const { Icon, color, label } = config;
  return (
    <View
      style={[
        styles.badge,
        { borderColor: color + "55", backgroundColor: color + "14" },
        compact && styles.compact,
      ]}
    >
      <Icon size={compact ? 11 : 12} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  compact: { paddingHorizontal: 7, paddingVertical: 2.5 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
