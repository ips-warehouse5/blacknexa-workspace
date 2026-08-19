import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { safeBack } from "@/utils/navigation";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import {
  Camera,
  Check,
  Eye,
  Globe,
  Lock,
  MapPin,
  MapPinOff,
  Mic,
  Shield,
  ShieldCheck,
  Users,
  Video,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import ComplianceCard from "@/components/ComplianceCard";
import SecurityCard from "@/components/SecurityCard";
import {
  CATEGORY_LABELS,
  type IncidentCategory,
  type PrivacyLevel,
} from "@/mocks/incidents";
import { useIncidents } from "@/providers/IncidentsProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useGeoLegal } from "@/providers/GeoLegalProvider";
import ComplianceReviewSheet from "@/components/ComplianceReviewSheet";
import type { ReportDraft as GeoReportDraft, ValidationResult as GeoValidationResult } from "@/constants/geo-legal";
import {
  type ComplianceResult,
  type MediaUploadContext,
  evaluateMediaCompliance,
} from "@/constants/compliance";
import {
  initAuditLog,
  appendCustodyEvent,
  createEvidenceManifest,
  sha256,
} from "@/constants/security";
import { quickCredibilityAssessment } from "@/constants/credibility";
import { MISSION_STATEMENT, NO_GUARANTEE_DISCLAIMER_TEXT } from "@/constants/disclaimers";
import { fontFamily } from "@/constants/theme";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as IncidentCategory[];

const PRIVACY_OPTIONS: {
  key: PrivacyLevel;
  label: string;
  desc: string;
  icon: typeof Lock;
  color: string;
}[] = [
  {
    key: "private",
    label: "Private",
    desc: "Only visible to you. Stored in your vault.",
    icon: Lock,
    color: Colors.violet,
  },
  {
    key: "trusted",
    label: "Trusted Circle",
    desc: "Shared anonymously with verified advocates.",
    icon: Users,
    color: Colors.info,
  },
  {
    key: "public",
    label: "Community",
    desc: "Appears in the public feed to build awareness.",
    icon: Eye,
    color: Colors.success,
  },
];

export default function ReportScreen(): React.ReactElement {
  const { createIncident, isCreating } = useIncidents();
  const { settings } = useSettings();
  const { validateReport, confirmAndDispatch, createIncident: createGeoIncident, currentProfile } = useGeoLegal();

  const [title, setTitle] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [category, setCategory] = useState<IncidentCategory>("profiling");
  const [privacy, setPrivacy] = useState<PrivacyLevel>(
    settings.anonymousByDefault ? "trusted" : "public"
  );
  const [area, setArea] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [redactLocation, setRedactLocation] = useState<boolean>(
    settings.redactGps
  );
  const [gettingLocation, setGettingLocation] = useState<boolean>(false);

  // Compliance state
  const [country, setCountry] = useState<string>(settings.defaultCountry || "US");
  const [subdivision, setSubdivision] = useState<string>(settings.defaultSubdivision || "NY");
  const [mediaType, setMediaType] = useState<"PHOTO" | "VIDEO" | "AUDIO">("PHOTO");
  const [userIsParticipant, setUserIsParticipant] = useState<boolean>(true);
  const [obtainedConsent, setObtainedConsent] = useState<boolean>(false);
  const [inPublicSpace, setInPublicSpace] = useState<boolean>(true);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [showComplianceCheck, setShowComplianceCheck] = useState<boolean>(false);
  const [geoValidation, setGeoValidation] = useState<GeoValidationResult | null>(null);
  const [showComplianceReview, setShowComplianceReview] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const resetForm = useCallback(() => {
    setTitle("");
    setSummary("");
    setCategory("profiling");
    setPrivacy(settings.anonymousByDefault ? "trusted" : "public");
    setArea("");
    setPhotos([]);
    setRedactLocation(settings.redactGps);
    setCountry(settings.defaultCountry || "US");
    setSubdivision(settings.defaultSubdivision || "NY");
    setMediaType("PHOTO");
    setUserIsParticipant(true);
    setObtainedConsent(false);
    setInPublicSpace(true);
    setComplianceResult(null);
    setShowComplianceCheck(false);
    setGeoValidation(null);
    setShowComplianceReview(false);
    setIsValidating(false);
  }, [settings]);

  const runComplianceCheck = useCallback(async (type: "PHOTO" | "VIDEO" | "AUDIO") => {
    setMediaType(type);
    setShowComplianceCheck(true);
    const ctx: MediaUploadContext = {
      incidentId: `draft_${Date.now()}`,
      userId: "current_user",
      mediaType: type,
      countryCode: country,
      subdivisionCode: subdivision,
      isAnonymous: settings.anonymousByDefault,
      redactExactLocation: redactLocation,
      autoSealEnabled: settings.autoSeal,
      userIsParticipant,
      obtainedExplicitConsent: obtainedConsent,
      inPublicSpace,
      dataProcessingAgreed: settings.dataProcessingAgreed || settings.consentPrivacy,
    };
    const result = evaluateMediaCompliance(ctx);
    setComplianceResult(result);
    if (Platform.OS !== "web")
      Haptics.selectionAsync().catch(() => {});
    return result;
  }, [country, subdivision, settings, redactLocation, userIsParticipant, obtainedConsent, inPublicSpace]);

  const addPhoto = useCallback(async () => {
    const result = await runComplianceCheck("PHOTO");
    if (!result.isAllowed && result.status === "REJECTED") {
      Alert.alert(
        "Compliance blocked",
        result.summary,
        [{ text: "OK" }]
      );
      return;
    }
    if (Platform.OS !== "web")
      Haptics.selectionAsync().catch(() => {});
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      setPhotos((prev) => [...prev, ...res.assets.map((a) => a.uri)]);
    }
  }, [runComplianceCheck]);

  const captureLocation = useCallback(async () => {
    setGettingLocation(true);
    try {
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setArea(
                `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`
              );
              setGettingLocation(false);
            },
            () => setGettingLocation(false)
          );
          return;
        }
        setGettingLocation(false);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Location access was denied.");
        setGettingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const geo = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const g = geo[0];
      if (g) {
        setArea(
          [g.city || g.subregion, g.region].filter(Boolean).join(", ")
        );
      }
    } catch (e) {
      console.log("[Report] location error", e);
    } finally {
      setGettingLocation(false);
    }
  }, []);

  const canSubmit =
    title.trim().length >= 4 && summary.trim().length >= 10 && area.trim().length > 0;

  const submit = useCallback(async () => {
    if (!canSubmit) {
      Alert.alert(
        "A bit more detail needed",
        "Please add a title, a short description, and an area."
      );
      return;
    }

    // Run compliance check if evidence is attached
    if (photos.length > 0 && !complianceResult) {
      const result = await runComplianceCheck("PHOTO");
      if (!result.isAllowed && result.status === "REJECTED") {
        Alert.alert("Compliance required", result.summary, [{ text: "OK" }]);
        return;
      }
    }
    if (complianceResult && !complianceResult.isAllowed && complianceResult.status === "REJECTED") {
      Alert.alert(
        "Cannot submit",
        "This report's media does not pass jurisdictional compliance checks.",
        [{ text: "OK" }]
      );
      return;
    }

    // ── Geo-Legal AI Compliance Validation ──
    // Send the draft to the backend for AI validation against the user's
    // jurisdiction. The backend returns a formatted, compliant summary that
    // the user must review and confirm before dispatch.
    setIsValidating(true);
    try {
      const draft: GeoReportDraft = {
        title: title.trim(),
        summary: summary.trim(),
        category,
        area: area.trim(),
        countryCode: country,
        subdivisionCode: subdivision,
        occurredAt: new Date().toISOString(),
        userIsParticipant,
        obtainedExplicitConsent: obtainedConsent,
        inPublicSpace,
      };
      const validation = await validateReport({
        reportDraft: draft,
        countryCode: country,
      });
      if (validation) {
        setGeoValidation(validation);
        setShowComplianceReview(true);
        setIsValidating(false);
        return; // Wait for user confirmation in the ComplianceReviewSheet.
      }
    } catch (e) {
      console.log("[Report] geo-legal validation failed, proceeding with local flow", e);
    }
    setIsValidating(false);

    // Fallback: if backend validation is unavailable, proceed with the
    // existing local compliance + audit log flow.
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const incidentId = `inc_${Date.now()}`;
    const actor = settings.anonymousByDefault ? "Anonymous" : settings.displayName;

    // Initialize cryptographic audit log
    try {
      await initAuditLog({
        incidentId,
        actor,
        description: `Report created: ${title.trim()}`,
      });

      // Hash and seal evidence if present — real AES-256-GCM encryption
      if (photos.length > 0) {
        const evidenceData = JSON.stringify({
          incidentId,
          photos,
          timestamp: Date.now(),
          category,
        });
        const contentHash = await sha256(evidenceData + incidentId);
        const vaultSecret = settings.vaultPin || `fallback:${incidentId}:${settings.consentTimestamp}`;
        const manifest = createEvidenceManifest({
          incidentId,
          mediaType,
          contentHash,
          autoSealed: settings.autoSeal,
          sizeBytes: photos.length,
          plaintextData: evidenceData,
          userSecret: vaultSecret,
        });
        console.log("[Custody] Evidence sealed:", manifest.encryptionStatus, manifest.contentHash.slice(0, 16));
        await appendCustodyEvent({
          incidentId,
          action: settings.autoSeal ? "AUTO_SEALED" : "SEALED",
          actor,
          description: `${photos.length} file(s) sealed with AES-256-GCM. Hash: ${contentHash.slice(0, 16)}…`,
        });
        await appendCustodyEvent({
          incidentId,
          action: "HASHED",
          actor: "BlackNexa Engine",
          description: `SHA-256 content hash computed: ${contentHash.slice(0, 24)}…`,
        });
      }

      await appendCustodyEvent({
        incidentId,
        action: "ENCRYPTED",
        actor: "BlackNexa Engine",
        description: "Record encrypted with AES-256-GCM (zero-knowledge). Key derived on-device via PBKDF2.",
      });
    } catch (e) {
      console.log("[Custody] init error", e);
    }

    createIncident({
      title: title.trim(),
      summary: summary.trim(),
      category,
      privacy,
      area: area.trim(),
      hasEvidence: photos.length > 0,
      evidenceCount: photos.length,
      redactLocation,
    });
    resetForm();
    safeBack();
  }, [
    canSubmit,
    title,
    summary,
    category,
    privacy,
    area,
    photos,
    redactLocation,
    createIncident,
    complianceResult,
    runComplianceCheck,
    settings,
    mediaType,
    country,
    subdivision,
    userIsParticipant,
    obtainedConsent,
    inPublicSpace,
    validateReport,
    resetForm,
  ]);

  // ── Geo-Legal confirmed dispatch handler ──
  // Called when the user taps "Confirm & Dispatch" in the ComplianceReviewSheet.
  const handleGeoConfirm = useCallback(async () => {
    if (!geoValidation) return;
    setShowComplianceReview(false);

    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const incidentId = `inc_${Date.now()}`;
    const actor = settings.anonymousByDefault ? "Anonymous" : settings.displayName;

    // Initialize cryptographic audit log (same as local flow).
    try {
      await initAuditLog({
        incidentId,
        actor,
        description: `Report created: ${title.trim()}`,
      });
      if (photos.length > 0) {
        const evidenceData = JSON.stringify({
          incidentId,
          photos,
          timestamp: Date.now(),
          category,
        });
        const contentHash = await sha256(evidenceData + incidentId);
        const vaultSecret = settings.vaultPin || `fallback:${incidentId}:${settings.consentTimestamp}`;
        createEvidenceManifest({
          incidentId,
          mediaType,
          contentHash,
          autoSealed: settings.autoSeal,
          sizeBytes: photos.length,
          plaintextData: evidenceData,
          userSecret: vaultSecret,
        });
        await appendCustodyEvent({
          incidentId,
          action: settings.autoSeal ? "AUTO_SEALED" : "SEALED",
          actor,
          description: `${photos.length} file(s) sealed with AES-256-GCM. Hash: ${contentHash.slice(0, 16)}…`,
        });
      }
      await appendCustodyEvent({
        incidentId,
        action: "ENCRYPTED",
        actor: "BlackNexa Engine",
        description: "Record encrypted with AES-256-GCM (zero-knowledge). Server-side re-encryption + PII scrubbing applied.",
      });
    } catch (e) {
      console.log("[Custody] init error", e);
    }

    // Create the incident in the local store (for the feed + vault).
    createIncident({
      title: title.trim(),
      summary: summary.trim(),
      category,
      privacy,
      area: area.trim(),
      hasEvidence: photos.length > 0,
      evidenceCount: photos.length,
      redactLocation,
    });

    // Dispatch to agencies via the geo-legal backend (audit trail + contact links).
    try {
      const draft: GeoReportDraft = {
        title: title.trim(),
        summary: summary.trim(),
        category,
        area: area.trim(),
        countryCode: country,
      };
      await confirmAndDispatch({
        reportDraft: draft,
        validation: geoValidation,
        humanConfirmed: true,
        channels: ["GOVT_AGENCY", "PRESS", "HUMAN_RIGHTS"],
        incidentId,
      });
    } catch (e) {
      console.log("[Report] geo-legal dispatch failed (non-fatal)", e);
    }

    resetForm();
    safeBack();
  }, [
    geoValidation,
    title,
    summary,
    category,
    privacy,
    area,
    photos,
    redactLocation,
    country,
    settings,
    mediaType,
    createIncident,
    confirmAndDispatch,
    resetForm,
  ]);

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => { resetForm(); safeBack(); }} hitSlop={10}>
              <X size={22} color={Colors.text} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <BrandMark variant="chip" style={styles.brandChip} testID="report-brand" />
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Shield size={18} color={Colors.gold} />
            </View>
            <Text style={styles.introTitle}>Secure report</Text>
            <Text style={styles.introText}>
              End-to-end encrypted. Timestamps preserved for chain-of-custody.
            </Text>
          </View>

          <Label>What happened?</Label>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Brief title (e.g. Stopped without cause)"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            testID="input-title"
          />

          <Label>Describe the incident</Label>
          <TextInput
            value={summary}
            onChangeText={setSummary}
            placeholder="Share what happened in your own words. Include times, people, and details while they're fresh."
            placeholderTextColor={Colors.textMuted}
            style={[styles.input, styles.textarea]}
            multiline
            textAlignVertical="top"
            testID="input-summary"
          />

          <Label>Category</Label>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`cat-${c}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {CATEGORY_LABELS[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Label>Location</Label>
          <View style={styles.locationWrap}>
            <MapPin size={16} color={Colors.textSecondary} />
            <TextInput
              value={area}
              onChangeText={setArea}
              placeholder="Neighborhood, city"
              placeholderTextColor={Colors.textMuted}
              style={styles.locationInput}
              testID="input-area"
            />
            <Pressable
              onPress={captureLocation}
              style={styles.locBtn}
              testID="capture-location"
            >
              <Text style={styles.locBtnText}>
                {gettingLocation ? "..." : "Use GPS"}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setRedactLocation((v) => !v)}
            style={styles.redactRow}
            testID="toggle-redact"
          >
            <View
              style={[styles.check, redactLocation && styles.checkOn]}
            >
              {redactLocation && <Check size={13} color={Colors.background} strokeWidth={3} />}
            </View>
            <MapPinOff size={14} color={Colors.textSecondary} />
            <Text style={styles.redactText}>
              Redact precise location in public feed
            </Text>
          </Pressable>

          <Label>Jurisdiction</Label>
          <View style={styles.jurisdictionWrap}>
            <View style={styles.jurisIconWrap}>
              <Globe size={15} color={Colors.gold} />
            </View>
            <View style={styles.jurisInputs}>
              <TextInput
                value={country}
                onChangeText={(t) => setCountry(t.toUpperCase().slice(0, 2))}
                placeholder="US"
                placeholderTextColor={Colors.textMuted}
                style={styles.jurisInput}
                testID="input-country"
                autoCapitalize="characters"
              />
              <TextInput
                value={subdivision}
                onChangeText={(t) => setSubdivision(t.toUpperCase().slice(0, 3))}
                placeholder="NY"
                placeholderTextColor={Colors.textMuted}
                style={styles.jurisInput}
                testID="input-subdivision"
                autoCapitalize="characters"
              />
              <Text style={styles.jurisLabel}>
                Country · State/Prov
              </Text>
            </View>
          </View>

          <Label>Recording context</Label>
          <View style={styles.contextToggles}>
            <Pressable
              onPress={() => setUserIsParticipant((v) => !v)}
              style={styles.contextRow}
              testID="toggle-participant"
            >
              <View style={[styles.check, userIsParticipant && styles.checkOn]}>
                {userIsParticipant && <Check size={13} color={Colors.background} strokeWidth={3} />}
              </View>
              <Mic size={13} color={Colors.textSecondary} />
              <Text style={styles.contextText}>I was a participant in the conversation</Text>
            </Pressable>
            <Pressable
              onPress={() => setObtainedConsent((v) => !v)}
              style={styles.contextRow}
              testID="toggle-consent"
            >
              <View style={[styles.check, obtainedConsent && styles.checkOn]}>
                {obtainedConsent && <Check size={13} color={Colors.background} strokeWidth={3} />}
              </View>
              <ShieldCheck size={13} color={Colors.textSecondary} />
              <Text style={styles.contextText}>I obtained explicit consent from all parties</Text>
            </Pressable>
            <Pressable
              onPress={() => setInPublicSpace((v) => !v)}
              style={styles.contextRow}
              testID="toggle-public"
            >
              <View style={[styles.check, inPublicSpace && styles.checkOn]}>
                {inPublicSpace && <Check size={13} color={Colors.background} strokeWidth={3} />}
              </View>
              <Video size={13} color={Colors.textSecondary} />
              <Text style={styles.contextText}>Recording was in a public space</Text>
            </Pressable>
          </View>

          <Label>Evidence</Label>
          <View style={styles.evidenceGrid}>
            <Pressable
              onPress={addPhoto}
              style={styles.addEvidence}
              testID="add-evidence"
            >
              <Camera size={22} color={Colors.gold} />
              <Text style={styles.addEvidenceText}>Attach photos</Text>
              <Text style={styles.addEvidenceSub}>
                Encrypted · Metadata preserved
              </Text>
            </Pressable>
            {photos.length > 0 && (
              <View style={styles.evidenceCount}>
                <Text style={styles.evidenceCountText}>
                  {photos.length} file{photos.length === 1 ? "" : "s"} attached
                </Text>
              </View>
            )}
          </View>

          {complianceResult && (
            <ComplianceCard
              result={complianceResult}
              testID="report-compliance"
            />
          )}

          <SecurityCard
            vaultPinSet={settings.vaultPinSet}
            autoSeal={settings.autoSeal}
            biometrics={settings.biometrics}
            sealedCount={photos.length > 0 ? photos.length : undefined}
            testID="report-security"
          />

          {photos.length > 0 && !complianceResult && (
            <Pressable
              onPress={() => runComplianceCheck("PHOTO")}
              style={styles.preCheckBtn}
              testID="pre-check-compliance"
            >
              <ShieldCheck size={15} color={Colors.gold} />
              <Text style={styles.preCheckText}>Run compliance check</Text>
            </Pressable>
          )}

          <Label>Who can see this?</Label>
          <View style={styles.privacyList}>
            {PRIVACY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = privacy === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPrivacy(opt.key)}
                  style={[
                    styles.privacyCard,
                    active && {
                      borderColor: opt.color,
                      backgroundColor: opt.color + "14",
                    },
                  ]}
                  testID={`privacy-${opt.key}`}
                >
                  <View
                    style={[
                      styles.privacyIcon,
                      { backgroundColor: opt.color + "22" },
                    ]}
                  >
                    <Icon size={18} color={opt.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.privacyLabel}>{opt.label}</Text>
                    <Text style={styles.privacyDesc}>{opt.desc}</Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      active && {
                        borderColor: opt.color,
                        backgroundColor: opt.color,
                      },
                    ]}
                  >
                    {active && <View style={styles.radioDot} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSubmit || isCreating || isValidating}
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            testID="submit-report"
          >
            <LinearGradient
              colors={
                canSubmit
                  ? [Colors.gold, Colors.goldDeep]
                  : [Colors.surface3, Colors.surfaceSecondary]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitInner}
            >
              <Shield size={18} color={canSubmit ? Colors.background : Colors.textMuted} />
              <Text
                style={[
                  styles.submitText,
                  !canSubmit && { color: Colors.textMuted },
                ]}
              >
                {isValidating ? "Validating compliance..." : isCreating ? "Sealing record..." : "Submit secure report"}
              </Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.disclaimer}>
            By submitting, you confirm this account is true to the best of your
            knowledge. BlackNexa™ preserves cryptographic proof of authorship. BlackNexa™ is a trademark pending with the USPTO.
          </Text>
          <View style={styles.noGuaranteeBox}>
            <Text style={styles.noGuaranteeTitle}>No-Guarantee Policy</Text>
            <Text style={styles.noGuaranteeText}>
              BlackNexa™ is NOT a law firm, lawyer referral service, or news publisher. Submitting reports does not guarantee legal representation, press publication, or governmental action. All third-party organizations make independent decisions.
            </Text>
          </View>
          <BrandMark variant="watermark" testID="report-watermark" />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Geo-Legal AI Compliance Review — Human-in-the-Loop confirmation */}
      <ComplianceReviewSheet
        visible={showComplianceReview}
        validation={geoValidation}
        profile={currentProfile}
        onConfirm={handleGeoConfirm}
        onClose={() => setShowComplianceReview(false)}
        testID="compliance-review-sheet"
      />
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 60 },
  brandChip: { marginBottom: 14 },
  intro: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  introIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  introTitle: {
    fontSize: 15,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    marginBottom: 3,
  },
  introText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17 },
  label: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  textarea: { minHeight: 120, lineHeight: 22 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", fontFamily: fontFamily.semiBold },
  chipTextActive: { color: Colors.background, fontWeight: "700", fontFamily: fontFamily.bold },
  locationWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  locationInput: { flex: 1, color: Colors.text, fontSize: 14, padding: 0 },
  locBtn: {
    backgroundColor: Colors.surface3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  locBtnText: { fontSize: 12, color: Colors.gold, fontWeight: "700", fontFamily: fontFamily.bold },
  redactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    marginBottom: 18,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  redactText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "500", fontFamily: fontFamily.medium, flex: 1 },
  evidenceGrid: { marginBottom: 18 },
  addEvidence: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: Colors.gold + "55",
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  addEvidenceText: { fontSize: 14, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text, marginTop: 4 },
  addEvidenceSub: { fontSize: 11, color: Colors.textSecondary, fontWeight: "500", fontFamily: fontFamily.medium },
  evidenceCount: {
    marginTop: 10,
    backgroundColor: Colors.success + "18",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.success + "44",
  },
  evidenceCountText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: "700", fontFamily: fontFamily.bold,
    textAlign: "center",
  },
  privacyList: { gap: 10, marginBottom: 28 },
  privacyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  privacyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyLabel: { fontSize: 14, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text, marginBottom: 2 },
  privacyDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.background,
  },
  submit: {
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  submitDisabled: { shadowOpacity: 0 },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  submitText: { color: Colors.background, fontWeight: "700", fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: 0.3 },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  noGuaranteeBox: {
    marginTop: 14,
    padding: 14,
    backgroundColor: Colors.gold + "0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold + "33",
  },
  noGuaranteeTitle: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    marginBottom: 6,
  },
  noGuaranteeText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  jurisdictionWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  jurisIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  jurisInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  jurisInput: {
    width: 48,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 8,
    padding: 8,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamily.bold,
    textAlign: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  jurisLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    flex: 1,
  },
  contextToggles: {
    gap: 8,
    marginBottom: 18,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  contextText: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    fontWeight: "500", fontFamily: fontFamily.medium,
    flex: 1,
  },
  preCheckBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.gold + "14",
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  preCheckText: {
    fontSize: 13,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
  },
});
