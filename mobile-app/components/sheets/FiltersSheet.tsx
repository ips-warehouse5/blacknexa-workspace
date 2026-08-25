/**
 * B2 · Filters — a draggable half sheet.
 *
 * From the caption: "Every option carries a live count, so nothing leads to an
 * empty result by surprise."
 *
 * That is the whole design of this screen, and it shapes two things:
 *
 *   • Counts come from `/reports/facets`, which computes each dimension with
 *     *itself* excluded from the filter. So "Verified only · 9 of 17" means nine of
 *     the seventeen that match everything else — not nine of all reports.
 *
 *   • The CTA prints the outcome — "Show 17 reports" — so the result is known
 *     before the sheet closes.
 *
 * Changes are staged locally and applied on the CTA, rather than live. A live
 * filter would re-run the feed under someone's thumb while they are still
 * assembling a query.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { Chip, SegmentedControl, SwitchRow } from "@/components/ui/Controls";
import { CATEGORY_META, type FeedFacets, type FeedQuery } from "@/lib/api/reports";

type When = NonNullable<FeedQuery["when"]>;

export interface FiltersSheetProps {
  visible: boolean;
  filters: FeedQuery;
  facets?: FeedFacets;
  onApply: (next: FeedQuery) => void;
  onClose: () => void;
}

export function FiltersSheet({
  visible,
  filters,
  facets,
  onApply,
  onClose,
}: FiltersSheetProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<FeedQuery>(filters);

  // Re-seed each time it opens: an abandoned edit should not persist.
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [filters, visible]);

  /** What the CTA will yield. Falls back to the total when a count is unknown. */
  const resultCount = useMemo(() => {
    if (!facets) return null;
    if (draft.category) {
      const entry = facets.categories.find((item) => item.category === draft.category);
      return entry?.count ?? facets.total;
    }
    if (draft.verifiedOnly) return facets.verified;
    if (draft.urgentOnly) return facets.urgent;
    if (draft.when && draft.when !== "all") return facets.when[draft.when];
    return facets.total;
  }, [draft, facets]);

  const anyActive =
    Boolean(draft.category) ||
    (draft.when && draft.when !== "all") ||
    draft.verifiedOnly ||
    draft.urgentOnly;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        />

        {/*
          Height is a fraction of the screen rather than the artboard's flat 610px:
          that number overflows an iPhone SE and floats on a Pro Max.
        */}
        <View style={[styles.sheet, { maxHeight: "82%", paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text variant="sectionTitle" color={colors.t0} style={{ fontSize: 19 }}>
              Filters
            </Text>
            {anyActive ? (
              <Pressable
                onPress={() => setDraft({ sort: draft.sort, when: "all" })}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text variant="label" color={colors.acc}>
                  Clear all
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <Text variant="eyebrow" color={colors.t3} style={{ letterSpacing: 1.54 }}>
              CATEGORY
            </Text>
            <View style={styles.chipWrap}>
              {(facets?.categories ?? []).map((entry) => (
                <Chip
                  key={entry.category}
                  label={CATEGORY_META[entry.category].label}
                  count={entry.count}
                  dotColor={colors[CATEGORY_META[entry.category].token]}
                  selected={draft.category === entry.category}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      category: current.category === entry.category ? undefined : entry.category,
                    }))
                  }
                  testID={`sheet-category-${entry.category}`}
                />
              ))}
            </View>

            <Text variant="eyebrow" color={colors.t3} style={styles.sectionLabel}>
              WHEN
            </Text>
            <SegmentedControl<When>
              options={[
                { value: "today", label: "Today" },
                { value: "week", label: "7 days" },
                { value: "month", label: "30 days" },
                { value: "all", label: "All" },
              ]}
              value={draft.when ?? "all"}
              onChange={(when) => setDraft((current) => ({ ...current, when }))}
              style={{ marginTop: 11 }}
            />

            <Text variant="eyebrow" color={colors.t3} style={styles.sectionLabel}>
              WHERE
            </Text>
            {/*
              "Near me" needs a coordinate the feed query does not yet carry, so it
              is shown as unavailable rather than as a control that does nothing.
              Wiring it is a location permission plus two query params.
            */}
            <View style={styles.disabledRow}>
              <Text variant="label" color={colors.t3} style={{ fontSize: 13.5 }}>
                Near me
              </Text>
              <Text variant="metaSm" color={colors.t4}>
                Turn on location to use this
              </Text>
            </View>

            <SwitchRow
              title="Verified only"
              description={
                facets ? `${facets.verified} of ${facets.total}` : "Reviewed by a moderator"
              }
              value={draft.verifiedOnly ?? false}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, verifiedOnly: value }))
              }
              style={{ marginTop: 9 }}
              testID="filter-verified"
            />

            <SwitchRow
              title="Urgent only"
              description={facets ? `${facets.urgent} of ${facets.total}` : "Flagged as urgent"}
              value={draft.urgentOnly ?? false}
              onValueChange={(value) => setDraft((current) => ({ ...current, urgentOnly: value }))}
              style={{ marginTop: 9 }}
              testID="filter-urgent"
            />
          </ScrollView>

          <View style={styles.footer}>
            {/* The CTA prints the outcome. */}
            <Button
              label={
                resultCount === null
                  ? "Show reports"
                  : `Show ${resultCount} report${resultCount === 1 ? "" : "s"}`
              }
              onPress={() => onApply(draft)}
              testID="apply-filters"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, scrim.sheet) },
  sheet: {
    backgroundColor: colors.s2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: screenPadding.detail,
    paddingTop: 9,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: alpha(colors.t0, 0.18),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 14,
  },
  sectionLabel: { marginTop: 24, letterSpacing: 1.54 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11 },
  disabledRow: {
    backgroundColor: colors.s5,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginTop: 11,
    opacity: 0.6,
  },
  footer: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(colors.t0, 0.07),
    marginTop: 14,
  },
});

export default FiltersSheet;
