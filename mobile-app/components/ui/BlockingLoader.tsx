/**
 * Full-screen interaction blocker for brief handoff states.
 *
 * Use this when a flow has left the current screen logically complete, but the
 * next screen is still mounting or an external auth/payment sheet is handing
 * control back to the app. It prevents double taps and route changes while
 * giving the user a clear, common loading surface.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

export interface BlockingLoaderProps {
  visible: boolean;
  message?: string;
}

export function BlockingLoader({
  visible,
  message = "Please wait…",
}: BlockingLoaderProps): React.ReactElement | null {
  if (!visible) return null;

  return (
    <View
      style={styles.overlay}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <View style={styles.loader}>
        <ActivityIndicator color={colors.acc} size="small" />
        <Text variant="labelSm" color={colors.t1}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: alpha(colors.bg, 0.78),
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loader: {
    alignItems: "center",
    backgroundColor: colors.s2,
    borderColor: alpha(colors.t0, 0.08),
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 18,
    shadowColor: colors.deep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
});

export default BlockingLoader;
