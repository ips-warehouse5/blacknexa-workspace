import { router } from "expo-router";
import {
  BadgeCheck,
  FileCheck2,
  Flame,
  Heart,
  MapPin,
} from "lucide-react-native";
import React, { memo, useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  CATEGORY_LABELS,
  formatRelative,
  type Incident,
} from "@/mocks/incidents";
import PrivacyBadge from "./PrivacyBadge";

type Props = {
  incident: Incident;
  supported: boolean;
  onToggleSupport: (id: string) => void;
};

function IncidentCardBase({ incident, supported, onToggleSupport }: Props) {
  const open = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push(`/incident/${incident.id}`);
  }, [incident.id]);

  const support = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onToggleSupport(incident.id);
  }, [incident.id, onToggleSupport]);

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.card,
        pressed && { transform: [{ scale: 0.995 }], opacity: 0.95 },
      ]}
      testID={`incident-card-${incident.id}`}
    >
      <View style={styles.headerRow}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>
            {CATEGORY_LABELS[incident.category]}
          </Text>
        </View>
        <PrivacyBadge level={incident.privacy} compact />
        {incident.urgent && (
          <View style={styles.urgentPill}>
            <Flame size={11} color={Colors.crimson} />
            <Text style={styles.urgentText}>Urgent</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={styles.time}>{formatRelative(incident.timestamp)}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {incident.title}
      </Text>
      <Text style={styles.summary} numberOfLines={3}>
        {incident.summary}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <MapPin size={13} color={Colors.textDim} />
          <Text style={styles.metaText}>{incident.area}</Text>
        </View>
        <View style={styles.dot} />
        <Text style={styles.metaText}>
          {incident.author.anonymous ? "Anonymous" : incident.author.handle}
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={support}
          style={[
            styles.actionBtn,
            supported && { backgroundColor: Colors.crimson + "1A" },
          ]}
          testID={`support-${incident.id}`}
        >
          <Heart
            size={15}
            color={supported ? Colors.crimson : Colors.textDim}
            fill={supported ? Colors.crimson : "transparent"}
          />
          <Text
            style={[
              styles.actionText,
              supported && { color: Colors.crimson },
            ]}
          >
            {incident.supporters}
          </Text>
        </Pressable>

        {incident.hasEvidence && (
          <View style={styles.actionBtn}>
            <FileCheck2 size={15} color={Colors.gold} />
            <Text style={[styles.actionText, { color: Colors.gold }]}>
              {incident.evidenceCount} evidence
            </Text>
          </View>
        )}

        {incident.verifications > 0 && (
          <View style={styles.actionBtn}>
            <BadgeCheck size={15} color={Colors.emerald} />
            <Text style={[styles.actionText, { color: Colors.emerald }]}>
              {incident.verifications} verified
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const IncidentCard = memo(IncidentCardBase);
export default IncidentCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  categoryPill: {
    backgroundColor: Colors.surface3,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.gold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  urgentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    backgroundColor: Colors.crimson + "18",
    borderWidth: 1,
    borderColor: Colors.crimson + "55",
  },
  urgentText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.crimson,
  },
  time: {
    fontSize: 11,
    color: Colors.textMute,
    fontWeight: "500",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    lineHeight: 23,
    marginBottom: 6,
  },
  summary: {
    fontSize: 14,
    color: Colors.textDim,
    lineHeight: 20,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textDim,
    fontWeight: "500",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMute,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textDim,
  },
});
