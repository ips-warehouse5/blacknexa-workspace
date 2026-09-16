import React from "react";
import { View } from "react-native";
import { colors } from "@/constants/theme";
import { COMING_SOON_LABEL } from "@/lib/ui/coming-soon";
import Text from "@/components/ui/Text";

export default function ComingSoon(): React.ReactElement {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      accessibilityRole="text"
    >
      <Text variant="sectionTitle" color={colors.t2} center>
        {COMING_SOON_LABEL}
      </Text>
    </View>
  );
}
