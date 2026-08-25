/**
 * B7 · Sort reports by.
 *
 * From the caption: "Three options, the active one ticked and tinted, each with the
 * sentence that says what it actually orders by."
 *
 * The sentences are the point. "Most supported" and "Most corroborated" sound
 * interchangeable and are not — one counts people who believe you, the other counts
 * people it happened to as well — so each row says which.
 */

import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import type { FeedQuery } from "@/lib/api/reports";

type Sort = NonNullable<FeedQuery["sort"]>;

const OPTIONS: { value: Sort; label: string; sentence: string }[] = [
  { value: "newest", label: "Newest first", sentence: "Most recently filed at the top" },
  { value: "supported", label: "Most supported", sentence: "By how many people stood with it" },
  {
    value: "corroborated",
    label: "Most corroborated",
    sentence: "By how many people said it happened to them too",
  },
];

export function SortSheet({
  visible,
  sort,
  onSelect,
  onClose,
}: {
  visible: boolean;
  sort: Sort;
  onSelect: (sort: Sort) => void;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sort options"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
          <View style={styles.grabber} />
          <Text variant="sectionTitle" color={colors.t0} style={styles.title}>
            Sort reports by
          </Text>

          {OPTIONS.map((option) => {
            const active = option.value === sort;
            return (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.label}. ${option.sentence}`}
                testID={`sort-${option.value}`}
                style={({ pressed }) => [
                  styles.row,
                  // Ticked *and* tinted, as the caption specifies — the tick alone
                  // is easy to miss at a glance.
                  active && { backgroundColor: alpha(colors.acc, 0.08) },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={styles.tickSlot}>{active ? <Tick /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text
                    variant={active ? "labelLg" : "body"}
                    color={active ? colors.t0 : colors.t1}
                    style={{ fontSize: 14.5 }}
                  >
                    {option.label}
                  </Text>
                  <Text variant="metaSm" color={colors.t3} style={{ marginTop: 2 }}>
                    {option.sentence}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <Button
            label="Cancel"
            variant="secondary"
            onPress={onClose}
            style={{ marginTop: 14 }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** The 20px accent tick beside the active option. */
function Tick(): React.ReactElement {
  return (
    <View style={styles.tick}>
      <View style={styles.tickShort} />
      <View style={styles.tickLong} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, scrim.sheet) },
  sheet: {
    backgroundColor: colors.s2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 9,
    paddingHorizontal: screenPadding.detail,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: alpha(colors.t0, 0.18),
  },
  title: { paddingTop: 16, paddingBottom: 12, fontSize: 19 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 15,
    // Negative inset so the tint bleeds to the sheet edge, as the artboard draws.
    marginHorizontal: -screenPadding.detail,
    paddingHorizontal: screenPadding.detail,
  },
  tickSlot: { width: 20, alignItems: "center" },
  tick: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  tickShort: {
    position: "absolute",
    width: 6,
    height: 1.9,
    borderRadius: 1,
    backgroundColor: colors.acc,
    transform: [{ rotate: "45deg" }, { translateX: -3 }, { translateY: 2.2 }],
  },
  tickLong: {
    position: "absolute",
    width: 11,
    height: 1.9,
    borderRadius: 1,
    backgroundColor: colors.acc,
    transform: [{ rotate: "-45deg" }, { translateX: 1.4 }],
  },
});

export default SortSheet;
