/**
 * The map preview on C4 and D1, in its three precision variants.
 *
 * C4's caption: "The map preview changes variant with the choice — pin, soft
 * radius with no pin, or blurred with a lock."
 *
 * ── Why this is drawn, not a real map ──────────────────────────────────────
 * The artboards draw a stylised street grid in the map tokens (`map`, `map2`,
 * `road`, `road2`) rather than a tile provider, and for this screen that is the
 * right call rather than a placeholder: the preview exists to show *how precise*
 * the answer is, and a recognisable real map invites someone to read the exact
 * spot off it — which is the opposite of what Approximate and Hidden promise.
 *
 * A real tile layer belongs on D1 for a verified public report, where the location
 * is already published. It does not belong here.
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import type { LocationPrecision } from "@/lib/api/reports";

export interface MapPreviewProps {
  precision: LocationPrecision;
  lat: number | null;
  lng: number | null;
  /** The dark chip along the bottom edge. */
  caption?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function MapPreview({
  precision,
  lat,
  lng,
  caption,
  height = 200,
  style,
}: MapPreviewProps): React.ReactElement {
  const hasPoint = lat !== null && lng !== null;

  return (
    <View
      style={[{ height, borderRadius: radius.xl, backgroundColor: colors.map, overflow: "hidden" }, style]}
      accessibilityRole="image"
      accessibilityLabel={
        precision === "hidden"
          ? "No location will be published"
          : precision === "approximate"
            ? "An approximate area, about 500 metres across"
            : "The exact spot you picked"
      }
    >
      <StreetGrid />

      {/* Hidden: a blurred wash and a lock. Nothing to point at. */}
      {precision === "hidden" ? (
        <View style={styles.hiddenWash}>
          <View style={styles.lockBody} />
          <View style={styles.lockShackle} />
        </View>
      ) : null}

      {/* Approximate: a soft radius and deliberately no pin. */}
      {precision === "approximate" && hasPoint ? <View style={styles.radius} /> : null}

      {/* Exact: a pin. */}
      {precision === "exact" && hasPoint ? (
        <View style={styles.pinWrap}>
          <View style={styles.pinHead} />
          <View style={styles.pinTail} />
        </View>
      ) : null}

      {/* No coordinates yet, and not Hidden — say so rather than showing an empty map. */}
      {!hasPoint && precision !== "hidden" ? (
        <View style={styles.emptyWrap}>
          <Text variant="metaSm" color={colors.t3} center>
            No location chosen yet
          </Text>
        </View>
      ) : null}

      {caption ? (
        <View style={styles.caption}>
          <Text variant="metaSm" color={colors.onDeep} style={{ lineHeight: 16 }}>
            {caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The artboard's street grid: five wide roads and three narrow ones.
 *
 * Fixed coordinates in a `viewBox` that scales, so the pattern keeps its
 * proportions at any width without recomputing anything.
 */
function StreetGrid(): React.ReactElement {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 354 200" preserveAspectRatio="xMidYMid slice">
      <Rect width={354} height={200} fill={colors.map2} />
      {/* Wide roads. */}
      {[54, 132].map((y) => (
        <Line key={`h${y}`} x1={-10} y1={y} x2={364} y2={y} stroke={colors.road} strokeWidth={9} />
      ))}
      {[64, 186, 282].map((x) => (
        <Line key={`v${x}`} x1={x} y1={-10} x2={x} y2={210} stroke={colors.road} strokeWidth={9} />
      ))}
      {/* Narrow roads. */}
      <Line x1={-10} y1={92} x2={364} y2={92} stroke={colors.road2} strokeWidth={4} />
      {[124, 232].map((x) => (
        <Line
          key={`n${x}`}
          x1={x}
          y1={-10}
          x2={x}
          y2={210}
          stroke={colors.road2}
          strokeWidth={4}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  radius: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 132,
    height: 132,
    marginLeft: -66,
    marginTop: -66,
    borderRadius: 66,
    backgroundColor: alpha(colors.acc, 0.16),
    borderWidth: 1.5,
    borderColor: alpha(colors.acc, 0.5),
  },

  pinWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -9,
    marginTop: -26,
    alignItems: "center",
  },
  pinHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.acc,
    borderWidth: 3,
    borderColor: colors.onAcc,
  },
  pinTail: {
    width: 2,
    height: 8,
    backgroundColor: colors.acc,
  },

  hiddenWash: {
    ...StyleSheet.absoluteFillObject,
    // A flat wash rather than a blur: an actual blur of a stylised grid reveals
    // nothing more than this does, and costs a native blur layer.
    backgroundColor: alpha(colors.s7, 0.82),
    alignItems: "center",
    justifyContent: "center",
  },
  lockBody: {
    width: 26,
    height: 19,
    borderRadius: 5,
    backgroundColor: colors.t3,
  },
  lockShackle: {
    position: "absolute",
    top: "50%",
    marginTop: -22,
    width: 16,
    height: 13,
    borderWidth: 2.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderColor: colors.t3,
  },

  emptyWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },

  caption: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: alpha(colors.deep, 0.78),
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
});

export default MapPreview;
