import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bell, Plus, Search, Shield } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import IncidentCard from "@/components/IncidentCard";
import BrandMark from "@/components/BrandMark";
import { CATEGORY_LABELS, type IncidentCategory } from "@/mocks/incidents";
import { useIncidents } from "@/providers/IncidentsProvider";

type FilterKey = "all" | IncidentCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  ...(Object.keys(CATEGORY_LABELS) as IncidentCategory[]).map((k) => ({
    key: k,
    label: CATEGORY_LABELS[k],
  })),
];

export default function FeedScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { incidents, toggleSupport, isSupported } = useIncidents();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState<string>("");

  const publicIncidents = useMemo(
    () =>
      incidents.filter(
        (i) => i.privacy === "public" || i.privacy === "trusted"
      ),
    [incidents]
  );

  const filtered = useMemo(() => {
    let list = publicIncidents;
    if (filter !== "all") list = list.filter((i) => i.category === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q) ||
          i.area.toLowerCase().includes(q)
      );
    }
    return list;
  }, [publicIncidents, filter, query]);

  const openReport = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push("/report");
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.surface, Colors.bg]}
        style={[styles.headerBg, { paddingTop: insets.top }]}
      >
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Shield size={16} color={Colors.bg} fill={Colors.gold} />
            </View>
            <View>
              <View style={styles.brandLine}>
                <Text style={styles.brand}>BlackNexa</Text>
                <Text style={styles.tm} testID="brand-tm">TM</Text>
              </View>
              <Text style={styles.brandSub}>Community · Evidence · Trust</Text>
            </View>
          </View>
          <Pressable
            style={styles.iconBtn}
            testID="header-notifications"
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync().catch(() => {});
              }
              Alert.alert(
                "Notifications",
                "You're all caught up. New supporters and verifications will appear here.",
                [{ text: "OK" }]
              );
            }}
          >
            <Bell size={18} color={Colors.text} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textMute} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search incidents, areas, categories"
            placeholderTextColor={Colors.textMute}
            style={styles.searchInput}
            testID="search-input"
          />
        </View>
      </LinearGradient>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 120 + insets.bottom },
        ]}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        ListHeaderComponent={
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setFilter(item.key)}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                    testID={`filter-${item.key}`}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        active && styles.filterTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Community Feed</Text>
              <Text style={styles.sectionCount}>
                {filtered.length} {filtered.length === 1 ? "story" : "stories"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <IncidentCard
            incident={item}
            supported={isSupported(item.id)}
            onToggleSupport={toggleSupport}
          />
        )}
        ListFooterComponent={
          filtered.length > 0 ? (
            <BrandMark variant="watermark" testID="feed-watermark" />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No stories match</Text>
            <Text style={styles.emptyText}>
              Try a different category or clear your search.
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={openReport}
        style={[styles.fab, { bottom: 100 + insets.bottom }]}
        testID="fab-report"
      >
        <LinearGradient
          colors={[Colors.gold, Colors.goldDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Plus size={22} color={Colors.bg} strokeWidth={3} />
          <Text style={styles.fabText}>Report</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  headerBg: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    marginBottom: 14,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  brandLine: { flexDirection: "row", alignItems: "flex-start", gap: 3 },
  brand: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  tm: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  brandSub: {
    fontSize: 11,
    color: Colors.textDim,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gold,
    borderWidth: 2,
    borderColor: Colors.surface2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface2,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  filterRow: { gap: 8, paddingVertical: 12, paddingRight: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  filterText: {
    fontSize: 13,
    color: Colors.textDim,
    fontWeight: "600",
  },
  filterTextActive: { color: Colors.bg, fontWeight: "700" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  sectionCount: {
    fontSize: 12,
    color: Colors.textDim,
    fontWeight: "600",
  },
  empty: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textDim,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  fab: {
    position: "absolute",
    right: 18,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  fabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
  },
  fabText: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.bg,
    letterSpacing: 0.3,
  },
});
