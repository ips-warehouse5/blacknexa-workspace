/**
 * C6 · Step 6 of 7 — Flags.
 *
 * From the caption: "The urgent card prints its consequence whether the switch is
 * on or off, and a live mini card shows exactly what the feed will show."
 *
 * Both halves matter. The urgent switch has a real cost — it puts a report in front
 * of a moderator within the hour — so the card states what each position means
 * rather than only what "on" does. And the mini card is the last chance to notice
 * that a report is about to publish under a real name.
 */

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { CategoryDot, Switch, SwitchRow } from "@/components/ui/Controls";
import { StatusPill } from "@/components/report/StatusPill";
import { WizardShell, ConsequenceCard, SectionLabel, cardHairline } from "@/components/report/WizardShell";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";
import { useAuth } from "@/providers/AuthProvider";
import { CATEGORY_META, type Visibility } from "@/lib/api/reports";

/** The three visibility cards, each with the consequence C6 prints. */
const VISIBILITY: { value: Visibility; title: string; consequence: string }[] = [
  {
    value: "public",
    title: "Public",
    consequence: "Anyone in the community feed. Others can corroborate it.",
  },
  { value: "trusted", title: "Trusted Circle", consequence: "Verified advocates only." },
  { value: "private", title: "Private", consequence: "Only you." },
];

export default function FlagsStep(): React.ReactElement {
  const { payload, patch, setStep, savedAt } = useReportDraft();
  const { user } = useAuth();
  const exit = useWizardExit();

  // Pre-filled from the profile default — the resolved decision from the plan:
  // visibility is a field the user already set deliberately on A9.
  const [urgent, setUrgent] = useState(payload.urgent ?? false);
  const [visibility, setVisibility] = useState<Visibility>(
    payload.visibility ?? user?.preferences.defaultVisibility ?? "trusted",
  );
  const [anonymous, setAnonymous] = useState(
    payload.anonymous ?? user?.preferences.anonymousByDefault ?? false,
  );
  const [problem, setProblem] = useState<string | null>(null);

  const commit = useCallback(
    (next: { urgent?: boolean; visibility?: Visibility; anonymous?: boolean }) => {
      patch({
        urgent: next.urgent ?? urgent,
        visibility: next.visibility ?? visibility,
        anonymous: next.anonymous ?? anonymous,
      });
    },
    [anonymous, patch, urgent, visibility],
  );

  const next = useCallback(() => {
    if (!visibility) {
      setProblem("Choose who can see this report.");
      return;
    }
    commit({});
    setStep(7);
    router.push("/report/review");
  }, [commit, setStep, visibility]);

  const publishedName = anonymous ? "Anonymous" : user?.displayName?.trim() || "Anonymous";
  const category = payload.category;

  return (
    <WizardShell
      step={6}
      stepName="Flags"
      savedAt={savedAt}
      onClose={exit}
      onBack={() => router.back()}
      onNext={next}
      problem={problem}
      testID="wizard-flags"
    >
      {/* The urgent card, stating its consequence in both positions. */}
      <View style={styles.urgentCard}>
        <View style={styles.urgentHead}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
            <WarningGlyph />
            <Text variant="labelLg" color={colors.t0}>
              Mark as urgent
            </Text>
          </View>
          <Switch
            value={urgent}
            onValueChange={(value) => {
              setUrgent(value);
              commit({ urgent: value });
            }}
            accessibilityLabel="Mark as urgent"
            testID="mark-urgent"
          />
        </View>
        <Text variant="bodyXs" color={colors.t2} style={styles.urgentConsequence}>
          {urgent
            ? "On: a moderator sees it within the hour and it carries an Urgent badge in the feed."
            : "Off: it joins the normal review queue, usually a day."}
        </Text>
      </View>

      <SectionLabel style={{ marginTop: 20 }}>WHO CAN SEE IT</SectionLabel>
      <View style={{ gap: 9, marginTop: 10 }}>
        {VISIBILITY.map((option) => (
          <ConsequenceCard
            key={option.value}
            title={option.title}
            consequence={option.consequence}
            selected={visibility === option.value}
            onPress={() => {
              setVisibility(option.value);
              setProblem(null);
              commit({ visibility: option.value });
            }}
            testID={`visibility-${option.value}`}
          />
        ))}
      </View>

      <SwitchRow
        title="File anonymously"
        description="Your report is published without your name or photo. It still counts toward the community."
        value={anonymous}
        onValueChange={(value) => {
          setAnonymous(value);
          commit({ anonymous: value });
        }}
        style={{ marginTop: 12 }}
        testID="file-anonymously"
      />

      {/* The live mini card — the last chance to notice what will publish. */}
      <SectionLabel style={{ marginTop: 20 }}>HOW OTHERS WILL SEE IT</SectionLabel>
      <View style={styles.preview}>
        <View style={styles.previewHead}>
          <View style={styles.previewAvatar} />
          <View style={{ flex: 1 }}>
            <Text variant="labelSm" color={colors.t0}>
              {publishedName}
            </Text>
            <Text variant="metaSm" color={colors.t4} style={{ fontSize: 10.5 }}>
              {`${payload.locationLabel || "Your area"} · now`}
            </Text>
          </View>
          {urgent ? <StatusPill kind="urgent" /> : null}
        </View>
        <Text variant="cardTitleSm" color={colors.t0} style={{ marginTop: 8, fontSize: 15 }}>
          {payload.title?.trim() || "Your title will appear here"}
        </Text>
        {category ? (
          <View style={styles.previewCategory}>
            <CategoryDot color={colors[CATEGORY_META[category].token]} size={6} />
            <Text variant="metaSm" color={colors.t2}>
              {CATEGORY_META[category].label}
            </Text>
          </View>
        ) : null}
      </View>
    </WizardShell>
  );
}

/** The red warning triangle on C6's urgent card. */
function WarningGlyph(): React.ReactElement {
  return (
    <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 8,
          borderRightWidth: 8,
          borderBottomWidth: 14,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: alpha(colors.bad, 0.18),
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 7,
          width: 1.6,
          height: 4,
          backgroundColor: colors.bad2,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 13,
          width: 1.6,
          height: 1.6,
          borderRadius: 1,
          backgroundColor: colors.bad2,
        }}
      />
    </View>
  );
}

const styles = {
  urgentCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  urgentHead: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  urgentConsequence: {
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: cardHairline,
    lineHeight: 18,
  },

  preview: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    padding: 13,
    marginTop: 9,
    borderWidth: 1,
    borderColor: cardHairline,
  },
  previewHead: { flexDirection: "row" as const, alignItems: "center" as const, gap: 9 },
  previewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.s6,
  },
  previewCategory: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 8,
  },
};
