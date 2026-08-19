import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Gauge,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";
import {
  type CredibilityReport,
  credibilityScoreLabel,
  credibilityScoreColor,
  MERIT_THRESHOLD,
} from "@/constants/credibility";

type Props = {
  report: CredibilityReport;
  testID?: string;
};

const COLOR_MAP: Record<string, string> = {
  emerald: Colors.success,
  gold: Colors.gold,
  crimson: Colors.error,
  textMute: Colors.textMuted,
};

export default function CredibilityCard({ report, testID }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scorePct = Math.round(report.credibilityScore * 100);
  const colorKey = credibilityScoreColor(report.credibilityScore);
  const color = COLOR_MAP[colorKey] ?? Colors.gold;
  const label = credibilityScoreLabel(report.credibilityScore);

  const toggleExpand = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: color + "1A", borderColor: color + "44" }]}>
          <Gauge size={15} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>AI Credibility & Merit Vetting</Text>
          <Text style={styles.subtitle}>
            Evidence assessed for press and agency consideration
          </Text>
        </View>
      </View>

      {/* Score Bar */}
      <View style={styles.scoreSection}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreNumber}>{scorePct}%</Text>
          <View style={[styles.meritBadge, { backgroundColor: color + "26" }]}>
            {report.hasMerit ? (
              <CheckCircle2 size={11} color={color} />
            ) : (
              <AlertTriangle size={11} color={color} />
            )}
            <Text style={[styles.meritText, { color }]}>
              {report.hasMerit ? "Merit validated" : "Below threshold"}
            </Text>
          </View>
        </View>
        <View style={styles.scoreBar}>
          <View
            style={[
              styles.scoreFill,
              {
                width: `${scorePct}%`,
                backgroundColor: color,
              },
            ]}
          />
          <View style={[styles.thresholdMark, { left: `${MERIT_THRESHOLD * 100}%` }]} />
        </View>
        <Text style={styles.scoreLabel}>{label}</Text>
        <Text style={styles.thresholdText}>
          {Math.round(MERIT_THRESHOLD * 100)}% threshold for dispatch eligibility
        </Text>
      </View>

      {/* Quick status indicators */}
      <View style={styles.statusGrid}>
        <StatusPill
          icon={Fingerprint}
          label="Hash integrity"
          passed={report.chainOfCustodyIntact}
        />
        <StatusPill
          icon={ShieldCheck}
          label="No manipulation"
          passed={!report.manipulationDetected}
        />
        <StatusPill
          icon={MapPin}
          label="GPS matched"
          passed={report.gpsTimestampMatched}
        />
        <StatusPill
          icon={Users}
          label="Corroborated"
          passed={report.factors.some((f) => f.id === "corroboration" && f.passed)}
        />
      </View>

      {/* Expandable details */}
      <Pressable onPress={toggleExpand} style={styles.expandBtn} testID="credibility-expand">
        <Text style={styles.expandText}>
          {expanded ? "Hide" : "View"} assessment details
        </Text>
        {expanded ? <ChevronUp size={14} color={Colors.textSecondary} /> : <ChevronDown size={14} color={Colors.textSecondary} />}
      </Pressable>

      {expanded && (
        <View style={styles.factorsContainer}>
          {report.factors.map((factor) => (
            <View key={factor.id} style={styles.factorRow}>
              {factor.passed ? (
                <CheckCircle2 size={13} color={Colors.success} />
              ) : (
                <AlertTriangle size={13} color={Colors.error} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.factorLabel}>{factor.label}</Text>
                <Text style={styles.factorDetail}>{factor.detail}</Text>
              </View>
            </View>
          ))}

          <View style={styles.notesContainer}>
            {report.vettingNotes.map((note, i) => (
              <Text key={`note-${i}`} style={styles.noteText}>
                {note}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View style={styles.footerRow}>
        <Fingerprint size={12} color={Colors.textMuted} />
        <Text style={styles.footerText}>
          SHA-256 verified · EXIF triangulated · Manipulation detection · {report.timestamp.slice(0, 10)}
        </Text>
      </View>
    </View>
  );
}

function StatusPill({
  icon: Icon,
  label,
  passed,
}: {
  icon: typeof CheckCircle2;
  label: string;
  passed: boolean;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: (passed ? Colors.success : Colors.error) + "26" },
      ]}
    >
      <Icon size={11} color={passed ? Colors.success : Colors.error} />
      <Text
        style={[
          styles.statusPillText,
          { color: passed ? Colors.success : Colors.error },
        ]}
      >
        {label}
      </Text>
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
  scoreSection: {
    marginBottom: 14,
  },
  scoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  scoreNumber: {
    fontSize: 28,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  meritBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  meritText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    letterSpacing: 0.3,
  },
  scoreBar: {
    height: 8,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  scoreFill: {
    height: "100%",
    borderRadius: 4,
  },
  thresholdMark: {
    position: "absolute",
    top: -2,
    width: 2,
    height: 12,
    backgroundColor: Colors.gold,
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  thresholdText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "500", fontFamily: fontFamily.medium,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: "700", fontFamily: fontFamily.bold,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  expandText: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
  },
  factorsContainer: {
    gap: 10,
    paddingTop: 10,
  },
  factorRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  factorLabel: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  factorDetail: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  notesContainer: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 4,
  },
  noteText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
    fontStyle: "italic",
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
