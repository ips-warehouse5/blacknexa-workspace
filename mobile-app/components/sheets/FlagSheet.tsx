/**
 * D8 · Flag report → D9 · Flag sent.
 *
 * From D8: "Six reasons, single choice, nothing preselected. The same sheet with
 * three reasons serves a flagged comment."
 * From D9: "Names the reason back, gives a reference, and states what the author is
 * told. Hiding it from your own feed is offered here rather than assumed."
 *
 * ── Two things this sheet promises ─────────────────────────────────────────
 *   • "A moderator reads every flag. The person who filed the report is not told
 *     who flagged it." Said before the flag is sent, and again after.
 *   • Hiding is **offered, not assumed.** Someone who flags a report for exposing a
 *     plate may still want to follow it. The switch is off by default.
 */

import React, { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { SwitchRow } from "@/components/ui/Controls";
import { SuccessTick } from "@/app/(auth)/reset/done";
import reportsApi, { type FlagReason } from "@/lib/api/reports";

interface ReasonOption {
  value: FlagReason;
  label: string;
  hint?: string;
}

/** D8's six, for a report. */
const REPORT_REASONS: ReasonOption[] = [
  { value: "untrue", label: "It isn't true", hint: "Invented, or the evidence doesn't match" },
  {
    value: "private_details",
    label: "It exposes someone's private details",
    hint: "A name, address, plate or face that shouldn't be here",
  },
  { value: "threatening", label: "It threatens or targets a person" },
  { value: "graphic", label: "Graphic content with no warning" },
  { value: "spam", label: "Spam or advertising" },
  { value: "other", label: "Something else" },
];

/** The same sheet with three, for a comment. */
const COMMENT_REASONS: ReasonOption[] = [
  { value: "threatening", label: "It threatens or targets a person" },
  {
    value: "private_details",
    label: "It exposes someone's private details",
    hint: "A name, address, plate or face that shouldn't be here",
  },
  { value: "spam", label: "Spam or advertising" },
];

export type FlagTarget = { kind: "report"; id: string } | { kind: "comment"; id: string };

export function FlagSheet({
  visible,
  target,
  onClose,
}: {
  visible: boolean;
  target: FlagTarget;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const reasons = target.kind === "report" ? REPORT_REASONS : COMMENT_REASONS;

  // Nothing preselected.
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<{ flagRef: string; expectedWithin?: string } | null>(null);
  const [hide, setHide] = useState(false);

  const reset = useCallback(() => {
    setReason(null);
    setNote("");
    setSent(null);
    setHide(false);
    setProblem(null);
  }, []);

  const send = useCallback(async () => {
    if (!reason) {
      setProblem("Choose a reason so the moderator knows what to look at.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (target.kind === "report") {
        const result = await reportsApi.flag(target.id, reason, note.trim() || undefined);
        setSent({ flagRef: result.flagRef, expectedWithin: result.expectedWithin });
      } else {
        const result = await reportsApi.flagComment(target.id, reason, note.trim() || undefined);
        setSent({ flagRef: result.flagRef });
      }
    } catch {
      setProblem("That flag did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }, [note, reason, target]);

  const finish = useCallback(async () => {
    // Hiding happens on the way out, only if it was asked for.
    if (hide && target.kind === "report") {
      await reportsApi.hide(target.id).catch(() => {});
    }
    reset();
    onClose();
  }, [hide, onClose, reset, target]);

  const chosenLabel = reasons.find((option) => option.value === reason)?.label.toLowerCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={sent ? finish : onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={sent ? finish : onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View style={[styles.sheet, { maxHeight: "86%", paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.grabber} />

          {sent ? (
            /* D9 */
            <View style={{ paddingTop: 20 }}>
              <View style={styles.tick}>
                <SuccessTick size={24} />
              </View>

              <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 18 }}>
                Thank you — a moderator will look
              </Text>
              <Text
                variant="bodySm"
                color={colors.t2}
                center
                style={{ marginTop: 10, lineHeight: 21 }}
              >
                {`Flagged for ${chosenLabel}. ${
                  sent.expectedWithin === "within the hour"
                    ? "A safety flag is seen within the hour."
                    : "Most flags are reviewed within a day; a safety flag is seen within the hour."
                }`}
              </Text>

              <View style={styles.receipt}>
                <ReceiptRow label="Reference" value={sent.flagRef} />
                <ReceiptRow label="You will hear back" value="By email" />
                {/* The promise, restated. */}
                <ReceiptRow label="The author is told" value="Nothing about you" />
              </View>

              {target.kind === "report" ? (
                <SwitchRow
                  title="Hide this report from my feed"
                  value={hide}
                  onValueChange={setHide}
                  style={{ marginTop: 10 }}
                  testID="hide-after-flag"
                />
              ) : null}

              <Button
                label="Done"
                variant="secondary"
                onPress={finish}
                style={{ marginTop: 14 }}
                testID="flag-done"
              />
            </View>
          ) : (
            /* D8 */
            <>
              <View style={{ paddingTop: 16, paddingBottom: 4 }}>
                <Text variant="sectionTitle" color={colors.t0} style={{ fontSize: 20 }}>
                  Why are you flagging this?
                </Text>
                <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 6, lineHeight: 19 }}>
                  A moderator reads every flag. The person who filed the report is
                  not told who flagged it.
                </Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
                {reasons.map((option, index) => {
                  const selected = reason === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        setReason(option.value);
                        setProblem(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={
                        option.hint ? `${option.label}. ${option.hint}` : option.label
                      }
                      style={({ pressed }) => [
                        styles.reasonRow,
                        index < reasons.length - 1 && styles.reasonDivider,
                        pressed && { opacity: 0.9 },
                      ]}
                      testID={`flag-reason-${option.value}`}
                    >
                      <View style={[styles.radio, selected && styles.radioOn]} />
                      <View style={{ flex: 1 }}>
                        <Text variant="body" color={colors.t0} style={{ fontSize: 14 }}>
                          {option.label}
                        </Text>
                        {option.hint ? (
                          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
                            {option.hint}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}

                <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 16 }}>
                  ANYTHING TO ADD{" "}
                  <Text variant="metaSm" color={colors.t5}>
                    — optional
                  </Text>
                </Text>
                <TextField
                  value={note}
                  onChangeText={setNote}
                  placeholder="What should the moderator look at?"
                  multiline
                  multilineHeight={76}
                  containerStyle={{ marginTop: 8 }}
                  testID="flag-note"
                />
              </ScrollView>

              <View style={styles.footer}>
                {problem ? (
                  <Text variant="metaSm" color={colors.bad2} style={{ marginBottom: 10 }}>
                    {problem}
                  </Text>
                ) : null}
                <Button label="Send flag" onPress={send} loading={busy} testID="send-flag" />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.receiptRow}>
      <Text variant="labelSm" color={colors.t3}>
        {label}
      </Text>
      <Text variant="labelSm" color={colors.t0}>
        {value}
      </Text>
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

  reasonRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 13 },
  reasonDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.06),
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.6,
    borderColor: colors.line,
  },
  radioOn: { borderWidth: 5, borderColor: colors.acc, backgroundColor: colors.bg },

  footer: {
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(colors.t0, 0.07),
  },

  tick: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: alpha(colors.ok, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  receipt: {
    backgroundColor: colors.s5,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 18,
    gap: 9,
  },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});

export default FlagSheet;
