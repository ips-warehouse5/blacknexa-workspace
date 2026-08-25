/**
 * D10 · Share this report.
 *
 * From the caption: "The **'what a recipient sees' card is the point of the
 * screen**; Copy link confirms in place rather than by toast."
 *
 * So the card is not a footnote — it is the reason someone can share a report they
 * filed anonymously without accidentally outing themselves. The three promises it
 * makes are asserted by the API too (`recipientSees`), so the copy here cannot
 * drift from what the server actually does.
 *
 * Copy confirms in place because a toast is gone before the reader has decided
 * whether it worked, and this is a link they may be about to paste somewhere
 * consequential.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, Share, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ShieldGlyph } from "@/components/report/TrustCard";
import reportsApi, { type ReportDetailView } from "@/lib/api/reports";

export function ReportShareSheet({
  visible,
  report,
  onClose,
}: {
  visible: boolean;
  report: ReportDetailView;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Mint the link on open, so a stale token is never shared. */
  useEffect(() => {
    if (!visible) {
      setUrl(null);
      setCopied(false);
      setError(null);
      return;
    }
    void reportsApi
      .shareLink(report.id)
      .then((result) => setUrl(result.url))
      .catch(() => setError("That link could not be created. Try again."));
  }, [report.id, visible]);

  const copy = useCallback(async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    // Confirms in place — no toast.
    setTimeout(() => setCopied(false), 2400);
  }, [url]);

  const systemShare = useCallback(async () => {
    if (!url) return;
    await Share.share({
      // The title travels, the author never does.
      message: `${report.title}\n\n${url}`,
      title: report.title,
    }).catch(() => {});
  }, [report.title, url]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
          <View style={styles.grabber} />

          <Text variant="sectionTitle" color={colors.t0} style={{ marginTop: 18, fontSize: 20 }}>
            Share this report
          </Text>

          {/* Link preview, as the recipient's app will render it. */}
          <View style={styles.preview}>
            <View style={styles.previewBand} />
            <View style={{ padding: 13 }}>
              <Text variant="cardTitleSm" color={colors.t0} numberOfLines={2} style={{ fontSize: 14.5 }}>
                {report.title}
              </Text>
              <Text variant="metaSm" color={colors.t4} style={{ marginTop: 5 }}>
                {`blacknexa.org/r/${report.caseRef}${
                  report.status === "verified" ? " · Verified report" : ""
                }`}
              </Text>
            </View>
          </View>

          {/* The point of the screen. */}
          <View style={styles.promiseCard}>
            <ShieldGlyph tint={colors.acc} size={18} />
            <View style={{ flex: 1 }}>
              <Text variant="labelSm" color={colors.t0}>
                What a recipient sees
              </Text>
              <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 4, lineHeight: 19 }}>
                The report, its evidence and its comments — the same public page you
                are reading. They do not see your name, the exact location, or that
                you shared it.
              </Text>
            </View>
          </View>

          {/* The link, with in-place confirmation. */}
          <View style={styles.linkRow}>
            <Text
              variant="bodySm"
              color={colors.t1}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {url ?? (error ? "—" : "Creating a link…")}
            </Text>
            <Pressable
              onPress={copy}
              disabled={!url}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Link copied" : "Copy link"}
              style={({ pressed }) => [
                styles.copyChip,
                copied && { backgroundColor: alpha(colors.ok, 0.14) },
                !url && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
              testID="copy-share-link"
            >
              <Text variant="chip" color={copied ? colors.ok : colors.t0}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 8 }}>
              {error}
            </Text>
          ) : null}

          {/*
            One button rather than the artboard's Email / Message / More trio.
            The OS share sheet already lists every installed app, correctly ordered
            for this person — reimplementing three of its rows would be a worse,
            shorter list.
          */}
          <Button
            label="Share…"
            variant="secondary"
            onPress={systemShare}
            disabled={!url}
            style={{ marginTop: 14 }}
            testID="system-share"
          />
          <Button
            label="Cancel"
            variant="quiet"
            onPress={onClose}
            style={{ marginTop: 9 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, scrim.sheetDeep) },
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
  preview: {
    backgroundColor: colors.s5,
    borderRadius: radius.xl,
    overflow: "hidden",
    marginTop: 14,
  },
  previewBand: { height: 104, backgroundColor: colors.ph },
  promiseCard: {
    flexDirection: "row",
    gap: 11,
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.s5,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  copyChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: colors.s6,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ReportShareSheet;
