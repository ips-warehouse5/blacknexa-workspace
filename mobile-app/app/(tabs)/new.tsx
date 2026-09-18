/**
 * Placeholder for the tab bar's centre slot.
 *
 * The route keeps the fifth tab slot selectable while its report-wizard action is
 * temporarily paused with the rest of the tab content.
 */

import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, useThemeSync } from "@/constants/theme";
import ComingSoon from "@/components/ui/ComingSoon";
import TabHeader from "@/components/TabHeader";

export default function CentreSlot(): React.ReactElement {
  useThemeSync();
  const insets = useSafeAreaInsets();
  // TODO(Centre Slot): Re-enable the report-wizard action when report development resumes.
  // return <Redirect href="/report" />;
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      <TabHeader />
      <ComingSoon />
    </View>
  );
}
