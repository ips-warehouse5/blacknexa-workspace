/**
 * D11 · Evidence lightbox, and D12 · the facts panel expanded.
 *
 * From D11: "Filmstrip below, '2 of 4' above, and a collapsed drag-up panel — the
 * facts are one gesture away, **never covering the frame**."
 * From D12: "Captured / Sealed / Integrity / Size / Device", then "Show the tech".
 *
 * ── Why the panel is a toggle, not a drag ──────────────────────────────────
 * The design draws a drag handle, and a real drag gesture here would fight the
 * video scrubber and the horizontal filmstrip for the same touch. A tap on the
 * handle gets to the same two states — collapsed and expanded — without a gesture
 * that can be started by accident while seeking. The handle stays because it is
 * what tells you the panel moves.
 *
 * D12 shows "Device: Not recorded", which is the honest answer for most files: the
 * capture device is not something the app collects.
 */

import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { StatusPill } from "@/components/report/StatusPill";
import { MicGlyph } from "@/components/report/AudioRecorderRow";
import { ShareGlyph } from "@/app/r/[ref]/index";
import reportsApi, {
  absoluteTime,
  formatBytes,
  formatDuration,
  type EvidenceView,
  type ReportDetailView,
} from "@/lib/api/reports";

export default function EvidenceLightbox(): React.ReactElement {
  const { ref, index } = useLocalSearchParams<{ ref: string; index: string }>();
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState(() => Number(index ?? 0) || 0);
  const [expanded, setExpanded] = useState(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
  });

  const evidence = useMemo(
    () => (detail.data as ReportDetailView | undefined)?.evidence ?? [],
    [detail.data],
  );
  const file = evidence[current];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* "2 of 4" above the frame, never over it. */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={11}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="lightbox-close"
        >
          <View style={styles.closeGlyph}>
            <View style={[styles.closeBar, { transform: [{ rotate: "45deg" }] }]} />
            <View style={[styles.closeBar, { transform: [{ rotate: "-45deg" }] }]} />
          </View>
        </Pressable>

        <Text variant="label" color={colors.t1} style={{ fontSize: 13.5 }}>
          {evidence.length > 0 ? `${current + 1} of ${evidence.length}` : ""}
        </Text>

        <Pressable hitSlop={11} accessibilityRole="button" accessibilityLabel="Share this file">
          <ShareGlyph />
        </Pressable>
      </View>

      {/* The frame. Shrinks when the panel expands rather than being covered. */}
      <View style={[styles.frame, expanded && styles.frameCompact]}>
        {file ? <EvidenceFrame file={file} /> : null}
      </View>

      {/* Filmstrip. */}
      {evidence.length > 1 ? (
        <FlatList
          horizontal
          data={evidence}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          renderItem={({ item, index: position }) => (
            <Pressable
              onPress={() => setCurrent(position)}
              accessibilityRole="button"
              accessibilityLabel={`File ${position + 1}`}
              style={[
                styles.stripItem,
                position === current
                  ? { borderWidth: 2, borderColor: colors.acc }
                  : { opacity: 0.55 },
              ]}
              testID={`strip-${position}`}
            >
              {item.kind === "audio" ? (
                <View style={styles.stripAudio}>
                  <MicGlyph color={colors.t3} size={20} />
                </View>
              ) : item.thumbUrl ? (
                <Image source={{ uri: item.thumbUrl }} style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ph }]} />
              )}
            </Pressable>
          )}
        />
      ) : null}

      {/* The facts panel. Collapsed shows a summary; expanded shows D12. */}
      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "Hide the file facts" : "Show the file facts"}
          hitSlop={{ top: 10, bottom: 6, left: 0, right: 0 }}
          testID="lightbox-panel-toggle"
        >
          <View style={styles.grabber} />
        </Pressable>

        {file ? (
          <>
            <View style={styles.panelHead}>
              <Text variant={expanded ? "cardTitleSm" : "label"} color={colors.t0}>
                {[
                  file.kind.charAt(0).toUpperCase() + file.kind.slice(1),
                  file.durationMs ? formatDuration(file.durationMs) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {file.sealedAt ? <StatusPill kind="verified" /> : null}
            </View>

            {expanded ? (
              <View style={{ marginTop: 14 }}>
                <FactRow label="Captured" value={file.capturedAt ? absoluteTime(file.capturedAt) : "Not recorded"} />
                <FactRow label="Sealed" value={file.sealedAt ? absoluteTime(file.sealedAt) : "Not sealed"} />
                <FactRow
                  label="Integrity"
                  value={file.sealedAt ? "Unchanged since" : "Not verified"}
                  valueColor={file.sealedAt ? colors.ok : colors.warn}
                />
                <FactRow label="Size" value={file.bytes ? formatBytes(file.bytes) : "Unknown"} />
                {/* The honest answer for most files. */}
                <FactRow label="Device" value="Not recorded" valueColor={colors.t4} last />
              </View>
            ) : (
              <Text variant="metaSm" color={colors.t4} style={{ marginTop: 5 }}>
                Tap for captured, sealed and integrity
              </Text>
            )}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** The frame's content, by kind. */
function EvidenceFrame({ file }: { file: EvidenceView }): React.ReactElement {
  if (file.kind === "video" && file.url) {
    return <VideoFrame uri={file.url} />;
  }

  if (file.kind === "audio") {
    return (
      <View style={styles.audioFrame}>
        <View style={styles.audioMark}>
          <MicGlyph color={colors.acc} size={34} />
        </View>
        <Text variant="bodySm" color={colors.t3} center style={{ marginTop: 16 }}>
          {file.durationMs ? formatDuration(file.durationMs) : "Audio recording"}
        </Text>
        <Text variant="metaSm" color={colors.t4} center style={{ marginTop: 6 }}>
          Attached as a file. It was never transcribed.
        </Text>
      </View>
    );
  }

  if (file.kind === "document") {
    return (
      <View style={styles.audioFrame}>
        <View style={styles.audioMark}>
          <View style={styles.docGlyph} />
        </View>
        <Text variant="bodySm" color={colors.t3} center style={{ marginTop: 16 }}>
          Document
        </Text>
      </View>
    );
  }

  return file.url ? (
    <Image source={{ uri: file.url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.ph }]} />
  );
}

/** A video with the platform's own controls — including its scrubber. */
function VideoFrame({ uri }: { uri: string }): React.ReactElement {
  const player = useVideoPlayer(uri, (instance) => {
    // Not autoplaying: evidence of an incident should not start without a tap.
    instance.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      allowsFullscreen
      nativeControls
    />
  );
}

function FactRow({
  label,
  value,
  valueColor = colors.t0,
  last = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  last?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.factRow, last && { borderBottomWidth: 0 }]}>
      <Text variant="label" color={colors.t3}>
        {label}
      </Text>
      <Text variant="label" color={valueColor}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 2,
  },
  frame: { flex: 1, marginTop: 12, backgroundColor: colors.ph, overflow: "hidden" },
  // Expanded, the frame gives up room rather than being covered.
  frameCompact: { flex: 0, height: 240 },

  strip: { gap: 8, paddingHorizontal: 18, paddingTop: 16 },
  stripItem: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.s5,
  },
  stripAudio: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.s5,
  },

  panel: {
    backgroundColor: colors.s0,
    borderTopLeftRadius: radius.dialog,
    borderTopRightRadius: radius.dialog,
    paddingHorizontal: 18,
    paddingTop: 10,
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(colors.t0, 0.07),
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: alpha(colors.t0, 0.22),
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.06),
  },

  audioFrame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.s3,
    paddingHorizontal: 40,
  },
  audioMark: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.s6,
    alignItems: "center",
    justifyContent: "center",
  },
  docGlyph: {
    width: 26,
    height: 32,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.acc,
  },

  closeGlyph: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  closeBar: {
    position: "absolute",
    width: 16,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: colors.t0,
  },
});
