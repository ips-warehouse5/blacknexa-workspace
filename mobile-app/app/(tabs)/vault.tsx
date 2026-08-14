import { router } from "expo-router";
import {
  FileText,
  Image as ImageIcon,
  Lock,
  MapPin,
  Plus,
  ShieldCheck,
} from "lucide-react-native";
import React, { useMemo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import PrivacyBadge from "@/components/PrivacyBadge";
import BrandMark from "@/components/BrandMark";
import { formatRelative } from "@/mocks/incidents";
import { useIncidents } from "@/providers/IncidentsProvider";

export default function VaultScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { myIncidents } = useIncidents();

  const stats = useMemo(
    () => ({
      total: myIncidents.length,
      evidence: myIncidents.reduce((s, i) => s + i.evidenceCount, 0),
      privateCount: myIncidents.filter((i) => i.privacy === "private").length,
    }),
    [myIncidents]
  );

  return (
    <FlatList
      data={myIncidents}
      keyExtractor={(i) => i.id}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 120 + insets.bottom },
      ]}
      ListHeaderComponent={
        <View>
          <BrandMark variant="chip" style={styles.brandChip} testID="vault-brand" />
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.kicker}>ENCRYPTED</Text>
              <Text style={styles.title}>Private Vault</Text>
              <Text style={styles.subtitle}>
                Your evidence, timestamps, and personal records. End-to-end
                encrypted.
              </Text>
            </View>
            <View style={styles.lockIcon}>
              <Lock size={18} color={Colors.gold} />
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatCard
              label="Records"
              value={stats.total.toString()}
              accent={Colors.gold}
            />
            <StatCard
              label="Evidence"
              value={stats.evidence.toString()}
              accent={Colors.emerald}
            />
            <StatCard
              label="Private"
              value={stats.privateCount.toString()}
              accent={Colors.violet}
            />
          </View>

          <View style={styles.sealCard}>
            <ShieldCheck size={22} color={Colors.emerald} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sealTitle}>
                Vault integrity verified
              </Text>
              <Text style={styles.sealText}>
                All records cryptographically sealed. Metadata preserved for
                legal chain-of-custody.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Your Records</Text>
        </View>
      }
      ListFooterComponent={<BrandMark variant="watermark" testID="vault-watermark" />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/incident/${item.id}`)}
          style={styles.record}
          testID={`vault-record-${item.id}`}
        >
          <View style={styles.recordHeader}>
            <PrivacyBadge level={item.privacy} compact />
            <Text style={styles.recordTime}>
              {formatRelative(item.timestamp)}
            </Text>
          </View>
          <Text style={styles.recordTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.recordMeta}>
            <View style={styles.metaPill}>
              <MapPin size={11} color={Colors.textDim} />
              <Text style={styles.metaText}>{item.area}</Text>
            </View>
            {item.hasEvidence && (
              <View style={styles.metaPill}>
                <ImageIcon size={11} color={Colors.gold} />
                <Text style={[styles.metaText, { color: Colors.gold }]}>
                  {item.evidenceCount} files
                </Text>
              </View>
            )}
            <View style={styles.metaPill}>
              <FileText size={11} color={Colors.textDim} />
              <Text style={styles.metaText}>Sealed</Text>
            </View>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Lock size={28} color={Colors.gold} />
          </View>
          <Text style={styles.emptyTitle}>Your vault is empty</Text>
          <Text style={styles.emptyText}>
            Start by documenting an incident. Only you can see what you mark as
            private.
          </Text>
          <Pressable
            onPress={() => router.push("/report")}
            style={styles.emptyBtn}
            testID="vault-empty-cta"
          >
            <Plus size={16} color={Colors.bg} strokeWidth={3} />
            <Text style={styles.emptyBtnText}>New Record</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, backgroundColor: Colors.bg },
  brandChip: { marginBottom: 12 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textDim,
    lineHeight: 20,
    maxWidth: 280,
  },
  lockIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gold + "18",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textDim,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  sealCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.emerald + "12",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.emerald + "40",
    marginBottom: 22,
  },
  sealTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.emerald,
    marginBottom: 3,
  },
  sealText: { fontSize: 12, color: Colors.textDim, lineHeight: 17 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  record: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  recordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recordTime: { fontSize: 11, color: Colors.textMute, fontWeight: "500" },
  recordTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 10,
  },
  recordMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metaText: { fontSize: 11, color: Colors.textDim, fontWeight: "600" },
  empty: { alignItems: "center", paddingTop: 20, paddingHorizontal: 20 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.gold + "16",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textDim,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 18,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.gold,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyBtnText: { color: Colors.bg, fontWeight: "800", fontSize: 14 },
});
