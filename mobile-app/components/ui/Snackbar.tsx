/**
 * The single visual for transient feedback app-wide: a dark pill, centred above
 * the bottom safe area, sized to its message.
 *
 * Presentational only — `providers/SnackbarProvider.tsx` owns the queue, timing
 * and the `useSnackbar().showSnackbar(...)` API screens call into.
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";

export type SnackbarType = "success" | "error" | "warning" | "info";

export interface SnackbarData {
  id: number;
  message: string;
  type: SnackbarType;
  duration: number;
}

const ICONS: Record<SnackbarType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ICON_COLORS: Record<SnackbarType, string> = {
  success: colors.ok,
  error: colors.bad,
  warning: colors.warn,
  info: colors.acc,
};

export function Snackbar({
  data,
  visible,
}: {
  data: SnackbarData | null;
  visible: boolean;
}): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    Animated.timing(translateY, {
      toValue: visible ? 0 : 8,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity, translateY]);

  if (!data) return null;

  const Icon = ICONS[data.type];

  return (
    <View
      style={[styles.host, { bottom: insets.bottom + 16 }]}
      pointerEvents="none"
    >
      <Animated.View
        style={[styles.pill, { opacity, transform: [{ translateY }] }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Icon size={18} color={ICON_COLORS[data.type]} strokeWidth={2.25} />
        <Text variant="bodySm" color="#FFFFFF" style={styles.message}>
          {data.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
    backgroundColor: colors.deep,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: alpha("#FFFFFF", 0.08),
    shadowColor: colors.deep,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  message: {
    flexShrink: 1,
    lineHeight: 19,
  },
});

export default Snackbar;
