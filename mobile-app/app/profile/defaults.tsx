/**
 * Profile → Defaults for a new report. `DERIVED`.
 *
 * The three defaults C4, C6 and D4 read. Each keeps the consequence sentence from
 * the screen it feeds, so the same choice reads the same way wherever it is made.
 */

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { SegmentedControl, SwitchRow } from "@/components/ui/Controls";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { ConsequenceCard, SectionLabel } from "@/components/report/WizardShell";
import { useAuth } from "@/providers/AuthProvider";
import type { LocationPrecision, Visibility } from "@/lib/api/auth";

/** C6's own words. */
const VISIBILITY: { value: Visibility; title: string; consequence: string }[] = [
  {
    value: "public",
    title: "Public",
    consequence: "Anyone in the community feed. Others can corroborate it.",
  },
  { value: "trusted", title: "Trusted Circle", consequence: "Verified advocates only." },
  { value: "private", title: "Private", consequence: "Only you." },
];

export default function DefaultsScreen(): React.ReactElement {
  const { user, updateProfile, busy } = useAuth();
  const prefs = user?.preferences;

  const [visibility, setVisibility] = useState<Visibility>(prefs?.defaultVisibility ?? "trusted");
  const [precision, setPrecision] = useState<LocationPrecision>(
    prefs?.defaultPrecision ?? "approximate",
  );
  const [anonymous, setAnonymous] = useState(prefs?.anonymousByDefault ?? false);

  const save = useCallback(async () => {
    const ok = await updateProfile({
      defaultVisibility: visibility,
      defaultPrecision: precision,
      anonymousByDefault: anonymous,
    });
    if (ok) router.back();
  }, [anonymous, precision, updateProfile, visibility]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="profile-defaults"
      footer={<Button label="Save" onPress={save} loading={busy} testID="save-defaults" />}
    >
      <BackHeader title="Defaults" onBack={() => router.back()} padding={0} />

      <Text variant="bodySm" color={colors.t2} style={{ marginTop: 16, lineHeight: 21 }}>
        These pre-fill a new report. You can change any of them per report, and the
        wizard always shows you what a choice means before you commit.
      </Text>

      <SectionLabel style={{ marginTop: 22 }}>WHO SEES A NEW REPORT</SectionLabel>
      <View style={{ gap: 9, marginTop: 10 }}>
        {VISIBILITY.map((option) => (
          <ConsequenceCard
            key={option.value}
            title={option.title}
            consequence={option.consequence}
            selected={visibility === option.value}
            onPress={() => setVisibility(option.value)}
            testID={`default-visibility-${option.value}`}
          />
        ))}
      </View>

      <SectionLabel style={{ marginTop: 22 }}>LOCATION PRECISION</SectionLabel>
      <SegmentedControl<LocationPrecision>
        options={[
          { value: "exact", label: "Exact" },
          { value: "approximate", label: "Approximate" },
          { value: "hidden", label: "Hidden" },
        ]}
        value={precision}
        onChange={setPrecision}
        style={{ marginTop: 10 }}
      />
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 9, lineHeight: 17 }}>
        {precision === "exact"
          ? "Publishes the spot you pick, rounded to about 100 m."
          : precision === "approximate"
            ? "Publishes an area about 500 m across."
            : "Publishes no coordinates at all — only an area name if you give one."}
      </Text>
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 6, lineHeight: 17 }}>
        C4 labels this as your default but never pre-selects it, so each report stays
        a fresh decision.
      </Text>

      <SwitchRow
        title="File anonymously by default"
        description="Reports publish without your name or photo. Moderators can still see who filed them."
        value={anonymous}
        onValueChange={setAnonymous}
        style={{ marginTop: 22 }}
        testID="default-anonymous"
      />
    </ScrollScreen>
  );
}
