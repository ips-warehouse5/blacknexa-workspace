import { Stack, useLocalSearchParams } from "expo-router";
import {
  BadgeCheck,
  Clock,
  FileCheck2,
  Flag,
  Fingerprint,
  Heart,
  MapPin,
  Share2,
  ShieldCheck,
  User,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import PrivacyBadge from "@/components/PrivacyBadge";
import BrandMark from "@/components/BrandMark";
import AdvocacyCard from "@/components/AdvocacyCard";
import CredibilityCard from "@/components/CredibilityCard";
import CustodyCard from "@/components/CustodyCard";
import DispatchCard from "@/components/DispatchCard";
import DisclaimerModal from "@/components/DisclaimerModal";
import SecurityCard from "@/components/SecurityCard";
import { resolveAdvocacyRoutes } from "@/constants/advocacy";
import {
  type CustodyEvent,
  loadAuditLog,
  appendCustodyEvent,
  verifyAuditIntegrity,
  type AuditLog,
} from "@/constants/security";
import { quickCredibilityAssessment, type CredibilityReport } from "@/constants/credibility";
import {
  type DispatchChannel,
  type DisclaimerType,
  CHANNEL_DISCLAIMERS,
  DISCLAIMERS,
} from "@/constants/disclaimers";
import { processIncidentDispatch, type DispatchResult } from "@/constants/dispatch";
import { CATEGORY_LABELS, formatRelative } from "@/mocks/incidents";
import { useIncidents } from "@/providers/IncidentsProvider";
import { useSettings } from "@/providers/SettingsProvider";

export default function IncidentDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, toggleSupport, isSupported } = useIncidents();
  const { settings } = useSettings();
  const incident = id ? getById(id) : undefined;

  const [custodyEvents, setCustodyEvents] = useState<CustodyEvent[]>([]);
  const [rootHash, setRootHash] = useState<string | undefined>(undefined);
  const [integrityVerified, setIntegrityVerified] = useState<boolean | undefined>(undefined);

  // Credibility & dispatch state
  const [credibilityReport, setCredibilityReport] = useState<CredibilityReport | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState<boolean>(false);
  const [pendingChannel, setPendingChannel] = useState<DispatchChannel | null>(null);
  const [acknowledgments, setAcknowledgments] = useState<Record<DisclaimerType, boolean>>({
    no_guarantee: false,
    legal_scope: false,
    media_consent: false,
    agency_consent: false,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const log = await loadAuditLog(id);
      if (cancelled || !log) return;
      setCustodyEvents(log.events);
      setRootHash(log.rootHash);
      const verified = await verifyAuditIntegrity(log);
      if (!cancelled) setIntegrityVerified(verified);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Compute credibility assessment when incident loads
  useEffect(() => {
    if (!incident) return;
    const report = quickCredibilityAssessment({
      incidentId: incident.id,
      hasEvidence: incident.hasEvidence,
      evidenceCount: incident.evidenceCount,
      verifications: incident.verifications,
      urgent: incident.urgent ?? false,
      hasLocation: incident.area.length > 0,
    });
    setCredibilityReport(report);
  }, [incident]);

  const support = useCallback(() => {
    if (!incident) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    toggleSupport(incident.id);
  }, [incident, toggleSupport]);

  const onShare = useCallback(async () => {
    if (!incident) return;
    if (Platform.OS !== "web")
      Haptics.selectionAsync().catch(() => {});
    try {
      await Share.share({
        title: incident.title,
        message: `${incident.title}\n\n${incident.summary}\n\nShared from BlackNexa\u2122 \u2014 community-led civic platform.`,
      });
    } catch (e) {
      console.log("[Incident] share error", e);
    }
  }, [incident]);

  const onVerify = useCallback(async () => {
    if (!incident) return;
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    // Append custody event for verification
    if (id) {
      await appendCustodyEvent({
        incidentId: id,
        action: "VERIFIED",
        actor: "Community member",
        description: "Community verification submitted",
      });
      const log = await loadAuditLog(id);
      if (log) {
        setCustodyEvents(log.events);
        setRootHash(log.rootHash);
      }
    }
    Alert.alert(
      "Verification submitted",
      "Thank you. Verified community accounts strengthen chain-of-custody. A moderator will review within 24 hours.",
      [{ text: "OK" }]
    );
  }, [incident, id]);

  const onFlag = useCallback(() => {
    if (!incident) return;
    Alert.alert(
      "Flag this report?",
      "Reports are reviewed by trained moderators. Flag only if this content is harmful, false, or violates community guidelines.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Flag",
          style: "destructive",
          onPress: () => {
            if (Platform.OS !== "web")
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning
              ).catch(() => {});
            Alert.alert(
              "Report received",
              "Thank you. Our moderation team will review shortly."
            );
          },
        },
      ]
    );
  }, [incident]);

  const onDispatch = useCallback((channel: DispatchChannel) => {
    setPendingChannel(channel);
    // Reset acknowledgments for this channel's required disclaimers
    const required = CHANNEL_DISCLAIMERS[channel];
    setAcknowledgments((prev) => {
      const next = { ...prev };
      for (const d of required) next[d] = false;
      return next;
    });
    setShowDisclaimerModal(true);
  }, []);

  const onToggleDisclaimer = useCallback((id: DisclaimerType) => {
    setAcknowledgments((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const onConfirmDisclaimers = useCallback(() => {
    if (!incident || !pendingChannel) return;
    setShowDisclaimerModal(false);

    const result = processIncidentDispatch({
      incidentId: incident.id,
      category: incident.category,
      countryCode: settings.defaultCountry || "US",
      subdivisionCode: settings.defaultSubdivision || "NY",
      hasEvidence: incident.hasEvidence,
      evidenceCount: incident.evidenceCount,
      verifications: incident.verifications,
      urgent: incident.urgent ?? false,
      hasLocation: incident.area.length > 0,
      channel: pendingChannel,
      userExplicitOptIn: true,
      acknowledgedNoGuarantee: acknowledgments.no_guarantee,
      acknowledgments,
    });

    setDispatchResult(result);

    // Append custody event for dispatch
    if (id && result.status === "SUCCESSFULLY_DISPATCHED") {
      appendCustodyEvent({
        incidentId: id,
        action: "SHARED",
        actor: settings.anonymousByDefault ? "Anonymous" : settings.displayName,
        description: `Dispatched via ${pendingChannel}. Audit: ${result.transmissionAuditId}`,
      }).then(() => {
        loadAuditLog(id).then((log) => {
          if (log) {
            setCustodyEvents(log.events);
            setRootHash(log.rootHash);
          }
        });
      });
    }

    setPendingChannel(null);
  }, [incident, pendingChannel, acknowledgments, settings, id]);

  const advocacyRoutes = useMemo(
    () =>
      incident
        ? resolveAdvocacyRoutes({
            category: incident.category,
            urgent: incident.urgent,
            hasEvidence: incident.hasEvidence,
          })
        : [],
    [incident]
  );

  if (!incident) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Not found" }} />
        <Text style={styles.notFound}>Record not found.</Text>
      </View>
    );
  }

  const supported = isSupported(incident.id);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <Stack.Screen
        options={{
          title: CATEGORY_LABELS[incident.category],
          headerRight: () => (
            <Pressable hitSlop={10} testID="share-btn" onPress={onShare}>
              <Share2 size={18} color={Colors.text} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container}>
        <BrandMark variant="chip" style={styles.brandChip} testID="incident-brand" />
        <View style={styles.pills}>
          <View style={styles.catPill}>
            <Text style={styles.catText}>
              {CATEGORY_LABELS[incident.category]}
            </Text>
          </View>
          <PrivacyBadge level={incident.privacy} />
        </View>

        <Text style={styles.title}>{incident.title}</Text>

        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <User size={14} color={Colors.gold} />
          </View>
          <Text style={styles.authorName}>
            {incident.author.anonymous ? "Anonymous" : incident.author.handle}
          </Text>
          <View style={styles.dot} />
          <Clock size={12} color={Colors.textMute} />
          <Text style={styles.authorTime}>
            {formatRelative(incident.timestamp)}
          </Text>
        </View>

        <Text style={styles.summary}>{incident.summary}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          <View style={styles.rowInline}>
            <MapPin size={15} color={Colors.gold} />
            <Text style={styles.cardValue}>{incident.area}</Text>
          </View>
          <Text style={styles.cardMuted}>
            Precise coordinates redacted for public view.
          </Text>
        </View>

        {incident.hasEvidence && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Evidence</Text>
              <View style={styles.evidenceBadge}>
                <FileCheck2 size={12} color={Colors.gold} />
                <Text style={styles.evidenceBadgeText}>
                  {incident.evidenceCount} sealed
                </Text>
              </View>
            </View>
            <View style={styles.evidenceGrid}>
              {Array.from({ length: incident.evidenceCount }).map((_, i) => (
                <View key={`ev-${i}`} style={styles.evidenceTile}>
                  <ShieldCheck size={20} color={Colors.emerald} />
                  <Text style={styles.evidenceTileText}>Sealed #{i + 1}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.cardMuted}>
              Attachments revealed only to trusted advocates with your consent.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Chain of custody</Text>
          <Timeline
            steps={[
              { label: "Submitted", time: formatRelative(incident.timestamp) },
              { label: "Cryptographically sealed", time: "instant" },
              { label: "Reviewed by moderators", time: "under review" },
              ...(incident.verifications > 0
                ? [
                    {
                      label: `${incident.verifications} community verifications`,
                      time: "ongoing",
                    },
                  ]
                : []),
            ]}
          />
        </View>

        {custodyEvents.length > 0 && (
          <CustodyCard
            events={custodyEvents}
            rootHash={rootHash}
            integrityVerified={integrityVerified}
            testID="incident-custody"
          />
        )}

        <SecurityCard
          vaultPinSet={settings.vaultPinSet}
          autoSeal={settings.autoSeal}
          biometrics={settings.biometrics}
          sealedCount={incident.hasEvidence ? incident.evidenceCount : undefined}
          testID="incident-security"
        />

        {incident.hasEvidence && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Evidence integrity</Text>
              <View style={styles.evidenceBadge}>
                <Fingerprint size={12} color={Colors.emerald} />
                <Text style={styles.evidenceBadgeText}>SHA-256</Text>
              </View>
            </View>
            <View style={styles.integrityRow}>
              <View style={styles.integrityPill}>
                <ShieldCheck size={11} color={Colors.emerald} />
                <Text style={styles.integrityPillText}>AES-256-GCM</Text>
              </View>
              <View style={styles.integrityPill}>
                <Fingerprint size={11} color={Colors.gold} />
                <Text style={styles.integrityPillText}>Hash verified</Text>
              </View>
            </View>
            <Text style={styles.cardMuted}>
              Each file is SHA-256 hashed and AES-256 encrypted on capture. The hash chain proves evidence has not been tampered with since sealing.
            </Text>
          </View>
        )}

        {credibilityReport && (
          <CredibilityCard report={credibilityReport} testID="incident-credibility" />
        )}

        <AdvocacyCard routes={advocacyRoutes} testID="incident-advocacy" />

        <DispatchCard
          result={dispatchResult ?? undefined}
          category={incident.category}
          hasEvidence={incident.hasEvidence}
          credibilityScore={credibilityReport?.credibilityScore}
          countryCode={settings.defaultCountry || "US"}
          subdivisionCode={settings.defaultSubdivision || "NY"}
          onDispatch={onDispatch}
          testID="incident-dispatch"
        />

        {showDisclaimerModal && pendingChannel && (
          <DisclaimerModal
            visible={showDisclaimerModal}
            disclaimers={CHANNEL_DISCLAIMERS[pendingChannel].map((d) => DISCLAIMERS[d])}
            acknowledged={acknowledgments}
            onToggle={onToggleDisclaimer}
            onConfirm={onConfirmDisclaimers}
            onDismiss={() => {
              setShowDisclaimerModal(false);
              setPendingChannel(null);
            }}
            testID="incident-disclaimer-modal"
          />
        )}

        <View style={styles.actionBar}>
          <Pressable
            onPress={support}
            style={[
              styles.primaryAction,
              supported && { backgroundColor: Colors.crimson },
            ]}
            testID="detail-support"
          >
            <Heart
              size={16}
              color={Colors.bg}
              fill={supported ? Colors.bg : "transparent"}
              strokeWidth={2.5}
            />
            <Text style={styles.primaryActionText}>
              {supported ? "Supporting" : "Stand with"}
              {"  "}
              <Text style={{ opacity: 0.7 }}>· {incident.supporters}</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={onVerify}
            style={styles.secondaryAction}
            testID="detail-verify"
          >
            <BadgeCheck size={16} color={Colors.emerald} />
            <Text style={[styles.secondaryText, { color: Colors.emerald }]}>
              Verify
            </Text>
          </Pressable>
          <Pressable
            onPress={onFlag}
            style={styles.secondaryAction}
            testID="detail-flag"
          >
            <Flag size={16} color={Colors.textDim} />
          </Pressable>
        </View>
        <BrandMark variant="watermark" testID="incident-watermark" />
      </View>
    </ScrollView>
  );
}

function Timeline({
  steps,
}: {
  steps: { label: string; time: string }[];
}) {
  return (
    <View style={{ marginTop: 8 }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={`${s.label}-${i}`} style={styles.tlRow}>
            <View style={styles.tlCol}>
              <View style={styles.tlDot} />
              {!last && <View style={styles.tlLine} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
              <Text style={styles.tlLabel}>{s.label}</Text>
              <Text style={styles.tlTime}>{s.time}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  notFound: { color: Colors.textDim, fontSize: 15 },
  container: { padding: 18, paddingBottom: 60 },
  brandChip: { marginBottom: 12 },
  pills: { flexDirection: "row", gap: 8, marginBottom: 14 },
  catPill: {
    backgroundColor: Colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  catText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.text,
    lineHeight: 33,
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  authorName: { fontSize: 13, fontWeight: "700", color: Colors.text },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMute,
    marginHorizontal: 4,
  },
  authorTime: { fontSize: 12, color: Colors.textDim, fontWeight: "500" },
  summary: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 23,
    marginBottom: 22,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textDim,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  cardValue: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cardMuted: {
    fontSize: 12,
    color: Colors.textMute,
    marginTop: 8,
    lineHeight: 17,
  },
  rowInline: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  evidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.gold + "1A",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  evidenceBadgeText: {
    fontSize: 11,
    color: Colors.gold,
    fontWeight: "700",
  },
  evidenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  evidenceTile: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  evidenceTileText: {
    fontSize: 10,
    color: Colors.textDim,
    fontWeight: "700",
  },
  tlRow: { flexDirection: "row", gap: 12 },
  tlCol: { alignItems: "center", width: 14 },
  tlDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
    marginTop: 3,
  },
  tlLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginTop: 2,
  },
  tlLabel: { fontSize: 13, fontWeight: "700", color: Colors.text },
  tlTime: { fontSize: 12, color: Colors.textDim, marginTop: 1 },
  actionBar: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.gold,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryActionText: {
    color: Colors.bg,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  secondaryText: { fontSize: 13, fontWeight: "700" },
  integrityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  integrityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.emerald + "18",
  },
  integrityPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: Colors.emerald,
  },
});
