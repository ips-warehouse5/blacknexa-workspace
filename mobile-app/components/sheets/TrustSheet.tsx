/**
 * D3 · Trust sheet.
 *
 * From the caption: "The only place technical language is allowed, and even here
 * **every section hides its specs behind 'Show the technical detail'**."
 *
 * So this sheet has two layers. The outer one is still plain English — "Unchanged",
 * "Sealed on upload", a four-step scale with a sentence — and the hashes sit behind
 * a disclosure inside it. A trust sheet that opens onto a wall of hex would fail the
 * same people D1 was careful to protect from one.
 */

import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ShieldGlyph } from "@/components/report/TrustCard";
import reportsApi, { absoluteTime, type EvidenceStrength } from "@/lib/api/reports";

/** The four-step scale, in order. */
const SCALE: { value: EvidenceStrength; label: string }[] = [
  { value: "thin", label: "Thin" },
  { value: "fair", label: "Fair" },
  { value: "strong", label: "Strong" },
  { value: "very_strong", label: "Very strong" },
];

export function TrustSheet({
  visible,
  reportRef,
  onClose,
}: {
  visible: boolean;
  reportRef: string;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [showTech, setShowTech] = useState(false);

  const trust = useQuery({
    queryKey: ["trust", reportRef],
    queryFn: () => reportsApi.trust(reportRef),
    enabled: visible,
  });

  const data = trust.data;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View style={[styles.sheet, { maxHeight: "86%", paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.grabber} />

          {/* Verified banner, or the honest alternative. */}
          <View
            style={[
              styles.banner,
              {
                backgroundColor: data?.verifiedAt
                  ? alpha(colors.ok, 0.11)
                  : alpha(colors.t0, 0.05),
              },
            ]}
          >
            <ShieldGlyph tint={data?.verifiedAt ? colors.ok : colors.t3} size={22} />
            <View style={{ flex: 1 }}>
              <Text
                variant="labelLg"
                color={data?.verifiedAt ? colors.ok : colors.t2}
                style={{ fontSize: 14.5 }}
              >
                {data?.verifiedAt
                  ? `Verified by ${data.verifiedBy ?? "a moderator"}`
                  : "Not yet reviewed"}
              </Text>
              <Text variant="metaSm" color={colors.t2} style={{ marginTop: 2 }}>
                {data?.verifiedAt
                  ? absoluteTime(data.verifiedAt)
                  : "A moderator reads every report before it is verified."}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 18 }}>
            {/* Per-file integrity, in one word each. */}
            <Text variant="fieldLabel" color={colors.t3}>
              EACH FILE
            </Text>
            {data && data.files.length > 0 ? (
              <View style={{ gap: 9, marginTop: 10 }}>
                {data.files.map((file) => (
                  <View key={file.id} style={styles.fileRow}>
                    <Text variant="label" color={colors.t0}>
                      {file.label}
                    </Text>
                    <Text
                      variant="labelSm"
                      color={file.unchanged ? colors.ok : colors.warn}
                    >
                      {file.unchanged ? "Unchanged" : "Not sealed"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="bodySm" color={colors.t3} style={{ marginTop: 10 }}>
                No files were attached to this report.
              </Text>
            )}

            {/* The disclosure. Specs live behind it, never in front. */}
            <Pressable
              onPress={() => setShowTech((open) => !open)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ expanded: showTech }}
              style={{ marginTop: 12 }}
              testID="show-technical"
            >
              <Text variant="labelSm" color={colors.acc}>
                {showTech ? "Hide the technical detail" : "Show the technical detail"}
              </Text>
            </Pressable>

            {showTech ? (
              <View style={styles.techBox}>
                <Text variant="metaSm" color={colors.t3} style={{ lineHeight: 18 }}>
                  Each file is hashed with SHA-256 when it arrives and stored
                  encrypted with AES-256-GCM. &ldquo;Unchanged&rdquo; means the
                  stored bytes still match the hash recorded at that moment.
                </Text>
                <Text variant="metaSm" color={colors.t3} style={{ marginTop: 8, lineHeight: 18 }}>
                  This is a safeguard, not a promise that a court will accept the
                  file.
                </Text>
              </View>
            ) : null}

            {/* Provenance. */}
            <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 24 }}>
              WHERE IT HAS BEEN
            </Text>
            <View style={{ marginTop: 12 }}>
              {(data?.provenance ?? []).map((event, index, all) => (
                <View key={`${event.status}-${event.at}`} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDot} />
                    {index < all.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={{ paddingBottom: index < all.length - 1 ? 14 : 0, flex: 1 }}>
                    <Text variant="label" color={colors.t0}>
                      {PROVENANCE_LABEL[event.status] ?? event.status}
                    </Text>
                    <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
                      {[absoluteTime(event.at), event.actorLabel].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* The four-step scale, plus its justification sentence. */}
            <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
              EVIDENCE STRENGTH
            </Text>
            <View style={styles.scale}>
              {SCALE.map((step) => {
                const active = data?.strength === step.value;
                return (
                  <View
                    key={step.value}
                    style={[
                      styles.scaleStep,
                      active && { backgroundColor: alpha(colors.ok, 0.16) },
                    ]}
                  >
                    <Text
                      variant="chipSm"
                      color={active ? colors.ok : colors.t4}
                      style={{ fontSize: 11 }}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            {data?.rationale ? (
              <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 11, lineHeight: 19 }}>
                {data.rationale}
              </Text>
            ) : null}
          </ScrollView>

          <Button
            label="Close"
            variant="secondary"
            onPress={onClose}
            style={{ marginTop: 14 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const PROVENANCE_LABEL: Record<string, string> = {
  submitted: "Filed from this device",
  under_review: "Opened by a moderator",
  verified: "Checked by a moderator",
  dismissed: "Dismissed after review",
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.deep, 0.62) },
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 16,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.s5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  techBox: {
    backgroundColor: colors.s1,
    borderRadius: 12,
    padding: 13,
    marginTop: 10,
  },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { alignItems: "center", width: 9 },
  timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.acc, marginTop: 4 },
  timelineLine: { flex: 1, width: 2, backgroundColor: alpha(colors.t0, 0.12) },
  scale: { flexDirection: "row", gap: 6, marginTop: 11 },
  scaleStep: {
    flex: 1,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.s5,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default TrustSheet;
