/**
 * C5 · Step 5 of 7 — Evidence. Labelled Optional in the artboard.
 *
 * From the caption: "Six ways in. Attached items become rows that resolve from an
 * upload bar to 'Sealed 9:41 PM'."
 *
 * ── Sealed is the server's word, not ours ──────────────────────────────────
 * A row shows "Sealed 9:41 PM" only once the server has hashed what it actually
 * stored and matched it against what the device declared. Until then the row shows
 * real progress. Never a checkmark on a local file — the whole trust story on D3
 * rests on that timestamp meaning something.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { WizardShell, SectionLabel } from "@/components/report/WizardShell";
import { MicGlyph } from "@/components/report/AudioRecorderRow";
import { useReportDraft, type DraftAttachment } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";
import { formatBytes, formatDuration, type EvidenceKind } from "@/lib/api/reports";

/** The six entry tiles, in the artboard's order. */
type Source = "photo" | "video" | "audio" | "library" | "screenshots" | "files";

const SOURCES: { key: Source; label: string }[] = [
  { key: "photo", label: "Photo" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "library", label: "Library" },
  { key: "screenshots", label: "Screenshots" },
  { key: "files", label: "Files" },
];

/**
 * A library asset's own creation time, where the picker reports one.
 *
 * Not in `ImagePickerAsset`'s public type on this SDK, but present at runtime on
 * both platforms — and it is the honest capture time for something chosen from the
 * library rather than shot just now. Absent is a valid answer: D12 shows
 * "Device: Not recorded", so an unknown capture time is expected, not a gap to fill
 * with `Date.now()`.
 */
function assetCapturedAt(asset: ImagePicker.ImagePickerAsset): string | undefined {
  const value = (asset as { creationTime?: number }).creationTime;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

/** Map a picked asset's own type onto our four kinds. */
function kindFor(mime: string, assetType?: string | null): EvidenceKind {
  if (assetType === "video" || mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export default function EvidenceStep(): React.ReactElement {
  const { attachments, addAttachment, removeAttachment, retryAttachment, setStep, savedAt } =
    useReportDraft();
  const exit = useWizardExit();
  const [notice, setNotice] = useState<string | null>(null);

  const totalBytes = useMemo(
    () => attachments.reduce((sum, item) => sum + item.bytes, 0),
    [attachments],
  );

  /** Read the real size off disk; the picker does not always report it. */
  const sizeOf = useCallback(async (uri: string, fallback?: number): Promise<number> => {
    if (fallback && fallback > 0) return fallback;
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    return info && info.exists && "size" in info ? (info.size as number) : 0;
  }, []);

  const pick = useCallback(
    async (source: Source) => {
      setNotice(null);
      try {
        // Audio is recorded, not picked — C2's recorder is the way in, and the
        // tile points at it rather than opening a file browser for a sound.
        if (source === "audio") {
          setNotice("Record audio on the previous step, under “What happened”.");
          return;
        }

        if (source === "photo" || source === "video") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setNotice("Camera access is off. You can still attach from your library.");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: source === "video" ? ["videos"] : ["images"],
            quality: 0.85,
            videoMaxDuration: 300,
            // EXIF is stripped before the file leaves the device: the report
            // carries the location the person chose on C4, not the one their
            // camera recorded.
            exif: false,
          });
          if (result.canceled) return;
          for (const asset of result.assets) {
            addAttachment({
              kind: kindFor(asset.mimeType ?? "", asset.type),
              mime: asset.mimeType ?? (source === "video" ? "video/mp4" : "image/jpeg"),
              uri: asset.uri,
              bytes: await sizeOf(asset.uri, asset.fileSize),
              durationMs: asset.duration ?? undefined,
              capturedAt: new Date().toISOString(),
            });
          }
          return;
        }

        if (source === "library" || source === "screenshots") {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            setNotice("Photo access is off. You can still take a photo or attach a file.");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: source === "screenshots" ? ["images"] : ["images", "videos"],
            allowsMultipleSelection: true,
            selectionLimit: 10,
            quality: 0.85,
            exif: false,
          });
          if (result.canceled) return;
          for (const asset of result.assets) {
            addAttachment({
              kind: kindFor(asset.mimeType ?? "", asset.type),
              mime: asset.mimeType ?? "image/jpeg",
              uri: asset.uri,
              bytes: await sizeOf(asset.uri, asset.fileSize),
              durationMs: asset.duration ?? undefined,
              // A library asset's own creation time is the honest capture time.
              capturedAt: assetCapturedAt(asset),
            });
          }
          return;
        }

        const result = await DocumentPicker.getDocumentAsync({
          type: "application/pdf",
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        for (const asset of result.assets) {
          addAttachment({
            kind: "document",
            mime: asset.mimeType ?? "application/pdf",
            uri: asset.uri,
            bytes: await sizeOf(asset.uri, asset.size ?? undefined),
          });
        }
      } catch {
        setNotice("That could not be attached. Try again, or try another way.");
      }
    },
    [addAttachment, sizeOf],
  );

  const next = useCallback(() => {
    // Optional step: an empty list is a complete answer and Next always proceeds.
    setStep(6);
    router.push("/report/flags");
  }, [setStep]);

  return (
    <WizardShell
      step={5}
      stepName="Evidence"
      stepNote="Optional"
      savedAt={savedAt}
      onClose={exit}
      onBack={() => router.back()}
      onNext={next}
      testID="wizard-evidence"
    >
      {/* Six tiles, three across. */}
      <View style={styles.grid}>
        {SOURCES.map((source) => (
          <Pressable
            key={source.key}
            onPress={() => pick(source.key)}
            accessibilityRole="button"
            accessibilityLabel={`Attach ${source.label.toLowerCase()}`}
            testID={`attach-${source.key}`}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
          >
            <SourceGlyph source={source.key} />
            <Text variant="metaSm" color={colors.t1} style={{ fontSize: 11.5 }}>
              {source.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {notice ? (
        <Text variant="bodyXs" color={colors.warn} style={{ marginTop: 12 }}>
          {notice}
        </Text>
      ) : null}

      {attachments.length > 0 ? (
        <>
          <SectionLabel style={{ marginTop: 22 }}>
            {`ATTACHED · ${attachments.length}${
              totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ""
            }`}
          </SectionLabel>

          <View style={{ gap: 9, marginTop: 10 }}>
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.localId}
                attachment={attachment}
                onRemove={() => void removeAttachment(attachment.localId)}
                onRetry={() => retryAttachment(attachment.localId)}
              />
            ))}
          </View>
        </>
      ) : (
        <Text variant="bodySm" color={colors.t3} style={{ marginTop: 22, lineHeight: 20 }}>
          A report without files still counts. Attach what you have — photos, a
          video, a recording, a letter — and nothing more.
        </Text>
      )}
    </WizardShell>
  );
}

/**
 * One attached file.
 *
 * Three visual states, matching the artboard: uploading shows a progress bar and a
 * percentage; sealed shows the capture and seal times plus a green shield; failed
 * says so and offers a retry that does not require re-picking the file.
 */
function AttachmentRow({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: DraftAttachment;
  onRemove: () => void;
  onRetry: () => void;
}): React.ReactElement {
  const label = useMemo(() => {
    const parts: string[] = [KIND_LABEL[attachment.kind]];
    if (attachment.durationMs) parts.push(formatDuration(attachment.durationMs));
    if (attachment.bytes) parts.push(formatBytes(attachment.bytes));
    return parts.join(" · ");
  }, [attachment]);

  const capturedTime = attachment.capturedAt
    ? new Date(attachment.capturedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const sealedTime = attachment.sealedAt
    ? new Date(attachment.sealedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        {attachment.kind === "audio" ? (
          <MicGlyph color={colors.t3} size={19} />
        ) : (
          <View style={styles.thumbFill} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="label" color={colors.t0} style={{ fontSize: 13 }}>
          {label}
        </Text>

        {attachment.state === "uploading" || attachment.state === "queued" ? (
          <>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.max(4, Math.round(attachment.progress * 100))}%` },
                ]}
              />
            </View>
            <Text variant="metaSm" color={colors.t4} style={{ marginTop: 5 }}>
              {attachment.state === "queued"
                ? "Waiting to upload"
                : `Uploading ${Math.round(attachment.progress * 100)}%`}
            </Text>
          </>
        ) : attachment.state === "failed" ? (
          <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={6}>
            <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 2, lineHeight: 16 }}>
              {attachment.error ?? "That upload did not finish."}
            </Text>
            <Text variant="metaSm" color={colors.acc} style={{ marginTop: 3 }}>
              Try again
            </Text>
          </Pressable>
        ) : (
          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
            {[
              capturedTime ? `Captured ${capturedTime}` : null,
              sealedTime ? `Sealed ${sealedTime}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
      </View>

      {attachment.state === "sealed" ? (
        <ShieldTick />
      ) : (
        <Pressable
          onPress={onRemove}
          hitSlop={11}
          accessibilityRole="button"
          accessibilityLabel="Remove this file"
        >
          <View style={styles.removeGlyph}>
            <View style={[styles.removeBar, { transform: [{ rotate: "45deg" }] }]} />
            <View style={[styles.removeBar, { transform: [{ rotate: "-45deg" }] }]} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const KIND_LABEL: Record<EvidenceKind, string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  document: "Document",
};

/** The green shield-and-tick that marks a sealed file. */
function ShieldTick(): React.ReactElement {
  return (
    <View style={styles.shield}>
      <View style={styles.shieldTickShort} />
      <View style={styles.shieldTickLong} />
    </View>
  );
}

/** Simple 20px glyphs for the six tiles, matching the artboard's stroke weight. */
function SourceGlyph({ source }: { source: Source }): React.ReactElement {
  if (source === "audio") return <MicGlyph size={20} />;

  if (source === "video") {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphBox, { width: 13, height: 11, marginRight: 5 }]} />
        <View style={styles.videoWedge} />
      </View>
    );
  }

  if (source === "files") {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphBox, { width: 13, height: 17, borderRadius: 3 }]} />
        <View style={[styles.glyphLine, { top: 6 }]} />
        <View style={[styles.glyphLine, { top: 10 }]} />
      </View>
    );
  }

  if (source === "screenshots") {
    return (
      <View style={styles.glyph}>
        <View style={[styles.glyphBox, { width: 12, height: 17, borderRadius: 3 }]} />
        <View style={[styles.glyphLine, { top: 5, width: 6 }]} />
        <View style={[styles.glyphLine, { top: 9, width: 6 }]} />
        <View style={[styles.glyphLine, { top: 13, width: 4 }]} />
      </View>
    );
  }

  // photo and library share the frame; the photo tile adds a lens.
  return (
    <View style={styles.glyph}>
      <View style={[styles.glyphBox, { width: 18, height: 13, borderRadius: 3 }]} />
      {source === "photo" ? <View style={styles.lens} /> : <View style={styles.range} />}
    </View>
  );
}

const styles = {
  grid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 9,
  },
  tile: {
    // Three across inside an 18px-padded screen: (100% - 2 gaps) / 3.
    width: "31.5%" as const,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.s3,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 7,
  },

  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    padding: 11,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 11,
    backgroundColor: colors.s6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  },
  thumbFill: { width: "100%" as const, height: "100%" as const, backgroundColor: colors.ph },

  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: alpha(colors.t0, 0.1),
    marginTop: 8,
    overflow: "hidden" as const,
  },
  fill: { height: "100%" as const, borderRadius: 2, backgroundColor: colors.acc },

  removeGlyph: { width: 18, height: 18, alignItems: "center" as const, justifyContent: "center" as const },
  removeBar: {
    position: "absolute" as const,
    width: 13,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: colors.t4,
  },

  shield: { width: 17, height: 18, alignItems: "center" as const, justifyContent: "center" as const },
  shieldTickShort: {
    position: "absolute" as const,
    width: 4,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.ok,
    transform: [{ rotate: "45deg" }, { translateX: -2.2 }, { translateY: 1.5 }],
  },
  shieldTickLong: {
    position: "absolute" as const,
    width: 8,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.ok,
    transform: [{ rotate: "-45deg" }, { translateX: 1 }],
  },

  glyph: { width: 20, height: 20, alignItems: "center" as const, justifyContent: "center" as const },
  glyphBox: { borderWidth: 1.6, borderColor: colors.acc, borderRadius: 2 },
  glyphLine: {
    position: "absolute" as const,
    width: 7,
    height: 1.4,
    borderRadius: 1,
    backgroundColor: colors.acc,
  },
  lens: {
    position: "absolute" as const,
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
    borderWidth: 1.6,
    borderColor: colors.acc,
  },
  range: {
    position: "absolute" as const,
    bottom: 5,
    width: 12,
    height: 5,
    borderTopWidth: 1.6,
    borderColor: colors.acc,
    transform: [{ rotate: "-12deg" }],
  },
  videoWedge: {
    position: "absolute" as const,
    right: 1,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.acc,
  },
};
