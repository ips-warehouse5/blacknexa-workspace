/**
 * A12 · Coach marks.
 *
 * From the caption: "Four steps over the real Home feed — accent-ringed cut-out,
 * step dots, and a Skip that is always reachable."
 *
 * The artboard draws the feed at `opacity .5` beneath a `rgba(deep,.78)` scrim.
 * Rendering the *real* feed under it would be the truest reading, but it would
 * also mount the feed's queries and its own tour-less state while a modal covers
 * it. So the backdrop is a faithful skeleton of the feed's geometry at the same
 * opacity, and the cut-out ring is positioned against the tab bar's real
 * measurements rather than the artboard's absolute values.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";

interface Step {
  title: string;
  body: string;
  /** Where the accent ring sits. */
  target: "tabCentre" | "header" | "filters" | "card";
}

const STEPS: Step[] = [
  {
    title: "Everything filed near you, in one place",
    body: "The feed shows what people in your area have reported. Filters stay pinned so you never lose your place.",
    target: "filters",
  },
  {
    title: "Search and notifications live up here",
    body: "Four kinds of notification only, and a search that tells you which field matched.",
    target: "header",
  },
  {
    title: "File from anywhere in the app",
    body: "The centre button opens a report over whatever you were doing. It saves a draft as you go, so you can stop at any step.",
    target: "tabCentre",
  },
  {
    title: "Stand with a report",
    body: "One tap says you believe someone. Corroborate says it happened to you too.",
    target: "card",
  },
];

export default function TourScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];

  const finish = useCallback(() => router.replace("/(tabs)"), []);

  const next = useCallback(() => {
    if (index >= STEPS.length - 1) {
      finish();
      return;
    }
    setIndex(index + 1);
  }, [finish, index]);

  /** The ring's position, derived from real insets rather than artboard offsets. */
  const ring = useMemo(() => {
    const tabBarHeight = 86;
    switch (step.target) {
      case "tabCentre":
        return {
          bottom: Math.max(insets.bottom, 12) + tabBarHeight - 78,
          alignSelf: "center" as const,
          width: 74,
          height: 74,
          borderRadius: 24,
        };
      case "header":
        return {
          top: insets.top + 2,
          right: 12,
          width: 92,
          height: 40,
          borderRadius: 14,
        };
      case "filters":
        return {
          top: insets.top + 52,
          left: 10,
          right: 10,
          height: 46,
          borderRadius: 16,
        };
      default:
        return {
          top: insets.top + 116,
          left: 12,
          right: 12,
          height: 190,
          borderRadius: 20,
        };
    }
  }, [insets.bottom, insets.top, step.target]);

  return (
    <View style={styles.root}>
      {/* Feed geometry at the artboard's .5 opacity. */}
      <View style={[styles.backdrop, { paddingTop: insets.top }]}>
        <View style={styles.fakeHeader}>
          <View style={styles.fakeAvatar} />
          <Text variant="cardTitle" color={colors.t0} style={{ fontSize: 18 }}>
            BlackNexa
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={styles.fakeIcon} />
            <View style={styles.fakeIcon} />
          </View>
        </View>
        <View style={styles.fakeChips}>
          <View style={[styles.fakeChip, { width: 78 }]} />
          <View style={[styles.fakeChip, { width: 96 }]} />
          <View style={[styles.fakeChip, { width: 88 }]} />
        </View>
        <View style={styles.fakeCard} />
        <View style={styles.fakeCard} />
      </View>

      <View style={styles.scrim} />

      {/* The accent-ringed cut-out. */}
      <View pointerEvents="none" style={[styles.ring, ring]} />

      <View
        style={[
          styles.sheet,
          { bottom: Math.max(insets.bottom, 12) + 114 },
        ]}
      >
        <Text variant="eyebrow" color={colors.acc}>
          {`Step ${index + 1} of ${STEPS.length}`}
        </Text>
        <Text variant="sectionTitle" color={colors.t0} style={{ marginTop: 9 }}>
          {step.title}
        </Text>
        <Text variant="bodySm" color={colors.t2} style={{ marginTop: 7, lineHeight: 20 }}>
          {step.body}
        </Text>

        <View style={styles.sheetFooter}>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {STEPS.map((item, dotIndex) => (
              <View
                key={item.title}
                style={[
                  styles.dot,
                  dotIndex === index
                    ? { width: 18, backgroundColor: colors.acc }
                    : { width: 6, backgroundColor: alpha(colors.t0, 0.25) },
                ]}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            {/* Always reachable, per the artboard. */}
            <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
              <Text variant="label" color={colors.t3}>
                Skip tour
              </Text>
            </Pressable>
            <Button
              label={index === STEPS.length - 1 ? "Done" : "Next"}
              onPress={next}
              block={false}
              height={38}
              style={{ paddingHorizontal: 20, borderRadius: 12 }}
              testID="tour-next"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backdrop: { flex: 1, paddingHorizontal: 16, opacity: 0.5 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, scrim.coach) },

  fakeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  fakeAvatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.s6 },
  fakeIcon: { width: 22, height: 22, borderRadius: 7, backgroundColor: colors.s6 },
  fakeChips: { flexDirection: "row", gap: 7, marginTop: 6 },
  fakeChip: { height: 32, borderRadius: 16, backgroundColor: colors.s5 },
  fakeCard: {
    height: 210,
    borderRadius: radius.xl,
    backgroundColor: colors.s3,
    marginTop: 13,
  },

  ring: {
    position: "absolute",
    borderWidth: 2.5,
    borderColor: colors.acc,
    // The artboard's 4px accent-16% halo.
    shadowColor: colors.acc,
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },

  sheet: {
    position: "absolute",
    left: 22,
    right: 22,
    backgroundColor: colors.s5,
    borderRadius: 18,
    padding: 18,
  },
  sheetFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 12,
  },
  dot: { height: 6, borderRadius: 3 },
});

