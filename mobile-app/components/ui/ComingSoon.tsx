import React from "react";
import { View, useWindowDimensions } from "react-native";
import { colors, layout, screenPadding } from "@/constants/theme";
import { COMING_SOON_LABEL } from "@/lib/ui/coming-soon";
import Text from "@/components/ui/Text";

export default function ComingSoon(): React.ReactElement {
  const { width } = useWindowDimensions();
  const isTablet = width >= layout.tabletBreakpoint;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: isTablet ? screenPadding.tablet : screenPadding.hero,
      }}
      accessibilityRole="text"
    >
      <Text
        variant="sectionTitle"
        color={colors.t2}
        center
        style={{ maxWidth: isTablet ? layout.readableMaxWidth : undefined }}
      >
        {COMING_SOON_LABEL}
      </Text>
    </View>
  );
}
