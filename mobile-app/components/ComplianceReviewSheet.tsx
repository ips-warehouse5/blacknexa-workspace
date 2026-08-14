/**
 * BlackNexa™ Compliance Review Sheet
 *
 * The Human-in-the-Loop confirmation sheet. Shows the AI-formatted,
 * jurisdiction-compliant report summary, flags any missing fields or
 * formatting issues, and requires explicit user confirmation before the
 * report is dispatched to external agencies.
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileCheck,
  Globe,
  Lock,
  Shield,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import type { ValidationResult, JurisdictionProfile } from "@/constants/geo-legal";
import { PRIVACY_REGIME_LABELS } from "@/constants/geo-legal";

type Props = {
  visible: boolean;
  validation: ValidationResult | null;
  profile: JurisdictionProfile | null;
  onConfirm: () => void;
  onClose: () => void;
  testID?: string;
};

export default function ComplianceReviewSheet({
  visible,
  validation,
  profile,
  onConfirm,
  onClose,
  testID,
}: Props) {
  const [showFullSummary, setShowFullSummary] = useState(false);

  const handleConfirm = () => {
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onConfirm();
  };

  if (!validation) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container} testID={testID}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <FileCheck size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Compliance Review</Text>
            <Text style={styles.headerSub}>
              {profile ? `${profile.countryName} · ${PRIVACY_REGIME_LABELS[validation.privacyRegime]}` : validation.governingJurisdiction}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={Colors.text} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status banner */}
          <View
            style={[
              styles.statusBanner,
              validation.compliant
                ? { borderColor: Colors.emerald + "55", backgroundColor: Colors.emerald + "0D" }
                : { borderColor: Colors.crimson + "55", backgroundColor: Colors.crimson + "0D" },
            ]}
          >
            {validation.compliant ? (
              <Check size={18} color={Colors.emerald} />
            ) : (
              <AlertTriangle size={18} color={Colors.crimson} />
            )}
            <Text
              style={[
                styles.statusText,
                { color: validation.compliant ? Colors.emerald : Colors.crimson },
              ]}
            >
              {validation.compliant
                ? "Report meets jurisdictional requirements"
                : "Some fields need attention"}
            </Text>
          </View>

          {/* Missing fields */}
          {validation.missingFields.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Missing Information</Text>
              {validation.missingFields.map((field, i) => (
                <View key={`mf-${i}`} style={styles.issueRow}>
                  <AlertTriangle size={13} color={Colors.crimson} />
                  <Text style={styles.issueText}>{field}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Formatting issues / disclosures */}
          {validation.formattingIssues.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Compliance Notes</Text>
              {validation.formattingIssues.map((issue, i) => (
                <View key={`fi-${i}`} style={styles.issueRow}>
                  <Shield size={13} color={Colors.gold} />
                  <Text style={styles.issueText}>{issue}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Formatted summary */}
          <View style={styles.section}>
            <Pressable
              onPress={() => setShowFullSummary((v) => !v)}
              style={styles.summaryToggle}
            >
              <Text style={styles.sectionTitle}>Formatted Report Summary</Text>
              <ChevronDown
                size={16}
                color={Colors.textDim}
                style={{ transform: [{ rotate: showFullSummary ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            <View style={styles.summaryBox}>
              <Text
                style={styles.summaryText}
                numberOfLines={showFullSummary ? undefined : 8}
              >
                {validation.formattedSummary}
              </Text>
            </View>
            {!showFullSummary && validation.formattedSummary.length > 200 && (
              <Pressable
                onPress={() => setShowFullSummary(true)}
                style={styles.expandBtn}
              >
                <Text style={styles.expandText}>Show full summary</Text>
              </Pressable>
            )}
          </View>

          {/* Privacy notice */}
          <View style={styles.privacyBox}>
            <Lock size={14} color={Colors.gold} />
            <Text style={styles.privacyText}>
              Your evidence is sealed with AES-256-GCM on your device before
              transmission. The server adds a second encryption layer. PII is
              scrubbed per {PRIVACY_REGIME_LABELS[validation.privacyRegime]}.
            </Text>
          </View>

          {/* Human-in-the-Loop confirmation */}
          <Pressable
            onPress={handleConfirm}
            style={styles.confirmBtn}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.confirmBtnInner}
            >
              <Shield size={18} color={Colors.bg} />
              <Text style={styles.confirmText}>
                {validation.compliant
                  ? "Confirm & Dispatch"
                  : "Confirm Anyway"}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.disclaimer}>
            By confirming, you acknowledge this report is true to the best of
            your knowledge. Dispatch creates an audit trail and provides
            pre-formatted contact links — it does not guarantee action by any
            agency. BlackNexa™ is a trademark pending with the USPTO.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
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
  headerTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textDim, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingVertical: 16, paddingBottom: 50 },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  statusText: { fontSize: 14, fontWeight: "700", flex: 1 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textDim,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 4,
  },
  issueText: { fontSize: 12.5, color: Colors.textDim, flex: 1, lineHeight: 17 },
  summaryToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  summaryText: { fontSize: 12.5, color: Colors.text, lineHeight: 19, fontFamily: undefined },
  expandBtn: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 6,
  },
  expandText: { fontSize: 12, color: Colors.gold, fontWeight: "700" },
  privacyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: Colors.gold + "0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold + "33",
    marginBottom: 20,
  },
  privacyText: { fontSize: 11, color: Colors.textDim, flex: 1, lineHeight: 16 },
  confirmBtn: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  confirmBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  confirmText: { color: Colors.bg, fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  disclaimer: {
    fontSize: 10.5,
    color: Colors.textMute,
    textAlign: "center",
    lineHeight: 15,
    marginTop: 14,
    paddingHorizontal: 8,
  },
});
