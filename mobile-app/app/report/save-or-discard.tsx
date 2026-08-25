/**
 * C10 · Save or discard, and C11 · Discard confirm.
 *
 * Both live here because C11 only ever opens from C10, and keeping them in one
 * route means the backdrop never flickers between them.
 *
 * ── C10's ordering is the design ───────────────────────────────────────────
 * "Three actions in order of likelihood; Discard is last, in red, and never the
 * default." Most people who tap × mean "not now", so Save draft is the accent
 * action and Discard is a bare text row at the bottom.
 *
 * ── C11 is a dialog, not a sheet ───────────────────────────────────────────
 * "A centred dialog, not a sheet, so it doesn't look like the step it interrupts.
 * The safe choice is the wider target." So Keep the draft is the full-width row and
 * Discard it sits above it — the destructive action is reachable but not the one
 * your thumb finds by default.
 */

import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { CATEGORY_META } from "@/lib/api/reports";

export default function SaveOrDiscardScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { payload, attachments, completedSteps, step, saveNow, discard } = useReportDraft();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const keepWriting = useCallback(() => router.back(), []);

  const save = useCallback(async () => {
    setBusy(true);
    await saveNow();
    setBusy(false);
    // Leaves the wizard entirely — the draft is in the Vault to resume.
    router.dismissAll();
    router.replace("/(tabs)");
  }, [saveNow]);

  const reallyDiscard = useCallback(async () => {
    setBusy(true);
    await discard();
    setBusy(false);
    router.dismissAll();
    router.replace("/(tabs)");
  }, [discard]);

  const fileCount = attachments.length;
  const categoryLabel = payload.category ? CATEGORY_META[payload.category].label : null;

  return (
    <View style={styles.root}>
      {/* The step behind, dimmed — the sheet interrupts rather than replaces. */}
      <Pressable style={styles.backdrop} onPress={keepWriting} accessibilityRole="button" accessibilityLabel="Keep writing" />

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
        <View style={styles.grabber} />

        <Text variant="sectionTitle" color={colors.t0} style={{ marginTop: 18 }}>
          Keep this report for later?
        </Text>
        <Text variant="bodySm" color={colors.t2} style={{ marginTop: 8, lineHeight: 21 }}>
          {`You're on step ${step} of 7. A draft keeps everything you have written${
            fileCount > 0
              ? ` and the ${fileCount === 1 ? "file" : `${fileCount} files`} you attached`
              : ""
          }.`}
        </Text>

        {/* The draft preview card, so it is obvious what is being kept. */}
        <View style={styles.previewCard}>
          <Text variant="cardTitleSm" color={colors.t0} style={{ fontSize: 15 }}>
            {payload.title?.trim() || "Untitled report"}
          </Text>
          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 6 }}>
            {[
              categoryLabel,
              fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : null,
              `${completedSteps} of 7 steps done`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>

        <Button
          label="Save draft"
          onPress={save}
          loading={busy && !confirming}
          style={{ marginTop: 16 }}
          testID="save-draft"
        />
        <Button
          label="Keep writing"
          variant="secondary"
          onPress={keepWriting}
          style={{ marginTop: 9 }}
          testID="keep-writing"
        />
        <TextButton
          label="Discard"
          color={colors.bad2}
          onPress={() => setConfirming(true)}
          testID="discard"
        />
      </View>

      {/* C11 — a centred dialog. */}
      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirming(false)}
      >
        <View style={styles.dialogRoot}>
          <Pressable
            style={styles.dialogBackdrop}
            onPress={() => setConfirming(false)}
            accessibilityRole="button"
            accessibilityLabel="Keep the draft"
          />
          <View style={styles.dialog}>
            <View style={styles.dialogMark}>
              <TrashGlyph />
            </View>

            <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 16 }}>
              Discard this report?
            </Text>
            <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 20 }}>
              {fileCount > 0
                ? `Everything you wrote and ${
                    fileCount === 1 ? "the attached file" : `all ${fileCount} attached files`
                  } are deleted. This cannot be undone.`
                : "Everything you wrote is deleted. This cannot be undone."}
            </Text>

            <Button
              label="Discard it"
              variant="destructive"
              onPress={reallyDiscard}
              loading={busy}
              // No selection tap on a destruction: the haptic belongs to the
              // outcome, not to the moment of committing to it.
              noHaptics
              style={{ marginTop: 18 }}
              testID="confirm-discard"
            />
            {/* The safe choice is the wider target. */}
            <TextButton
              label="Keep the draft"
              color={colors.t1}
              height={48}
              onPress={() => setConfirming(false)}
              testID="keep-draft"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** The 22px bin from the C11 artboard. */
function TrashGlyph(): React.ReactElement {
  return (
    <View style={{ width: 22, height: 22, alignItems: "center" }}>
      <View style={styles.trashLid} />
      <View style={styles.trashBody} />
    </View>
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
  previewCard: {
    backgroundColor: colors.s5,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 16,
  },

  dialogRoot: { flex: 1, alignItems: "center", justifyContent: "center" },
  dialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha(colors.deep, scrim.dialog),
  },
  dialog: {
    // Inset 26px, per the artboard.
    marginHorizontal: 26,
    alignSelf: "stretch",
    backgroundColor: colors.s5,
    borderRadius: radius.dialog,
    padding: 22,
  },
  dialogMark: {
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: alpha(colors.bad, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },

  trashLid: {
    width: 14,
    height: 1.7,
    backgroundColor: colors.bad2,
    marginTop: 4,
  },
  trashBody: {
    width: 11,
    height: 12,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderColor: colors.bad2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    marginTop: 1,
  },
});
