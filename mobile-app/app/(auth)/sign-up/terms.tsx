/**
 * A7 · Create account, step 2 of 4 — Terms and Privacy.
 *
 * The caption is the specification: "Each checkbox unlocks only once its own
 * document is read to the end, and states its consequence under the label."
 *
 * So the two checkboxes are gated independently on the scroll position of their
 * own tab, and the scroll-progress rail beside the document is what tells someone
 * how much is left. The consent is recorded server-side after A8, because there
 * is no account to attach it to until the code is accepted.
 */

import React, { useCallback, useRef, useState } from "react";
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { Screen, BackHeader, StickyFooter } from "@/components/ui/Screen";
import { StepHeader } from "@/components/ui/Progress";
import { CheckboxRow, SegmentedControl } from "@/components/ui/Controls";
import { LEGAL_VERSION, TERMS_SECTIONS, PRIVACY_SECTIONS } from "@/constants/legal-copy";

type Tab = "tos" | "privacy";

/** Treat "within 24px of the bottom" as read — an exact match never fires. */
const BOTTOM_SLACK = 24;

export default function SignUpTermsScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ resendAfter?: string }>();
  const [tab, setTab] = useState<Tab>("tos");
  const [readTos, setReadTos] = useState(false);
  const [readPrivacy, setReadPrivacy] = useState(false);
  const [agreedTos, setAgreedTos] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const scrollable = Math.max(1, contentSize.height - layoutMeasurement.height);
      setProgress(Math.min(1, Math.max(0, contentOffset.y / scrollable)));

      const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - BOTTOM_SLACK;
      if (!atEnd) return;
      // Reaching the end unlocks that document's checkbox — and only that one.
      if (tab === "tos") setReadTos(true);
      else setReadPrivacy(true);
    },
    [tab],
  );

  /** Switching tabs resets the rail, since it now measures a different document. */
  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    setProgress(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const submit = useCallback(() => {
    // Continue is never disabled, so it explains what is missing instead.
    if (!agreedTos || !agreedPrivacy) {
      const pending: string[] = [];
      if (!agreedTos) pending.push(readTos ? "agree to the Terms" : "read the Terms to the end");
      if (!agreedPrivacy) {
        pending.push(readPrivacy ? "agree to the Privacy Policy" : "read the Privacy tab to the end");
      }
      setProblem(`Still to do: ${pending.join(", and ")}.`);
      if (!readTos) switchTab("tos");
      else if (!readPrivacy) switchTab("privacy");
      return;
    }
    setProblem(null);
    router.push({
      pathname: "/(auth)/sign-up/verify",
      params: { resendAfter: params.resendAfter ?? "30" },
    });
  }, [agreedPrivacy, agreedTos, params.resendAfter, readPrivacy, readTos, switchTab]);

  const sections = tab === "tos" ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <Screen padding={0} testID="signup-terms">
      <View style={{ paddingHorizontal: screenPadding.detail }}>
        <BackHeader title="Create account" onBack={() => router.back()} padding={0} />
        <StepHeader step={2} total={4} name="Terms" />
      </View>

      <View style={{ flex: 1, paddingHorizontal: screenPadding.detail, paddingTop: 20 }}>
        <SegmentedControl<Tab>
          variant="tabs"
          height={38}
          value={tab}
          onChange={switchTab}
          options={[
            { value: "tos", label: "Terms" },
            { value: "privacy", label: "Privacy" },
          ]}
        />

        <View style={{ flex: 1, flexDirection: "row", gap: 12, marginTop: 12, ...docPane }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            onScroll={onScroll}
            scrollEventThrottle={32}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((section, index) => (
              <View key={section.heading} style={{ marginTop: index === 0 ? 0 : 18 }}>
                <Text variant="cardTitleSm" color={colors.t0}>
                  {section.heading}
                </Text>
                <Text variant="bodySm" color={colors.t2} style={{ marginTop: 8, lineHeight: 21 }}>
                  {section.body}
                </Text>
              </View>
            ))}
            {/* Padding so the last line clears the fade and the end is reachable. */}
            <View style={{ height: 12 }} />
          </ScrollView>

          {/* The 3px scroll-progress rail from the artboard. */}
          <View style={railTrack}>
            <View style={[railFill, { height: `${Math.max(8, progress * 100)}%` }]} />
          </View>
        </View>

        <View style={{ gap: 12, marginTop: 14 }}>
          <CheckboxRow
            checked={agreedTos}
            onToggle={() => setAgreedTos((value) => !value)}
            locked={!readTos}
            title="I agree to the Terms of Service"
            description={
              readTos
                ? "This is the agreement between you and BlackNexa."
                : "Unlocks once you have read the Terms tab to the end."
            }
            testID="consent-tos"
          />
          <CheckboxRow
            checked={agreedPrivacy}
            onToggle={() => setAgreedPrivacy((value) => !value)}
            locked={!readPrivacy}
            title="I agree to the Privacy Policy"
            description={
              readPrivacy
                ? "How your reports and evidence are stored and shared."
                : "Unlocks once you have read the Privacy tab to the end."
            }
            testID="consent-privacy"
          />
        </View>

        {problem ? (
          <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 10 }}>
            {problem}
          </Text>
        ) : null}
      </View>

      <StickyFooter padding={screenPadding.detail}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="Back"
            variant="quiet"
            block={false}
            height={52}
            style={{ width: 96 }}
            onPress={() => router.back()}
          />
          <Button
            label="Continue"
            onPress={submit}
            style={{ flex: 1 }}
            testID="terms-continue"
          />
        </View>
      </StickyFooter>
    </Screen>
  );
}

/** Kept out of StyleSheet so the flex child can be spread inline. */
const docPane = {
  backgroundColor: colors.s3,
  borderRadius: radius.xl,
  paddingTop: 16,
  paddingBottom: 16,
  paddingLeft: 16,
  paddingRight: 14,
} as const;

const railTrack = {
  width: 3,
  borderRadius: 2,
  backgroundColor: alpha(colors.t0, 0.08),
  overflow: "hidden",
} as const;

const railFill = {
  width: 3,
  borderRadius: 2,
  backgroundColor: colors.acc,
} as const;

export { LEGAL_VERSION };
