/**
 * The feed card — treatment **1a**, "Editorial — one lead image, title first".
 *
 * The client chose 1a over 1b, so this is the card and the B1 artboard (which is
 * drawn with 1b) is *not* the reference for it. Option 1a's own frame is.
 *
 * ── With a lead image (≈335px), as drawn ───────────────────────────────────
 *   190px band · status pills top-left in their `onMedia` variant · "+N files"
 *   bottom-right · then pad 15: meta row, Spectral 21 title, 2-line excerpt,
 *   footer sentence + "Stand with".
 *
 * ── Without one (≈190px), which 1a forces us to invent ─────────────────────
 * The design flags the gap itself — "Strongest when there is a good photo; weakest
 * when there is none, which is often" — and never draws it. Considered: falling
 * back to 1b (two card identities in one feed), or generating a category-tinted
 * band (fabricates a visual where there is no evidence). Chose to **drop the band**:
 * same padding, same Spectral 21 title, one extra excerpt line, and the status
 * pills relocate into the meta row in their `tint` variant — which is precisely
 * why both pill variants exist.
 *
 * ── Two counting details that are easy to get wrong ────────────────────────
 *   • `+N files` counts files *beyond* the lead, so it is `mediaCount - 1` and
 *     hidden at `mediaCount <= 1`. 1b's "4 files" counted all of them.
 *   • There is **no corroboration count** on a 1a card. 1b and 1c both show one;
 *     1a's footer is author, support, comments. It first appears on D1.
 */

import React, { useCallback, useMemo } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { CategoryDot } from "@/components/ui/Controls";
import { StatusPill } from "@/components/report/StatusPill";
import {
  CATEGORY_META,
  formatDuration,
  relativeTime,
  type FeedCardView,
} from "@/lib/api/reports";

/** Both variants are fixed-height so `getItemLayout` stays viable on the list. */
export const CARD_HEIGHT_WITH_MEDIA = 335;
export const CARD_HEIGHT_TEXT_ONLY = 190;
export const CARD_GAP = 12;

export function cardHeight(item: FeedCardView): number {
  return item.leadMedia ? CARD_HEIGHT_WITH_MEDIA : CARD_HEIGHT_TEXT_ONLY;
}

export interface FeedCardProps {
  item: FeedCardView;
  onPress: (item: FeedCardView) => void;
  onToggleSupport: (item: FeedCardView) => void;
}

export const FeedCard = React.memo(function FeedCard({
  item,
  onPress,
  onToggleSupport,
}: FeedCardProps): React.ReactElement {
  const meta = CATEGORY_META[item.category];
  const hasMedia = item.leadMedia !== null;

  /** "Anonymous · 142 standing with · 31 comments" — 1a's footer sentence. */
  const footerLine = useMemo(() => {
    const parts = [item.author.name];
    if (item.supportCount > 0) parts.push(`${item.supportCount} standing with`);
    if (item.commentCount > 0) {
      parts.push(`${item.commentCount} comment${item.commentCount === 1 ? "" : "s"}`);
    }
    return parts.join(" · ");
  }, [item.author.name, item.commentCount, item.supportCount]);

  const support = useCallback(() => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    onToggleSupport(item);
  }, [item, onToggleSupport]);

  /** Files beyond the lead — see the header note on counting. */
  const extraFiles = Math.max(0, item.mediaCount - 1);

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${meta.label}. ${footerLine}`}
      style={({ pressed }) => [
        styles.card,
        { height: cardHeight(item) },
        pressed && { opacity: 0.94 },
      ]}
      testID={`feed-card-${item.caseRef}`}
    >
      {hasMedia ? (
        <View style={styles.band}>
          {item.leadMedia?.thumbUrl || item.leadMedia?.posterUrl ? (
            <Image
              source={{ uri: (item.leadMedia.thumbUrl ?? item.leadMedia.posterUrl)! }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            // A sealed file whose thumbnail has not been generated yet: the
            // placeholder token, not a broken-image glyph.
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ph }]} />
          )}

          {/* Status pills, in the solid-over-photo variant. */}
          <View style={styles.bandBadges}>
            {item.urgent ? <StatusPill kind="urgent" variant="onMedia" /> : null}
            {item.verified ? <StatusPill kind="verified" variant="onMedia" /> : null}
          </View>

          {/* A video's duration sits where the file count would otherwise. */}
          {item.leadMedia?.kind === "video" && item.leadMedia.durationMs ? (
            <View style={[styles.bandChip, { left: 10, right: undefined }]}>
              <Text variant="metaSm" color={colors.onDeep} style={{ fontSize: 11 }}>
                {formatDuration(item.leadMedia.durationMs)}
              </Text>
            </View>
          ) : null}

          {extraFiles > 0 ? (
            <View style={styles.bandChip}>
              <Text variant="chipSm" color={colors.onDeep} style={{ fontSize: 11 }}>
                {`+${extraFiles} file${extraFiles === 1 ? "" : "s"}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Meta row. Without a band, the status pills join it as tints. */}
        <View style={styles.metaRow}>
          <View style={styles.metaCategory}>
            <CategoryDot color={colors[meta.token]} />
            <Text variant="meta" color={colors.t2}>
              {meta.label}
            </Text>
          </View>
          <Text variant="meta" color={colors.t5}>
            ·
          </Text>
          <Text variant="meta" color={colors.t4} numberOfLines={1} style={{ flexShrink: 1 }}>
            {[item.areaLabel, relativeTime(item.filedAt)].filter(Boolean).join(" · ")}
          </Text>
        </View>

        {!hasMedia && (item.urgent || item.verified) ? (
          <View style={styles.tintPills}>
            {item.urgent ? <StatusPill kind="urgent" /> : null}
            {item.verified ? <StatusPill kind="verified" /> : null}
          </View>
        ) : null}

        <Text
          variant="cardTitle"
          color={colors.t0}
          numberOfLines={hasMedia ? 2 : 3}
          style={styles.title}
        >
          {item.title}
        </Text>

        {item.excerpt ? (
          <Text
            variant="bodySm"
            color={colors.t2}
            // One extra line without a band, per the invented variant.
            numberOfLines={hasMedia ? 2 : 3}
            style={styles.excerpt}
          >
            {item.excerpt}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Text variant="metaSm" color={colors.t4} numberOfLines={1} style={{ flex: 1 }}>
            {footerLine}
          </Text>

          {/*
            The one tappable thing in the footer. Labelled rather than a bare
            count, because the number already sits in the sentence to its left.
          */}
          <Pressable
            onPress={support}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityState={{ selected: item.standingWith }}
            accessibilityLabel={
              item.standingWith ? "You are standing with this report" : "Stand with this report"
            }
            style={({ pressed }) => [
              styles.standChip,
              item.standingWith && { backgroundColor: colors.acc },
              pressed && { opacity: 0.85 },
            ]}
            testID={`stand-with-${item.caseRef}`}
          >
            <HeartGlyph filled={item.standingWith} />
            <Text variant="chip" color={item.standingWith ? colors.onAcc : colors.t1}>
              {item.standingWith ? "Standing with" : "Stand with"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

/** The 14px heart. Outlined at rest, filled when standing with. */
function HeartGlyph({ filled }: { filled: boolean }): React.ReactElement {
  const tint = filled ? colors.onAcc : colors.t1;
  return (
    <View style={styles.heart}>
      <View
        style={[
          styles.heartLobe,
          { left: 0, backgroundColor: filled ? tint : "transparent", borderColor: tint },
        ]}
      />
      <View
        style={[
          styles.heartLobe,
          { right: 0, backgroundColor: filled ? tint : "transparent", borderColor: tint },
        ]}
      />
      <View
        style={[
          styles.heartBase,
          { backgroundColor: filled ? tint : "transparent", borderColor: tint },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.s3,
    borderRadius: radius.xxl,
    overflow: "hidden",
  },
  band: { height: 190, backgroundColor: colors.ph },
  bandBadges: { position: "absolute", left: 10, top: 10, flexDirection: "row", gap: 6 },
  bandChip: {
    position: "absolute",
    right: 10,
    bottom: 10,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: radius.xs,
    backgroundColor: alpha(colors.deep, 0.72),
    alignItems: "center",
    justifyContent: "center",
  },

  body: { flex: 1, padding: 15 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  metaCategory: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  tintPills: { flexDirection: "row", gap: 6, marginTop: 9 },
  title: { marginTop: 9 },
  excerpt: { marginTop: 7 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: "auto",
    paddingTop: 14,
  },
  standChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: colors.s6,
  },

  heart: { width: 14, height: 13, alignItems: "center" },
  heartLobe: {
    position: "absolute",
    top: 0,
    width: 7.5,
    height: 7.5,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  heartBase: {
    position: "absolute",
    bottom: 0.5,
    width: 9,
    height: 9,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    transform: [{ rotate: "45deg" }],
  },
});

export default FeedCard;
