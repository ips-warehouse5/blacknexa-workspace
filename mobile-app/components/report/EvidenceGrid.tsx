/**
 * D1's evidence grid — and D2's, where the owner sees the same tiles with their
 * own files' review state.
 *
 * The grid is four square tiles across with per-file timestamps, a green shield on
 * sealed items, and a `+N` overflow tile — as D1 draws it. Tapping one opens the
 * D11 lightbox at that index.
 *
 * ── What a viewer may open (docs/INCIDENT_MODULE_PLAN.md D22, §7.3, §11a) ──
 * Evidence has its own publication state, separate from the report's. A viewer
 * is sent three kinds of file, and each tile says which it is rather than
 * failing silently on tap:
 *
 *   • an approved file — the ordinary tile;
 *   • a file still waiting for a moderator (`pendingReview`) — listed, with no
 *     URL, as an "Awaiting review" tile that does nothing when tapped, because
 *     there is nothing behind it yet;
 *   • a photo whose approval covered only its sealed preview
 *     (`fullResolutionPending`) — the thumbnail, marked "Preview", with a line
 *     under the grid saying the full image is awaiting review.
 *
 * The owner always has both URLs, so their tiles always open; a file of theirs
 * that others cannot see yet is badged "Awaiting review", one a moderator hid
 * "Hidden". The rules live in `lib/report/detail.ts` (`evidenceTile`), where
 * they are unit-tested.
 */

import React from "react";
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { formatDuration, type EvidenceView } from "@/lib/api/reports";
import { evidenceGridNotes, evidenceTile } from "@/lib/report/detail";

/** Four across, so a fifth file becomes the overflow tile. */
const VISIBLE = 4;

const KIND_LABEL: Record<EvidenceView["kind"], string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  document: "Document",
};

export function EvidenceGrid({
  evidence,
  onOpen,
  owner = false,
  style,
}: {
  evidence: EvidenceView[];
  onOpen: (index: number) => void;
  /** D2: the owner's own files, badged with their review state. */
  owner?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const shown = evidence.slice(0, VISIBLE);
  const overflow = evidence.length - VISIBLE;
  const notes = evidenceGridNotes(evidence, { owner });

  return (
    <View style={style}>
      <View style={styles.grid}>
        {shown.map((file, index) => {
          // The last visible tile becomes the overflow counter when there is more.
          const isOverflowTile = overflow > 0 && index === VISIBLE - 1;
          const tile = evidenceTile(file, { owner });
          const kind = KIND_LABEL[file.kind] ?? "File";

          if (!isOverflowTile && !tile.openable) {
            // "Awaiting review": listed so the count is honest, but not a button —
            // there is no file behind it yet.
            return (
              <View
                key={file.id}
                style={styles.tile}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${kind}, awaiting review`}
                testID={`evidence-tile-${index}`}
              >
                <View style={[styles.square, { backgroundColor: colors.s5 }]}>
                  <View style={styles.awaiting}>
                    <Text variant="eyebrowSm" color={colors.t4} center style={{ fontSize: 9 }}>
                      {kind.toUpperCase()}
                    </Text>
                    <Text variant="metaSm" color={colors.t3} center style={{ fontSize: 10, marginTop: 4, lineHeight: 13 }}>
                      Awaiting review
                    </Text>
                  </View>
                </View>
              </View>
            );
          }

          return (
            <Pressable
              key={file.id}
              onPress={() => onOpen(index)}
              accessibilityRole="button"
              accessibilityLabel={
                isOverflowTile
                  ? `${overflow + 1} more files`
                  : [
                      kind,
                      file.sealedAt ? "sealed" : "not yet sealed",
                      tile.badge ? tile.badge.toLowerCase() : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
              }
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.88 }]}
              testID={`evidence-tile-${index}`}
            >
              <View style={[styles.square, { backgroundColor: colors.s6 }]}>
                {isOverflowTile ? (
                  <View style={styles.overflow}>
                    <Text variant="cardTitleSm" color={colors.t1}>
                      {`+${overflow + 1}`}
                    </Text>
                  </View>
                ) : (
                  <>
                    {tile.image ? (
                      <Image
                        source={{ uri: tile.image }}
                        style={[StyleSheet.absoluteFill, tile.state === "owner_hidden" && { opacity: 0.45 }]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: colors.ph }]}>
                        {/* Audio and documents have no preview; the kind is the honest label. */}
                        <Text variant="eyebrowSm" color={colors.t3} style={{ fontSize: 9 }}>
                          {kind.toUpperCase()}
                        </Text>
                      </View>
                    )}

                    {/* Capture time, or duration for time-based media. */}
                    <Text variant="metaSm" color={colors.t0} style={styles.stamp}>
                      {file.durationMs
                        ? formatDuration(file.durationMs)
                        : file.capturedAt
                          ? new Date(file.capturedAt).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : ""}
                    </Text>

                    {/* The shield only appears once the server has sealed it. */}
                    {file.sealedAt ? (
                      <View style={[styles.shield, { backgroundColor: alpha(colors.deep, 0.6) }]}>
                        <View style={[styles.shieldShort, { backgroundColor: colors.ok }]} />
                        <View style={[styles.shieldLong, { backgroundColor: colors.ok }]} />
                      </View>
                    ) : null}

                    {/* Preview / Awaiting review / Hidden — on the file, never the report. */}
                    {tile.badge ? (
                      <View style={[styles.badge, { backgroundColor: alpha(colors.deep, 0.72) }]}>
                        <Text variant="eyebrowSm" color={colors.onDeep} numberOfLines={1} style={{ fontSize: 8.5 }}>
                          {tile.badge.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {notes.map((note) => (
        <Text key={note} variant="metaSm" color={colors.t4} style={{ marginTop: 9, lineHeight: 17 }}>
          {note}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 8 },
  tile: { flex: 1 },
  square: {
    width: "100%",
    // Square tiles without measuring: padding-bottom trick via aspectRatio.
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  overflow: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  placeholder: { alignItems: "center", justifyContent: "center" },
  awaiting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  stamp: {
    position: "absolute",
    left: 7,
    bottom: 7,
    fontSize: 9.5,
    // A text shadow rather than a chip: the artboard keeps the tile clean and the
    // shadow is what makes the stamp legible over either a light or dark photo.
    textShadowColor: alpha(colors.deep, 0.8),
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  shield: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 13,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
  },
  shieldShort: {
    position: "absolute",
    width: 3.5,
    height: 1.3,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }, { translateX: -1.9 }, { translateY: 1.3 }],
  },
  shieldLong: {
    position: "absolute",
    width: 6.5,
    height: 1.3,
    borderRadius: 1,
    transform: [{ rotate: "-45deg" }, { translateX: 0.9 }],
  },
  badge: {
    position: "absolute",
    left: 5,
    top: 6,
    maxWidth: "70%",
    height: 16,
    paddingHorizontal: 5,
    borderRadius: 5,
    justifyContent: "center",
  },
});

export default EvidenceGrid;
