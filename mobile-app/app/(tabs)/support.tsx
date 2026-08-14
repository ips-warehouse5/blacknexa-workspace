import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Mic,
  Phone,
  ShieldAlert,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import {
  EMERGENCY_PROTOCOLS,
  KNOW_YOUR_RIGHTS,
  MOCK_RESOURCES,
  PROTEST_SAFETY,
  RESOURCE_CATEGORIES,
  STATE_RECORDING_LAWS,
  type EmergencyProtocol,
  type Resource,
  type ResourceCategory,
  type RightsTip,
} from "@/mocks/resources";
import { ENGINE_INFO, GLOBAL_RESOURCE_REGIONS } from "@/constants/geo-legal";

export default function SupportScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<ResourceCategory | "all">("all");
  const [openTip, setOpenTip] = useState<string | null>(null);
  const [openProtocol, setOpenProtocol] = useState<string | null>("ep1");

  const filtered = useMemo<Resource[]>(
    () =>
      active === "all"
        ? MOCK_RESOURCES
        : MOCK_RESOURCES.filter((r) => r.category === active),
    [active]
  );

  const openContact = (contact: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    if (contact.startsWith("Text")) return;
    if (/^1?[-\s]?\d{3}/.test(contact) && !contact.includes(".")) {
      const tel = contact.replace(/[^\d]/g, "");
      Linking.openURL(`tel:${tel}`).catch(() => {});
      return;
    }
    const url = contact.startsWith("http") ? contact : `https://${contact}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <FlatList
      data={filtered}
      keyExtractor={(r) => r.id}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 120 + insets.bottom },
      ]}
      ListHeaderComponent={
        <View>
          <BrandMark variant="chip" style={styles.brandChip} testID="support-brand" />
          <Text style={styles.kicker}>TRUSTED NETWORK · U.S.</Text>
          <Text style={styles.title}>Support & Resources</Text>
          <Text style={styles.subtitle}>
            Verified legal aid, mental health, immigration, voting, and
            community organizations centered on Black and brown lives.
          </Text>

          <View style={styles.emergencyBanner}>
            <View style={styles.emergencyIconWrap}>
              <ShieldAlert size={18} color={Colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyTitle}>
                Emergency? Call 911 first if life is in danger.
              </Text>
              <Text style={styles.emergencySub}>
                For police misconduct support: BlackLine 1-800-604-5841
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              router.push("/legal/lookup");
            }}
            style={styles.geoLegalBanner}
            testID="geo-legal-link"
          >
            <View style={styles.geoLegalIconWrap}>
              <Globe size={16} color={Colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.geoLegalTitle}>
                International Geo-Legal Resources
              </Text>
              <Text style={styles.geoLegalSub}>
                Legal frameworks, oversight agencies & press contacts for your country
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={Colors.gold}
              style={{ transform: [{ rotate: "-90deg" }] }}
            />
          </Pressable>

          <Text style={styles.sectionLabel}>BROWSE BY CATEGORY</Text>
          <View style={styles.categoryGrid}>
            <CategoryTile
              label="All Resources"
              count={MOCK_RESOURCES.length}
              active={active === "all"}
              onPress={() => setActive("all")}
              tint={Colors.gold}
            />
            {RESOURCE_CATEGORIES.map((cat) => {
              const count = MOCK_RESOURCES.filter(
                (r) => r.category === cat.id
              ).length;
              const Icon = cat.icon;
              return (
                <CategoryTile
                  key={cat.id}
                  label={cat.label}
                  count={count}
                  active={active === cat.id}
                  onPress={() => setActive(cat.id)}
                  tint={Colors.gold}
                  icon={
                    <Icon
                      size={18}
                      color={active === cat.id ? Colors.bg : Colors.gold}
                    />
                  }
                />
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>
            {active === "all"
              ? "All Organizations"
              : RESOURCE_CATEGORIES.find((c) => c.id === active)?.label}
          </Text>
        </View>
      }
      ListFooterComponent={
        <View>
          <View style={styles.divider} />

          <View style={styles.kyrHeader}>
            <AlertTriangle size={16} color={Colors.crimson} />
            <Text style={styles.kyrTitle}>Emergency Protocols</Text>
          </View>
          <View style={styles.kyrCard}>
            {EMERGENCY_PROTOCOLS.map((p: EmergencyProtocol, idx) => {
              const open = openProtocol === p.id;
              return (
                <View key={p.id}>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== "web")
                        Haptics.selectionAsync().catch(() => {});
                      setOpenProtocol(open ? null : p.id);
                    }}
                    style={styles.kyrRow}
                    testID={`protocol-${p.id}`}
                  >
                    <View style={styles.protoTitleRow}>
                      <View
                        style={[
                          styles.severityDot,
                          {
                            backgroundColor:
                              p.severity === "high"
                                ? Colors.crimson
                                : Colors.gold,
                          },
                        ]}
                      />
                      <Text style={styles.kyrRowTitle}>{p.title}</Text>
                    </View>
                    {open ? (
                      <ChevronUp size={16} color={Colors.textDim} />
                    ) : (
                      <ChevronDown size={16} color={Colors.textDim} />
                    )}
                  </Pressable>
                  {open && (
                    <View style={styles.stepsWrap}>
                      {p.steps.map((s, i) => (
                        <View key={`${p.id}-${i}`} style={styles.stepRow}>
                          <View style={styles.stepNum}>
                            <Text style={styles.stepNumText}>{i + 1}</Text>
                          </View>
                          <Text style={styles.stepText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {idx < EMERGENCY_PROTOCOLS.length - 1 && (
                    <View style={styles.kyrDivider} />
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.kyrHeader}>
            <BookOpen size={16} color={Colors.gold} />
            <Text style={styles.kyrTitle}>Know Your Rights</Text>
          </View>
          <View style={styles.kyrCard}>
            {KNOW_YOUR_RIGHTS.map((tip: RightsTip, idx) => {
              const open = openTip === tip.id;
              return (
                <View key={tip.id}>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== "web")
                        Haptics.selectionAsync().catch(() => {});
                      setOpenTip(open ? null : tip.id);
                    }}
                    style={styles.kyrRow}
                    testID={`kyr-${tip.id}`}
                  >
                    <Text style={styles.kyrRowTitle}>{tip.title}</Text>
                    {open ? (
                      <ChevronUp size={16} color={Colors.textDim} />
                    ) : (
                      <ChevronDown size={16} color={Colors.textDim} />
                    )}
                  </Pressable>
                  {open && <Text style={styles.kyrBody}>{tip.body}</Text>}
                  {idx < KNOW_YOUR_RIGHTS.length - 1 && (
                    <View style={styles.kyrDivider} />
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.kyrHeader}>
            <Mic size={16} color={Colors.violet} />
            <Text style={styles.kyrTitle}>State Recording Laws</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lawsScroll}
          >
            {STATE_RECORDING_LAWS.map((law) => (
              <View key={law.state} style={styles.lawCard}>
                <Text style={styles.lawState}>{law.state}</Text>
                <View
                  style={[
                    styles.lawPill,
                    {
                      backgroundColor:
                        law.type === "one-party"
                          ? Colors.emerald + "22"
                          : Colors.gold + "22",
                      borderColor:
                        law.type === "one-party"
                          ? Colors.emerald
                          : Colors.gold,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.lawPillText,
                      {
                        color:
                          law.type === "one-party"
                            ? Colors.emerald
                            : Colors.gold,
                      },
                    ]}
                  >
                    {law.type === "one-party" ? "ONE-PARTY" : "ALL-PARTY"}
                  </Text>
                </View>
                <Text style={styles.lawNote}>{law.note}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.kyrHeader}>
            <CheckCircle2 size={16} color={Colors.emerald} />
            <Text style={styles.kyrTitle}>Protest Safety Checklist</Text>
          </View>
          <View style={styles.checklistCard}>
            {PROTEST_SAFETY.map((item) => (
              <View key={item.id} style={styles.checkRow}>
                <View style={styles.checkBox}>
                  <CheckCircle2 size={14} color={Colors.emerald} />
                </View>
                <Text style={styles.checkText}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.engineCard} testID="engine-footer">
            <Text style={styles.engineTitle}>
              {ENGINE_INFO.platformName} Platform Integrity
            </Text>
            <Text style={styles.engineMission}>
              “{ENGINE_INFO.coreMission}”
            </Text>
            <View style={styles.engineMetaRow}>
              <Text style={styles.engineMeta}>
                Engine v{ENGINE_INFO.version}
              </Text>
              <Text style={styles.engineMetaDot}>·</Text>
              <Text style={styles.engineMeta}>
                {GLOBAL_RESOURCE_REGIONS.length} global regions
              </Text>
              <Text style={styles.engineMetaDot}>·</Text>
              <Text style={styles.engineMeta}>
                {ENGINE_INFO.supportedOs.join(" & ")}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                Linking.openURL(`mailto:${ENGINE_INFO.contactSupport}`).catch(
                  () => {}
                )
              }
              testID="engine-contact"
            >
              <Text style={styles.engineContact}>
                {ENGINE_INFO.contactSupport}
              </Text>
            </Pressable>
          </View>

          <BrandMark variant="watermark" testID="support-watermark" />
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => openContact(item.contact)}
          style={styles.resourceCard}
          testID={`resource-${item.id}`}
        >
          <View style={styles.resourceHeader}>
            <Text style={styles.resourceName}>{item.name}</Text>
            {item.verified && <BadgeCheck size={16} color={Colors.emerald} />}
          </View>
          <Text style={styles.resourceDesc}>{item.description}</Text>
          <View style={styles.resourceFooter}>
            <View style={styles.reachPill}>
              <Text style={styles.reachText}>{item.reach}</Text>
            </View>
            <View style={styles.contactRow}>
              {/^1?[-\s]?\d{3}/.test(item.contact) && !item.contact.includes(".") ? (
                <Phone size={13} color={Colors.gold} />
              ) : (
                <ExternalLink size={13} color={Colors.gold} />
              )}
              <Text style={styles.contactText}>{item.contact}</Text>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

function CategoryTile({
  label,
  count,
  active,
  onPress,
  tint,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  tint: string;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.catTile,
        active && { backgroundColor: tint, borderColor: tint },
      ]}
      testID={`cat-${label}`}
    >
      {icon && <View style={styles.catIconWrap}>{icon}</View>}
      <Text
        style={[
          styles.catLabel,
          active && { color: Colors.bg, fontWeight: "800" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[styles.catCount, active && { color: Colors.bg + "CC" }]}
      >
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, backgroundColor: Colors.bg },
  brandChip: { marginBottom: 12 },
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textDim,
    lineHeight: 20,
    marginBottom: 18,
    maxWidth: 340,
  },
  emergencyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.crimson + "1A",
    borderColor: Colors.crimson + "55",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 22,
  },
  emergencyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.crimson,
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 2,
  },
  emergencySub: { fontSize: 11.5, color: Colors.textDim, fontWeight: "600" },
  geoLegalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.gold + "0D",
    borderColor: Colors.gold + "33",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 22,
  },
  geoLegalIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  geoLegalTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 2,
  },
  geoLegalSub: { fontSize: 11, color: Colors.textDim, fontWeight: "500" },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    color: Colors.textMute,
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  catTile: {
    width: "48.5%",
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  catIconWrap: { marginBottom: 10 },
  catLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 2,
  },
  catCount: { fontSize: 12, color: Colors.textDim, fontWeight: "600" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  resourceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  resourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  resourceName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
  },
  resourceDesc: {
    fontSize: 13,
    color: Colors.textDim,
    lineHeight: 19,
    marginBottom: 12,
  },
  resourceFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reachPill: {
    backgroundColor: Colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  reachText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: Colors.textDim,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  contactText: { fontSize: 12, color: Colors.gold, fontWeight: "700" },
  kyrHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  kyrTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  kyrCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 22,
  },
  kyrRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  kyrRowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
    paddingRight: 12,
  },
  kyrBody: {
    fontSize: 13,
    color: Colors.textDim,
    lineHeight: 19,
    paddingBottom: 14,
  },
  kyrDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  protoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  stepsWrap: { paddingBottom: 12, gap: 10 },
  stepRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumText: { fontSize: 11, fontWeight: "800", color: Colors.gold },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textDim,
    lineHeight: 19,
  },
  lawsScroll: { gap: 10, paddingBottom: 6, paddingRight: 12, marginBottom: 16 },
  lawCard: {
    width: 220,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: 8,
  },
  lawState: { fontSize: 15, fontWeight: "800", color: Colors.text },
  lawPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  lawPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  lawNote: { fontSize: 12, color: Colors.textDim, lineHeight: 17 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 24,
  },
  checklistCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 22,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: Colors.emerald + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: "600" },
  engineCard: {
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "33",
    padding: 18,
    marginBottom: 18,
  },
  engineTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  engineMission: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    fontStyle: "italic",
    textAlign: "center",
  },
  engineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  engineMeta: { fontSize: 11, color: Colors.textDim, fontWeight: "600" },
  engineMetaDot: { fontSize: 11, color: Colors.textMute },
  engineContact: {
    fontSize: 12,
    color: Colors.gold,
    fontWeight: "700",
    marginTop: 2,
  },
});
