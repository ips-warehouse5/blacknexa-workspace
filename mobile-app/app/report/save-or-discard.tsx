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
 *
 * ── Before opening another draft (F1 → Resume, `?switchTo=<id>`) ───────────
 * The device holds one draft at a time, so opening a Vault draft while a different
 * one has content asks the same question first (docs/INCIDENT_MODULE_PLAN.md §10
 * "Vault F1"). Save draft then has to *reach the server* — the local copy is
 * about to be replaced, and a draft kept only on this device would be lost with
 * it — so a failed save is shown and nothing is switched. Keep writing stays on
 * the draft already here.
 */

import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, screenPadding, scrim, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";
import { stepRoute } from "@/components/report/WizardShell";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { CATEGORY_META } from "@/lib/api/reports";

export default function SaveOrDiscardScreen(): React.ReactElement {
  useThemeSync();
  const insets = useSafeAreaInsets();
  const { switchTo } = useLocalSearchParams<{ switchTo?: string }>();
  const {
    payload,
    attachments,
    completedSteps,
    step,
    saveNow,
    discard,
    stagedDraft,
    adoptStagedDraft,
    clearStagedDraft,
  } = useReportDraft();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** Switching only when the entry screen staged exactly that draft. */
  const switching = Boolean(switchTo) && stagedDraft?.id === switchTo;

  /**
   * Replace this sheet with a step. The blank entry screen stays beneath it, which
   * the steps' Back treats as nothing to return to (`useStepNavigation`).
   */
  const openStep = useCallback((target: number) => {
    router.replace(stepRoute(target));
  }, []);

  const keepWriting = useCallback(() => {
    if (switching) {
      clearStagedDraft();
      openStep(step);
      return;
    }
    router.back();
  }, [clearStagedDraft, openStep, step, switching]);

  /** Android back is Keep writing — the safe answer — never a silent switch. */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (confirming) {
        setConfirming(false);
      } else if (!busy) {
        keepWriting();
      }
      return true;
    });
    return () => subscription.remove();
  }, [busy, confirming, keepWriting]);

  /** After the local draft is saved or discarded: open the staged one. */
  const openStaged = useCallback(async () => {
    const target = await adoptStagedDraft();
    openStep(target ?? 1);
  }, [adoptStagedDraft, openStep]);

  const save = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await saveNow();
    if (switching) {
      if (!outcome.saved) {
        setBusy(false);
        setProblem(
          `This draft could not reach your account, so it is still on this device and the other one was not opened. ${
            outcome.message ?? ""
          }`.trim(),
        );
        return;
      }
      await openStaged();
      setBusy(false);
      return;
    }
    setBusy(false);
    // Leaves the wizard entirely — the draft is in the Vault to resume, and on
    // this device whether or not the server copy landed.
    router.dismissAll();
    router.replace("/(tabs)");
  }, [openStaged, saveNow, switching]);

  const reallyDiscard = useCallback(async () => {
    setBusy(true);
    await discard();
    if (switching) {
      setConfirming(false);
      await openStaged();
      setBusy(false);
      return;
    }
    setBusy(false);
    router.dismissAll();
    router.replace("/(tabs)");
  }, [discard, openStaged, switching]);

  const fileCount = attachments.length;
  const categoryLabel = payload.category ? CATEGORY_META[payload.category].label : null;
  const filesClause =
    fileCount > 0 ? ` and the ${fileCount === 1 ? "file" : `${fileCount} files`} you attached` : "";

  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      {/* The step behind, dimmed — the sheet interrupts rather than replaces. */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.deep, scrim.sheetDeep) }]}
        onPress={busy ? undefined : keepWriting}
        accessibilityRole="button"
        accessibilityLabel="Keep writing"
      />

      <View
        style={{
          backgroundColor: colors.s2,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          paddingHorizontal: screenPadding.detail,
          paddingTop: 9,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
        }}
        testID="save-or-discard"
      >
        <View
          style={{
            alignSelf: "center",
            width: 38,
            height: 4,
            borderRadius: 2,
            backgroundColor: alpha(colors.t0, 0.18),
          }}
        />

        <Text variant="sectionTitle" color={colors.t0} style={{ marginTop: 18 }}>
          Keep this report for later?
        </Text>
        <Text variant="bodySm" color={colors.t2} style={{ marginTop: 8, lineHeight: 21 }}>
          {switching
            ? `Opening a draft from your Vault replaces the report on this device. This one is on step ${step} of 7 — saving it keeps everything you have written${filesClause} in your Vault.`
            : `You're on step ${step} of 7. A draft keeps everything you have written${filesClause}.`}
        </Text>

        {/* The draft preview card, so it is obvious what is being kept. */}
        <View
          style={{
            backgroundColor: colors.s5,
            borderRadius: radius.lg,
            padding: 14,
            marginTop: 16,
          }}
        >
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

        {problem ? (
          <Text
            variant="metaSm"
            color={colors.bad2}
            style={{ marginTop: 12, lineHeight: 17 }}
            testID="save-problem"
          >
            {problem}
          </Text>
        ) : null}

        <Button
          label="Save draft"
          onPress={save}
          loading={busy && !confirming}
          disabled={busy && confirming}
          style={{ marginTop: 16 }}
          testID="save-draft"
        />
        <Button
          label="Keep writing"
          variant="secondary"
          onPress={keepWriting}
          disabled={busy}
          style={{ marginTop: 9 }}
          testID="keep-writing"
        />
        <TextButton
          label="Discard"
          color={colors.bad2}
          onPress={() => {
            if (!busy) setConfirming(true);
          }}
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.deep, scrim.dialog) }]}
            onPress={() => setConfirming(false)}
            accessibilityRole="button"
            accessibilityLabel="Keep the draft"
          />
          <View
            style={{
              // Inset 26px, per the artboard.
              marginHorizontal: 26,
              alignSelf: "stretch",
              backgroundColor: colors.s5,
              borderRadius: radius.dialog,
              padding: 22,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 44,
                height: 44,
                borderRadius: radius.lg,
                backgroundColor: alpha(colors.bad, 0.14),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
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
      <View style={{ width: 14, height: 1.7, backgroundColor: colors.bad2, marginTop: 4 }} />
      <View
        style={{
          width: 11,
          height: 12,
          borderWidth: 1.7,
          borderTopWidth: 0,
          borderColor: colors.bad2,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          marginTop: 1,
        }}
      />
    </View>
  );
}
