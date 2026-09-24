/**
 * The tab bar's centre slot, as a route.
 *
 * The centre button never focuses this route — it pushes the wizard modal over
 * the current tab (`(tabs)/_layout.tsx`). A deep link can still land here, and a
 * plain redirect to `/report` would fire again every time this tab regained focus,
 * reopening the wizard the moment it was closed. So a visit moves the tab bar to
 * Home first, then opens the wizard over it: closing the wizard lands on the feed.
 */

import React, { useCallback } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { colors, useThemeSync } from "@/constants/theme";

export default function CentreSlot(): React.ReactElement {
  useThemeSync();

  useFocusEffect(
    useCallback(() => {
      router.navigate("/(tabs)");
      router.push("/report");
    }, []),
  );

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
