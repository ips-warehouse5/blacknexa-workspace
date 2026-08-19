import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";
import {
  type ComplianceResult,
  CONSENT_TYPE_LABELS,
} from "@/constants/compliance";

type Props = {
  result: ComplianceResult;
  testID?: string;
};

const STATUS_META: Record<
  ComplianceResult["status"],
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  APPROVED: { icon: CheckCircle2, color: Colors.success, label: "Compliance Verified" },
  PENDING_LEGAL_REVIEW: { icon: AlertTriangle, color: Colors.gold, label: "Pending Legal Review" },
  REJECTED: { icon: AlertTriangle, color: Colors.error, label: "Compliance Rejected" },
};

export default function ComplianceCard({ result, testID }: Props) {
  const meta = STATUS_META[result.status];
  const Icon = meta.icon;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View
          style={[
            styles.headerIcon,
            { backgroundColor: meta.color + "1A", borderColor: meta.color + "44" },
          ]}
        >
          <Icon size={15} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Jurisdictional Compliance</Text>
          <Text style={styles.subtitle}>
            BlackNexa™ verifies recording consent laws before storing media.
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: meta.color + "26" }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.jurisdictionBadge}>
          <Text style={styles.jurisdictionText}>{result.governingJurisdiction}</Text>
        </View>
      </View>

      <Text style={styles.summary}>{result.summary}</Text>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Required consent</Text>
        <Text style={styles.detailValue}>
          {CONSENT_TYPE_LABELS[result.requiredConsentType]}
        </Text>
      </View>

      {result.reasons.length > 0 && (
        <View style={styles.reasonsContainer}>
          {result.reasons.map((reason, i) => (
            <View key={`reason-${i}`} style={styles.reasonRow}>
              {reason.startsWith("SAFEGUARD") ? (
                <AlertTriangle size={11} color={Colors.error} />
              ) : (
                <CheckCircle2 size={11} color={Colors.success} />
              )}
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.footerRow}>
        <ShieldCheck size={12} color={Colors.textMuted} />
        <Text style={styles.footerText}>
          Verified against wiretap (18 U.S.C. § 2511), GDPR Art. 6, PIPEDA, and state surveillance acts.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    letterSpacing: 0.3,
  },
  jurisdictionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.surfaceSecondary,
  },
  jurisdictionText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
  },
  summary: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
  detailValue: {
    fontSize: 12,
    color: Colors.gold,
    fontWeight: "700", fontFamily: fontFamily.bold,
  },
  reasonsContainer: {
    gap: 6,
    marginTop: 10,
  },
  reasonRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  reasonText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  footerRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerText: {
    flex: 1,
    fontSize: 10.5,
    color: Colors.textMuted,
    lineHeight: 14,
  },
});
