/**
 * C1 · Step 1 of 7 — "What kind of thing happened?"
 *
 * From the caption: "Nine rows, nothing pre-selected. The dot is the only colour;
 * the one-liner is there so nobody has to guess what a word covers."
 *
 * Nothing pre-selected matters: pre-picking Policing would nudge every report
 * toward it, and the one-liners exist because "Profiling" and "Harassment" overlap
 * in ordinary speech.
 */

import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { colors } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { CategoryDot } from "@/components/ui/Controls";
import { WizardShell } from "@/components/report/WizardShell";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { CATEGORY_META, CATEGORY_ORDER, type ReportCategory } from "@/lib/api/reports";
import { useWizardExit } from "@/components/report/useWizardExit";

export default function CategoryStep(): React.ReactElement {
  const { payload, patch, setStep, savedAt } = useReportDraft();
  const [problem, setProblem] = useState<string | null>(null);
  const exit = useWizardExit();

  const choose = useCallback(
    (category: ReportCategory) => {
      setProblem(null);
      patch({ category });
    },
    [patch],
  );

  const next = useCallback(() => {
    if (!payload.category) {
      // The rule in words, per the section caption — not a disabled button.
      setProblem("Choose the kind of thing that happened.");
      return;
    }
    setStep(2);
    router.push("/report/details");
  }, [payload.category, setStep]);

  return (
    <WizardShell
      step={1}
      stepName="Category"
      savedAt={savedAt}
      onClose={exit}
      onNext={next}
      problem={problem}
      testID="wizard-category"
    >
      <Text variant="displayXs" color={colors.t0}>
        What kind of thing happened?
      </Text>

      <View style={{ marginTop: 16, gap: 2 }}>
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const selected = payload.category === category;
          return (
            <Pressable
              key={category}
              onPress={() => choose(category)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${meta.label}. ${meta.hint}`}
              testID={`category-${category}`}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 6,
                  borderRadius: 12,
                  // The selected row gets a tint rather than a fill: the dot is
                  // the only place category colour is allowed.
                  backgroundColor: selected ? colors.s4 : "transparent",
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <CategoryDot color={colors[meta.token]} size={8} />
              <View style={{ flex: 1 }}>
                <Text variant="labelLg" color={colors.t0} style={{ fontSize: 14.5 }}>
                  {meta.label}
                </Text>
                <Text variant="metaSm" color={colors.t3} style={{ marginTop: 1, fontSize: 12 }}>
                  {meta.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </WizardShell>
  );
}
