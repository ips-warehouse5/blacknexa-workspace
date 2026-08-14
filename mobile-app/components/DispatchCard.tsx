import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Mail,
  MapPin,
  Newspaper,
  Phone,
  Send,
  ShieldCheck,
  Scale,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import Colors from "@/constants/colors";
import {
  type DispatchChannel,
  CHANNEL_LABELS,
  MISSION_STATEMENT,
  CHANNEL_DISCLAIMERS,
  type DisclaimerType,
} from "@/constants/disclaimers";
import {
  type Agency,
  type AgencyTarget,
  type AgencyTier,
  type AgencyType,
  AGENCY_TIER_LABELS,
  AGENCY_TYPE_LABELS,
} from "@/constants/agencies";
import type { DispatchResult } from "@/constants/dispatch";

type Props = {
  /** Pre-resolved dispatch result (if already executed). */
  result?: DispatchResult;
  /** Incident category for preview. */
  category: string;
  /** Whether the incident has evidence. */
  hasEvidence: boolean;
  /** Credibility score (0-1). */
  credibilityScore?: number;
  /** Country code. */
  countryCode: string;
  /** Subdivision code. */
  subdivisionCode: string;
  /** Called when user initiates dispatch for a channel. */
  onDispatch: (channel: DispatchChannel) => void;
  testID?: string;
};

const CHANNEL_ICONS: Record<DispatchChannel, typeof Newspaper> = {
  PRESS: Newspaper,
  GOVT_AGENCY: Building2,
  GLOBAL_HUMAN_RIGHTS: Globe,
  LEGAL_NETWORK: Scale,
};

const CHANNEL_COLORS: Record<DispatchChannel, string> = {
  PRESS: Colors.gold,
  GOVT_AGENCY: Colors.sky,
  GLOBAL_HUMAN_RIGHTS: Colors.violet,
  LEGAL_NETWORK: Colors.emerald,
};

export default function DispatchCard({
  result,
  category,
  hasEvidence,
  credibilityScore,
  countryCode,
  subdivisionCode,
  onDispatch,
  testID,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showChannelMenu, setShowChannelMenu] = useState(false);

  const scorePct = credibilityScore ? Math.round(credibilityScore * 100) : null;
  const eligible = scorePct !== null && scorePct >= 85;

  const toggleExpand = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setExpanded((v) => !v);
  };

  const handleChannelSelect = (channel: DispatchChannel) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setShowChannelMenu(false);
    onDispatch(channel);
  };

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Send size={15} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Master Dispatch Router</Text>
          <Text style={styles.subtitle}>
            Route verified evidence to agencies, press, and legal networks
          </Text>
        </View>
      </View>

      {/* Pipeline status */}
      <View style={styles.pipelineSection}>
        <PipelineStep
          label="Compliance"
          status="checked"
        />
        <PipelineConnector />
        <PipelineStep
          label="Credibility"
          status={eligible ? "passed" : "failed"}
          detail={scorePct ? `${scorePct}%` : "—"}
        />
        <PipelineConnector />
        <PipelineStep
          label="Consent"
          status="pending"
        />
        <PipelineConnector />
        <PipelineStep
          label="Dispatch"
          status="pending"
        />
      </View>

      {/* Dispatch result (if executed) */}
      {result && (
        <View
          style={[
            styles.resultBanner,
            {
              backgroundColor:
                result.status === "SUCCESSFULLY_DISPATCHED"
                  ? Colors.emerald + "14"
                  : result.status === "NOT_ELIGIBLE"
                  ? Colors.crimson + "12"
                  : Colors.gold + "12",
              borderColor:
                result.status === "SUCCESSFULLY_DISPATCHED"
                  ? Colors.emerald + "44"
                  : result.status === "NOT_ELIGIBLE"
                  ? Colors.crimson + "44"
                  : Colors.gold + "44",
            },
          ]}
        >
          {result.status === "SUCCESSFULLY_DISPATCHED" ? (
            <CheckCircle2 size={16} color={Colors.emerald} />
          ) : (
            <AlertTriangle size={16} color={result.status === "NOT_ELIGIBLE" ? Colors.crimson : Colors.gold} />
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.resultTitle,
                {
                  color:
                    result.status === "SUCCESSFULLY_DISPATCHED"
                      ? Colors.emerald
                      : result.status === "NOT_ELIGIBLE"
                      ? Colors.crimson
                      : Colors.gold,
                },
              ]}
            >
              {result.status === "SUCCESSFULLY_DISPATCHED"
                ? "Dispatch Successful"
                : result.status === "NOT_ELIGIBLE"
                ? "Not Eligible for Dispatch"
                : result.status === "COMPLIANCE_BLOCKED"
                ? "Compliance Blocked"
                : result.status === "CONSENT_REQUIRED"
                ? "Consent Required"
                : "No Agencies Found"}
            </Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
            {result.transmissionAuditId && (
              <Text style={styles.auditId}>
                Audit ID: {result.transmissionAuditId}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Target agencies (if dispatched) */}
      {result?.targetAgencies && result.targetAgencies.length > 0 && (
        <Pressable onPress={toggleExpand} style={styles.expandBtn}>
          <Text style={styles.expandText}>
            {expanded ? "Hide" : "View"} {result.targetAgencies.length} target agency(ies)
          </Text>
          {expanded ? <ChevronUp size={14} color={Colors.textDim} /> : <ChevronDown size={14} color={Colors.textDim} />}
        </Pressable>
      )}

      {expanded && result?.targetAgencies && (
        <View style={styles.agencyList}>
          {result.targetAgencies.map((target) => (
            <AgencyRow key={target.agency.id} target={target} />
          ))}
        </View>
      )}

      {/* Channel selector */}
      {!result && (
        <>
          <Text style={styles.sectionLabel}>Select dispatch channel</Text>
          <View style={styles.channelGrid}>
            {(Object.keys(CHANNEL_LABELS) as DispatchChannel[]).map((channel) => {
              const Icon = CHANNEL_ICONS[channel];
              const color = CHANNEL_COLORS[channel];
              return (
                <Pressable
                  key={channel}
                  onPress={() => handleChannelSelect(channel)}
                  style={[styles.channelCard, { borderColor: color + "44" }]}
                  testID={`channel-${channel}`}
                >
                  <View style={[styles.channelIcon, { backgroundColor: color + "1A" }]}>
                    <Icon size={16} color={color} />
                  </View>
                  <Text style={styles.channelLabel}>{CHANNEL_LABELS[channel]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Mission statement */}
      <View style={styles.missionRow}>
        <ShieldCheck size={12} color={Colors.gold} />
        <Text style={styles.missionText}>{MISSION_STATEMENT}</Text>
      </View>

      {/* No-guarantee notice */}
      <View style={styles.disclaimerRow}>
        <AlertTriangle size={11} color={Colors.textMute} />
        <Text style={styles.disclaimerText}>
          No guarantee of legal representation, press publication, or governmental action.
          All third-party organizations make independent decisions.
        </Text>
      </View>
    </View>
  );
}

function PipelineStep({
  label,
  status,
  detail,
}: {
  label: string;
  status: "checked" | "passed" | "failed" | "pending";
  detail?: string;
}) {
  const colorMap = {
    checked: Colors.emerald,
    passed: Colors.emerald,
    failed: Colors.crimson,
    pending: Colors.textMute,
  };
  const color = colorMap[status];

  return (
    <View style={styles.pipelineStep}>
      <View style={[styles.pipelineDot, { backgroundColor: color }]}>
        {status === "checked" || status === "passed" ? (
          <CheckCircle2 size={10} color={Colors.bg} />
        ) : status === "failed" ? (
          <AlertTriangle size={10} color={Colors.bg} />
        ) : null}
      </View>
      <Text style={[styles.pipelineLabel, { color }]}>{label}</Text>
      {detail && <Text style={[styles.pipelineDetail, { color }]}>{detail}</Text>}
    </View>
  );
}

function PipelineConnector() {
  return <View style={styles.pipelineConnector} />;
}

function AgencyRow({ target }: { target: AgencyTarget }) {
  const { agency, verification, flaggedForUpdate } = target;

  return (
    <View style={styles.agencyRow}>
      <View style={styles.agencyHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.agencyName}>{agency.name}</Text>
          <View style={styles.agencyMeta}>
            <View style={[styles.tierBadge, { backgroundColor: Colors.surface3 }]}>
              <Text style={styles.tierText}>{AGENCY_TIER_LABELS[agency.tier as AgencyTier]}</Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: Colors.gold + "14" }]}>
              <Text style={styles.typeText}>{AGENCY_TYPE_LABELS[agency.type as AgencyType]}</Text>
            </View>
          </View>
        </View>
        {verification.overallValid ? (
          <View style={styles.verifiedBadge}>
            <ShieldCheck size={11} color={Colors.emerald} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        ) : (
          <View style={styles.flaggedBadge}>
            <AlertTriangle size={11} color={Colors.gold} />
            <Text style={styles.flaggedText}>Updating</Text>
          </View>
        )}
      </View>

      <Text style={styles.agencyDesc}>{agency.description}</Text>

      <View style={styles.agencyContacts}>
        {agency.phone && (
          <View style={styles.contactPill}>
            <Phone size={10} color={Colors.gold} />
            <Text style={styles.contactText}>{agency.phone}</Text>
          </View>
        )}
        {agency.intakeEmail && (
          <View style={styles.contactPill}>
            <Mail size={10} color={Colors.sky} />
            <Text style={styles.contactText}>{agency.intakeEmail}</Text>
          </View>
        )}
        <View style={styles.contactPill}>
          <MapPin size={10} color={Colors.textDim} />
          <Text style={styles.contactText}>{agency.jurisdiction}</Text>
        </View>
      </View>

      {flaggedForUpdate && (
        <Text style={styles.flaggedNote}>
          Agency contact verification failed. AI directory update triggered.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
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
    backgroundColor: Colors.gold + "1A",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11.5,
    color: Colors.textDim,
    lineHeight: 16,
  },
  pipelineSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 12,
  },
  pipelineStep: {
    alignItems: "center",
    gap: 4,
  },
  pipelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pipelineLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  pipelineDetail: {
    fontSize: 9,
    fontWeight: "600",
  },
  pipelineConnector: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
    marginBottom: 14,
  },
  resultBanner: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },
  resultMessage: {
    fontSize: 12,
    color: Colors.text,
    lineHeight: 17,
  },
  auditId: {
    fontSize: 10,
    color: Colors.textMute,
    marginTop: 4,
    fontWeight: "600",
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
    fontWeight: "700",
    color: Colors.textDim,
  },
  agencyList: {
    gap: 10,
    paddingTop: 10,
  },
  agencyRow: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  agencyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  agencyName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  agencyMeta: {
    flexDirection: "row",
    gap: 6,
  },
  tierBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tierText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.textDim,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.gold,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.emerald + "18",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.emerald,
  },
  flaggedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.gold + "18",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  flaggedText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.gold,
  },
  agencyDesc: {
    fontSize: 11.5,
    color: Colors.textDim,
    lineHeight: 16,
    marginBottom: 8,
  },
  agencyContacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  contactPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surface3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  contactText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textDim,
  },
  flaggedNote: {
    fontSize: 10,
    color: Colors.gold,
    marginTop: 8,
    fontStyle: "italic",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textDim,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  channelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  channelCard: {
    width: "48%",
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  channelIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  channelLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  missionRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  missionText: {
    flex: 1,
    fontSize: 10.5,
    color: Colors.gold,
    fontWeight: "600",
    lineHeight: 15,
    fontStyle: "italic",
  },
  disclaimerRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginTop: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 10,
    color: Colors.textMute,
    lineHeight: 14,
  },
});
