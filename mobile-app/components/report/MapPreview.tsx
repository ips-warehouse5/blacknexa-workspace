/**
 * The map preview on C4 and D1, in its three precision variants.
 *
 * C4's caption: "The map preview changes variant with the choice — pin, soft
 * radius with no pin, or blurred with a lock."
 *
 * ── Real tiles over a drawn grid ───────────────────────────────────────────
 * Two layers. Underneath is the artboards' stylised street grid, in the map
 * tokens (`map`, `map2`, `road`, `road2`). Over it, OpenStreetMap raster tiles —
 * but only ever for a location this screen is allowed to show precisely.
 *
 * The grid is not a placeholder; it is the answer whenever a real map would say
 * more than the chosen precision permits. Hidden never requests a tile, and
 * Approximate requests tiles for a snapped coordinate, never the true point — a
 * recognisable map invites someone to read the exact spot off it, which is the
 * opposite of what those two variants promise. The grid is also the fallback
 * when tiles fail to load, in preference to a second tile provider.
 *
 * ── Why OSM and not a static-map API ───────────────────────────────────────
 * Google's Maps Static API needs billing enabled on the Cloud project; it 403s
 * without it, so it renders nothing at all today (R-032). OSM needs no key and
 * no account. It is also the right custodian for this particular payload: the
 * coordinates leaving the device are those of a civil-rights incident, and OSM
 * is a UK non-profit rather than, as the previous fallback here was, a Russian
 * search company (D-015).
 *
 * The cost is that OSM serves one 256 px square per request rather than one
 * composed image, so the tiles covering the viewport are computed and laid out
 * here. Their usage policy asks for an identifying User-Agent and visible
 * attribution; both are below. Keep them.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Line, Rect } from "react-native-svg";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import type { LocationPrecision } from "@/lib/api/reports";

/**
 * The grid Approximate coordinates are snapped to, in degrees. 0.005° is ~550 m
 * of latitude, so the published centre lands within ~275 m of the true point —
 * the radius the caption describes, rather than the exact spot.
 */
const APPROX_GRID_DEG = 0.005;

/** Snap to the nearest multiple of `grid`, trimmed of binary-float noise. */
function snapTo(value: number, grid: number): number {
  return Number((Math.round(value / grid) * grid).toFixed(6));
}

/** Edge length of an OSM raster tile, in pixels. Fixed by the tile scheme. */
const TILE_SIZE = 256;

/**
 * Street level for Exact; neighbourhood level for Approximate, which is coarse
 * enough that the snapped centre and the true point are indistinguishable.
 */
const ZOOM = { exact: 15, approximate: 13 } as const;

/**
 * OSM's tile policy requires a User-Agent that identifies the application, so
 * they can contact us rather than block us if this ever misbehaves.
 * @see https://operations.osmfoundation.org/policies/tiles/
 */
const TILE_HEADERS = { "User-Agent": "BlackNexa/1.0 (+https://blacknexa.app)" };

/**
 * Web-Mercator projection, in tile units at zoom `z` — the standard "slippy
 * map" transform. Returns fractional tiles: the whole part identifies the tile,
 * the fraction locates the point inside it.
 */
function projectToTile(
  lat: number,
  lng: number,
  z: number
): { x: number; y: number } {
  const scale = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * scale,
    y:
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale,
  };
}

type Tile = { key: string; uri: string; left: number; top: number };

/**
 * The tiles covering a `width`×`height` viewport centred on the point, each
 * with its offset from the viewport's top-left corner.
 */
function tilesForViewport(
  lat: number,
  lng: number,
  z: number,
  width: number,
  height: number
): Tile[] {
  const scale = 2 ** z;
  const center = projectToTile(lat, lng, z);

  // Viewport edges in absolute pixels at this zoom.
  const left = center.x * TILE_SIZE - width / 2;
  const top = center.y * TILE_SIZE - height / 2;

  const firstX = Math.floor(left / TILE_SIZE);
  const lastX = Math.floor((left + width) / TILE_SIZE);
  // Latitude does not wrap, so the poles clamp rather than repeat.
  const firstY = Math.max(0, Math.floor(top / TILE_SIZE));
  const lastY = Math.min(scale - 1, Math.floor((top + height) / TILE_SIZE));

  const tiles: Tile[] = [];
  for (let x = firstX; x <= lastX; x++) {
    // Longitude wraps at the antimeridian; a negative modulo would 404.
    const wrappedX = ((x % scale) + scale) % scale;
    for (let y = firstY; y <= lastY; y++) {
      tiles.push({
        key: `${z}/${x}/${y}`,
        uri: `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - left,
        top: y * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}

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
  const [tilesFailed, setTilesFailed] = useState(false);
  // Tiles are laid out in pixels, so the viewport has to be measured first.
  // `height` is known from the prop; only the width needs a layout pass.
  const [width, setWidth] = useState(0);

  /**
   * The tiles to draw, or empty when there is nothing safe to draw.
   *
   * Three things this must never do:
   *  - centre on a fallback city when the report has no coordinates yet. A
   *    confident map of the wrong place reads as an answer, not as "unanswered";
   *    with no point we show the drawn grid and the empty label instead.
   *  - centre Approximate on the true point. The pin is dropped for a soft
   *    radius, but the tile centre is just as readable, so the coordinates are
   *    snapped to a ~500 m grid — the precision the caption promises — before
   *    they ever reach a URL.
   *  - request tiles at all for Hidden.
   */
  const tiles = useMemo<Tile[]>(() => {
    // Narrowed here rather than via `hasPoint` so the coordinates need no
    // non-null assertion below.
    if (lat === null || lng === null) return [];
    if (precision === "hidden" || width === 0) return [];

    // Snapped for Approximate, verbatim for Exact.
    const centerLat =
      precision === "approximate" ? snapTo(lat, APPROX_GRID_DEG) : lat;
    const centerLng =
      precision === "approximate" ? snapTo(lng, APPROX_GRID_DEG) : lng;

    return tilesForViewport(
      centerLat,
      centerLng,
      precision === "exact" ? ZOOM.exact : ZOOM.approximate,
      width,
      height
    );
  }, [lat, lng, precision, width, height]);

  // A failure belongs to the tiles that were on screen at the time, so a new
  // set gets a fresh attempt — otherwise one transient error leaves the grid
  // showing for good.
  const tileSetKey = tiles.map((t) => t.key).join("|");
  useEffect(() => {
    setTilesFailed(false);
  }, [tileSetKey]);

  // On failure we fall back to the drawn grid underneath rather than to another
  // provider: a foreign-labelled basemap of the right place is worse than an
  // obviously stylised one, and whose servers see these coordinates matters.
  const visibleTiles = tilesFailed ? [] : tiles;

  return (
    <View
      style={[
        {
          height,
          borderRadius: radius.xl,
          backgroundColor: colors.map,
          overflow: "hidden",
        },
        style,
      ]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
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

      {visibleTiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.uri, headers: TILE_HEADERS }}
          style={{
            position: "absolute",
            left: tile.left,
            top: tile.top,
            width: TILE_SIZE,
            height: TILE_SIZE,
          }}
          contentFit="fill"
          transition={250}
          // One failing tile means the layer is incomplete, and a map with
          // holes in it misleads worse than no map — drop the whole layer.
          onError={() => setTilesFailed(true)}
        />
      ))}

      {/* OSM's tile policy requires this to stay visible. */}
      {visibleTiles.length > 0 ? (
        <View style={styles.attribution}>
          <Text variant="metaSm" color={colors.onDeep} style={styles.attributionText}>
            © OpenStreetMap
          </Text>
        </View>
      ) : null}

      {/* Hidden: a blurred wash and a lock. Nothing to point at. */}
      {precision === "hidden" ? (
        <View style={styles.hiddenWash}>
          <View style={styles.lockBody} />
          <View style={styles.lockShackle} />
        </View>
      ) : null}

      {/* Approximate: a soft radius and deliberately no pin. */}
      {precision === "approximate" && hasPoint ? (
        <View style={styles.radius} />
      ) : null}

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
          <Text
            variant="metaSm"
            color={colors.onDeep}
            style={{ lineHeight: 16 }}
          >
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
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 354 200"
      preserveAspectRatio="xMidYMid slice"
    >
      <Rect width={354} height={200} fill={colors.map2} />
      {/* Wide roads. */}
      {[54, 132].map((y) => (
        <Line
          key={`h${y}`}
          x1={-10}
          y1={y}
          x2={364}
          y2={y}
          stroke={colors.road}
          strokeWidth={9}
        />
      ))}
      {[64, 186, 282].map((x) => (
        <Line
          key={`v${x}`}
          x1={x}
          y1={-10}
          x2={x}
          y2={210}
          stroke={colors.road}
          strokeWidth={9}
        />
      ))}
      {/* Narrow roads. */}
      <Line
        x1={-10}
        y1={92}
        x2={364}
        y2={92}
        stroke={colors.road2}
        strokeWidth={4}
      />
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

  emptyWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },

  // Top-right, so it never collides with the caption chip along the bottom.
  attribution: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: alpha(colors.deep, 0.55),
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  attributionText: {
    fontSize: 9,
    lineHeight: 13,
  },

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
