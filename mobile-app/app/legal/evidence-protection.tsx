import React from "react";
import { router } from "expo-router";
import { screenPadding, useThemeSync } from "@/constants/theme";
import ComingSoon from "@/components/ui/ComingSoon";
import { BackHeader, Screen } from "@/components/ui/Screen";

export default function EvidenceProtectionScreen(): React.ReactElement {
  useThemeSync();
  return (
    <Screen padding={screenPadding.detail} testID="evidence-protection-coming-soon">
      <BackHeader
        title="How BlackNexa protects your evidence"
        onBack={() => router.back()}
        padding={0}
      />
      <ComingSoon />
    </Screen>
  );
}
