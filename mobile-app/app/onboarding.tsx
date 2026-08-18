import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { Check, ChevronRight, Lock, ShieldCheck, Sparkles } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import { LEGAL_VERSION } from "@/constants/legal";
import { useSettings } from "@/providers/SettingsProvider";

export default function OnboardingScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { updateMany } = useSettings();
  const [tos, setTos] = useState<boolean>(false);
  const [privacy, setPrivacy] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const canContinue = tos && privacy && !isSubmitting;

  const accept = useCallback(async () => {
    if (!canContinue || isSubmitting) return;
    setIsSubmitting(true);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    }

    try {
      await updateMany({
        consentTos: true,
        consentPrivacy: true,
        consentVersion: LEGAL_VERSION,
        consentTimestamp: Date.now(),
      });
      router.replace("/(tabs)");
    } catch (e) {
      console.error("[Onboarding] consent error:", e);
      setIsSubmitting(false);
    }
  }, [canContinue, isSubmitting, updateMany]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
          testID="onboarding-screen"
        >
          <BrandMark variant="header" style={styles.brand} testID="onboarding-brand" />

          <Text style={styles.title}>{"Welcome to BlackNexa\u2122"}</Text>
          <Text style={styles.subtitle}>
            A privacy-first civic platform built for the community, by the
            community. Document. Preserve. Connect to trusted support.
          </Text>

          <View style={styles.pillarRow}>
            <Pillar
              icon={<ShieldCheck size={16} color={Colors.gold} />}
              label="Encrypted"
            />
            <Pillar
              icon={<Lock size={16} color={Colors.violet} />}
              label="You control sharing"
            />
            <Pillar
              icon={<Sparkles size={16} color={Colors.emerald} />}
              label="Built for equity"
            />
          </View>

          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>Before you begin</Text>
            <Text style={styles.consentSub}>
              Please review and agree to continue. You can revisit these any
              time from your Profile.
            </Text>

            <ConsentRow
              checked={tos}
              onToggle={() => setTos((v) => !v)}
              label="I agree to the Terms of Service"
              linkLabel="Read terms"
              onPressLink={() => router.push("/legal/terms")}
              testID="consent-tos"
            />
            <View style={styles.divider} />
            <ConsentRow
              checked={privacy}
              onToggle={() => setPrivacy((v) => !v)}
              label="I agree to the Privacy Policy"
              linkLabel="Read policy"
              onPressLink={() => router.push("/legal/privacy")}
              testID="consent-privacy"
            />
          </View>

          <Pressable
            onPress={accept}
            disabled={!canContinue}
            style={[styles.cta, !canContinue && styles.ctaDisabled]}
            testID="onboarding-continue"
          >
            <LinearGradient
              colors={
                canContinue
                  ? [Colors.gold, Colors.goldDeep]
                  : [Colors.surface3, Colors.surface2]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaInner}
            >
              <Text
                style={[
                  styles.ctaText,
                  !canContinue && { color: Colors.textMute },
                ]}
              >
                Continue
              </Text>
              <ChevronRight
                size={18}
                color={canContinue ? Colors.bg : Colors.textMute}
              />
            </LinearGradient>
          </Pressable>

          <Text style={styles.tm}>
            {"BlackNexa\u2122 is a trademark of BlackNexa with an application pending before the USPTO. \u00a9 "}
            {new Date().getFullYear()}
            {" BlackNexa. All rights reserved."}
          </Text>
        </ScrollView>
      </View>
    </>
  );
}

function Pillar({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={styles.pillar}>
      <View style={styles.pillarIcon}>{icon}</View>
      <Text style={styles.pillarText}>{label}</Text>
    </View>
  );
}

function ConsentRow({
  checked,
  onToggle,
  label,
  linkLabel,
  onPressLink,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  linkLabel: string;
  onPressLink: () => void;
  testID: string;
}) {
  return (
    <View style={styles.consentRow}>
      <Pressable
        onPress={onToggle}
        style={styles.consentTouchable}
        testID={testID}
      >
        <View style={[styles.check, checked && styles.checkOn]}>
          {checked && <Check size={13} color={Colors.bg} strokeWidth={3} />}
        </View>
        <Text style={styles.consentLabel}>{label}</Text>
      </Pressable>
      <Pressable onPress={onPressLink} hitSlop={8}>
        <Text style={styles.consentLink}>{linkLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22 },
  brand: { alignSelf: "center", marginBottom: 26 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textDim,
    lineHeight: 22,
    marginBottom: 22,
  },
  pillarRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 22,
  },
  pillar: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 6,
  },
  pillarIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarText: {
    fontSize: 11,
    color: Colors.textDim,
    fontWeight: "700",
    textAlign: "center",
  },
  consentCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 22,
  },
  consentTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  consentSub: {
    fontSize: 12.5,
    color: Colors.textDim,
    lineHeight: 18,
    marginBottom: 14,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  consentTouchable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  consentLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: "600",
  },
  consentLink: {
    fontSize: 12,
    color: Colors.gold,
    fontWeight: "800",
    textDecorationLine: "underline",
    marginLeft: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  cta: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaDisabled: { shadowOpacity: 0 },
  ctaInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  ctaText: {
    color: Colors.bg,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  tm: {
    fontSize: 10.5,
    lineHeight: 16,
    color: Colors.textMute,
    textAlign: "center",
    marginTop: 22,
    fontWeight: "500",
  },
});
