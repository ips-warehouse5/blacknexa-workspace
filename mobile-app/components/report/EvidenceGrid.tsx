/**
 * D1's evidence grid, and the author row and trust card that sit around it.
 *
 * The grid is four square tiles across with per-file timestamps, a green shield on
 * sealed items, and a `+N` overflow tile — as D1 draws it. Tapping one opens the
 * D11 lightbox at that index.
 */

import React from "react";
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { formatDuration, type EvidenceView } from "@/lib/api/reports";

/** Four across, so a fifth file becomes the overflow tile. */
const VISIBLE = 4;

export function EvidenceGrid({
  evidence,
  onOpen,
  style,
}: {
  evidence: EvidenceView[];
  onOpen: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const shown = evidence.slice(0, VISIBLE);
  const overflow = evidence.length - VISIBLE;

  return (
    <View style={[styles.grid, style]}>
      {shown.map((file, index) => {
        // The last visible tile becomes the overflow counter when there is more.
        const isOverflowTile = overflow > 0 && index === VISIBLE - 1;

        return (
          <Pressable
            key={file.id}
            onPress={() => onOpen(index)}
            accessibilityRole="button"
            accessibilityLabel={
              isOverflowTile
                ? `${overflow + 1} more files`
                : `${file.kind}, ${file.sealedAt ? "sealed" : "not yet sealed"}`
            }
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.88 }]}
            testID={`evidence-tile-${index}`}
          >
            <View style={styles.square}>
              {isOverflowTile ? (
                <View style={styles.overflow}>
                  <Text variant="cardTitleSm" color={colors.t1}>
                    {`+${overflow + 1}`}
                  </Text>
                </View>
              ) : (
                <>
                  {file.thumbUrl ? (
                    <Image
                      source={{ uri: file.thumbUrl }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ph }]} />
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
                    <View style={styles.shield}>
                      <View style={styles.shieldShort} />
                      <View style={styles.shieldLong} />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </Pressable>
        );
      })}
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
    backgroundColor: colors.s6,
  },
  overflow: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
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
    backgroundColor: alpha(colors.deep, 0.6),
    borderRadius: 3,
  },
  shieldShort: {
    position: "absolute",
    width: 3.5,
    height: 1.3,
    borderRadius: 1,
    backgroundColor: colors.ok,
    transform: [{ rotate: "45deg" }, { translateX: -1.9 }, { translateY: 1.3 }],
  },
  shieldLong: {
    position: "absolute",
    width: 6.5,
    height: 1.3,
    borderRadius: 1,
    backgroundColor: colors.ok,
    transform: [{ rotate: "-45deg" }, { translateX: 0.9 }],
  },
});

export default EvidenceGrid;
