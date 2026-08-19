/**
 * BlackNexa™ Legal Resource Card
 *
 * Displays a jurisdiction profile — legal frameworks, oversight agencies,
 * and press contacts — in a clean, professional layout. All fields render
 * in the user's selected language (the backend translates them).
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import {
  Building2,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  Newspaper,
  Phone,
  Shield,
  Sparkles,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";
import {
  AGENCY_TIER_LABELS,
  PRIVACY_REGIME_LABELS,
  PRESS_TYPE_LABELS,
  type JurisdictionProfile,
} from "@/constants/geo-legal";

type Props = {
  profile: JurisdictionProfile;
  testID?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  policing: "Policing",
  profiling: "Profiling",
  housing: "Housing",
  workplace: "Workplace",
  education: "Education",
  medical: "Medical",
  harassment: "Harassment",
};

export default function LegalResourceCard({ profile, testID }: Props) {
  const openUrl = React.useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <View testID={testID} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Globe size={20} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.countryName}>{profile.countryName}</Text>
          <Text style={styles.countryCode}>
            {profile.countryCode} · {PRIVACY_REGIME_LABELS[profile.privacyRegime]}
          </Text>
        </View>
        {profile.source === "ai-generated" && (
          <View style={styles.aiBadge}>
            <Sparkles size={11} color={Colors.gold} />
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Legal Frameworks */}
        {profile.legalFrameworks.length > 0 && (
          <Section
            icon={<FileText size={15} color={Colors.gold} />}
            title="Legal Frameworks"
          >
            {profile.legalFrameworks.map((fw, i) => (
              <View key={`fw-${i}`} style={styles.itemCard}>
                <Text style={styles.itemName}>{fw.name}</Text>
                <Text style={styles.itemCitation}>{fw.citation}</Text>
                <Text style={styles.itemSummary}>{fw.summary}</Text>
                {fw.url && (
                  <Pressable
                    onPress={() => openUrl(fw.url!)}
                    style={styles.linkRow}
                  >
                    <ExternalLink size={12} color={Colors.gold} />
                    <Text style={styles.linkText}>View statute</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </Section>
        )}

        {/* Oversight Agencies */}
        {profile.agencies.length > 0 && (
          <Section
            icon={<Shield size={15} color={Colors.gold} />}
            title="Oversight Agencies"
          >
            {profile.agencies.map((agency, i) => (
              <View key={`ag-${i}`} style={styles.itemCard}>
                <View style={styles.itemHeaderRow}>
                  <Building2 size={14} color={Colors.textSecondary} />
                  <Text style={styles.itemName}>{agency.name}</Text>
                </View>
                <Text style={styles.tierLabel}>
                  {AGENCY_TIER_LABELS[agency.tier]}
                </Text>
                <Text style={styles.itemSummary}>{agency.description}</Text>
                {agency.intakeEmail && (
                  <Pressable
                    onPress={() => openUrl(`mailto:${agency.intakeEmail}`)}
                    style={styles.linkRow}
                  >
                    <Mail size={12} color={Colors.gold} />
                    <Text style={styles.linkText}>{agency.intakeEmail}</Text>
                  </Pressable>
                )}
                {agency.phone && (
                  <Pressable
                    onPress={() => openUrl(`tel:${agency.phone}`)}
                    style={styles.linkRow}
                  >
                    <Phone size={12} color={Colors.gold} />
                    <Text style={styles.linkText}>{agency.phone}</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => openUrl(agency.portalUrl)}
                  style={styles.linkRow}
                >
                  <ExternalLink size={12} color={Colors.gold} />
                  <Text style={styles.linkText}>Open portal</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        )}

        {/* Press Contacts */}
        {profile.pressContacts.length > 0 && (
          <Section
            icon={<Newspaper size={15} color={Colors.gold} />}
            title="Press & Media Contacts"
          >
            {profile.pressContacts.map((press, i) => (
              <View key={`pr-${i}`} style={styles.itemCard}>
                <View style={styles.itemHeaderRow}>
                  <Newspaper size={14} color={Colors.textSecondary} />
                  <Text style={styles.itemName}>{press.name}</Text>
                </View>
                <Text style={styles.tierLabel}>
                  {PRESS_TYPE_LABELS[press.type]}
                </Text>
                <Text style={styles.itemSummary}>{press.description}</Text>
                {press.intakeEmail && (
                  <Pressable
                    onPress={() => openUrl(`mailto:${press.intakeEmail}`)}
                    style={styles.linkRow}
                  >
                    <Mail size={12} color={Colors.gold} />
                    <Text style={styles.linkText}>{press.intakeEmail}</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => openUrl(press.portalUrl)}
                  style={styles.linkRow}
                >
                  <ExternalLink size={12} color={Colors.gold} />
                  <Text style={styles.linkText}>Open outlet</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        )}

        {/* Trademark footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            BlackNexa™ — Geo-Legal Engine. Trademark pending with the USPTO.
            Resources are provided for informational purposes and do not
            constitute legal advice.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  countryName: {
    fontSize: 17,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
  },
  countryCode: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.gold + "18",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingVertical: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    flex: 1,
  },
  itemCitation: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    marginBottom: 6,
  },
  tierLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "700", fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  itemSummary: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 12,
    color: Colors.gold,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
  footer: {
    marginTop: 8,
    padding: 14,
    backgroundColor: Colors.gold + "0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold + "33",
  },
  footerText: {
    fontSize: 10.5,
    color: Colors.textMuted,
    lineHeight: 15,
    textAlign: "center",
  },
});
