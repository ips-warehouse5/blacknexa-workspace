/**
 * The feed's loading, empty and error states.
 *
 * The design never shows a bare spinner or a shrug. D6's skeletons "mirror the
 * thread geometry, indent included, and fade with depth", and B6 "names the likely
 * typo, says filters are involved, and gives one recovery per cause rather than a
 * shrug". Both principles apply here:
 *
 *   • The skeleton is the 1a card's geometry — band, meta, title, footer — so the
 *     page does not reflow when the rows arrive.
 *   • The empty state distinguishes "no reports yet" from "your filters excluded
 *     everything", because those need different recoveries.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { CARD_HEIGHT_WITH_MEDIA } from "@/components/report/FeedCard";

/** Three 1a-shaped skeletons, fading with depth as D6 does. */
export function FeedSkeleton(): React.ReactElement {
  return (
    <View style={styles.list} accessibilityLabel="Loading reports">
      {[1, 0.7, 0.45].map((opacity, index) => (
        <View key={index} style={[styles.card, { opacity }]}>
          <View style={styles.band} />
          <View style={styles.body}>
            <View style={[styles.bar, { width: 120, height: 11 }]} />
            <View style={[styles.bar, { width: "92%", height: 15, marginTop: 11 }]} />
            <View style={[styles.bar, { width: "68%", height: 15, marginTop: 6 }]} />
            <View style={styles.skeletonFooter}>
              <View style={[styles.bar, { width: 140, height: 11 }]} />
              <View style={[styles.bar, { width: 96, height: 32, borderRadius: 16 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Nothing to show.
 *
 * Two causes, two recoveries: a filter that excluded everything is cleared, and an
 * genuinely empty feed is answered by filing the first report.
 */
export function FeedEmpty({
  filtered,
  onClear,
  onFile,
}: {
  filtered: boolean;
  onClear: () => void;
  onFile: () => void;
}): React.ReactElement {
  return (
    <View style={styles.centre}>
      <View style={styles.mark}>
        <View style={styles.markInner} />
      </View>
      <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 20 }}>
        {filtered ? "Nothing matches those filters" : "No reports here yet"}
      </Text>
      <Text variant="bodySm" color={colors.t2} center style={styles.centreBody}>
        {filtered
          ? "Every option carries a live count, so you can widen this without guessing."
          : "When someone in your area files a report, it appears here. You can be the first."}
      </Text>
      {filtered ? (
        <Button
          label="Clear all filters"
          onPress={onClear}
          block={false}
          style={{ marginTop: 22, paddingHorizontal: 22 }}
        />
      ) : (
        <Button
          label="File a report"
          onPress={onFile}
          block={false}
          style={{ marginTop: 22, paddingHorizontal: 22 }}
        />
      )}
    </View>
  );
}

/**
 * The feed failed to load.
 *
 * "This isn't you" is D7's line, and it belongs here too: a person whose report
 * feed is blank should not be left wondering whether they broke something.
 */
export function FeedError({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <View style={styles.centre}>
      <View style={[styles.mark, { backgroundColor: alpha(colors.bad, 0.1) }]}>
        <View style={[styles.markInner, { borderColor: colors.bad2 }]} />
      </View>
      <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 20 }}>
        Couldn&rsquo;t load the feed
      </Text>
      <Text variant="bodySm" color={colors.t2} center style={styles.centreBody}>
        This isn&rsquo;t you. Check your connection and try again.
      </Text>
      <Button
        label="Try again"
        onPress={onRetry}
        block={false}
        style={{ marginTop: 22, paddingHorizontal: 22 }}
        testID="feed-retry"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: screenPadding.feed, paddingTop: 12, gap: 12 },
  card: {
    height: CARD_HEIGHT_WITH_MEDIA,
    backgroundColor: colors.s3,
    borderRadius: radius.xxl,
    overflow: "hidden",
  },
  band: { height: 190, backgroundColor: colors.s6 },
  body: { flex: 1, padding: 15 },
  bar: { backgroundColor: colors.s5, borderRadius: 5 },
  skeletonFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
  },

  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 42,
    paddingBottom: 60,
  },
  centreBody: { marginTop: 9, lineHeight: 21 },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: colors.s3,
    alignItems: "center",
    justifyContent: "center",
  },
  markInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.7,
    borderColor: colors.t3,
  },
});
