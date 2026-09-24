/**
 * D8 · Flag report → D9 · Flag sent.
 *
 * From D8: "Six reasons, single choice, nothing preselected. The same sheet with
 * three reasons serves a flagged comment."
 * From D9: "Names the reason back, gives a reference, and states what the author is
 * told. Hiding it from your own feed is offered here rather than assumed."
 *
 * ── Revision 2: the one taxonomy (docs/INCIDENT_MODULE_PLAN.md D6, D7, §3.1) ─
 * The reasons are now the eight policy categories — six for a comment — in the
 * member's words ("It threatens or encourages violence"), because a flag has to
 * land in the admin tab the member meant (*Direct Threat & Violence*). The board's
 * v7 swapped this sheet for a reasonless confirm; D7 keeps the picker, since a
 * category tab cannot be fed without a category. The catalogue is
 * `flagOptionsFor()` in `lib/report/moderation.ts`, word for word the server's
 * `MEMBER_FLAG_LABELS`.
 *
 * ── Three things this sheet promises ───────────────────────────────────────
 *   • "A moderator reads every flag. The person who filed the report is not told
 *     who flagged it." Said before the flag is sent, and again after.
 *   • "Safety flags are looked at within the hour." (§10) — threats, private
 *     details and graphic content, marked on their rows. D9 repeats the promise
 *     from the server's `expectedWithin`, not from the row tapped: flagging the
 *     same thing twice returns the *existing* flag (200, same reference), whose
 *     category may not be the one chosen this time — so D9 does not name the
 *     reason back any more.
 *   • Hiding is **offered, not assumed.** Someone who flags a report for exposing a
 *     plate may still want to follow it. The switch is off by default.
 *
 * A refusal is shown in the server's words — "You can't flag your own report.",
 * "That comment is not available.", the rate limit — rather than a vague retry.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, scrim, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { SwitchRow } from "@/components/ui/Controls";
import { SuccessTick } from "@/app/(auth)/reset/done";
import reportsApi, { type FlagReceipt } from "@/lib/api/reports";
import { flagOptionsFor, type PolicyCategory } from "@/lib/report/moderation";
import {
  SAFETY_ROW_HINT,
  flagErrorMessage,
  flagReceiptLine,
  flagSheetIntro,
} from "@/lib/report/detail";

/** The server's note limit (`reports.flag` / `comments.flag` validation). */
const NOTE_MAX = 1000;

export type FlagTarget = { kind: "report"; id: string } | { kind: "comment"; id: string };

export function FlagSheet({
  visible,
  target,
  onClose,
  onFlagged,
}: {
  visible: boolean;
  target: FlagTarget;
  onClose: () => void;
  /**
   * Called as soon as the server answers with a receipt — before Done — so the
   * screen can show "You flagged this" without waiting for a refetch.
   */
  onFlagged?: (receipt: FlagReceipt) => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const options = flagOptionsFor(target.kind);

  // Nothing preselected.
  const [reason, setReason] = useState<PolicyCategory | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<FlagReceipt | null>(null);
  const [hide, setHide] = useState(false);

  const reset = useCallback(() => {
    setReason(null);
    setNote("");
    setSent(null);
    setHide(false);
    setProblem(null);
    setBusy(false);
  }, []);

  // A different target is a different flag: never carry a half-made choice over.
  useEffect(() => {
    reset();
  }, [reset, target.kind, target.id]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const send = useCallback(async () => {
    if (busy) return;
    if (!reason) {
      setProblem("Choose a reason so the moderator knows what to look at.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const trimmed = note.trim() || undefined;
      const receipt =
        target.kind === "report"
          ? await reportsApi.flag(target.id, reason, trimmed)
          : await reportsApi.flagComment(target.id, reason, trimmed);
      setSent(receipt);
      onFlagged?.(receipt);
    } catch (err) {
      setProblem(flagErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [busy, note, onFlagged, reason, target]);

  const finish = useCallback(async () => {
    // Hiding happens on the way out, only if it was asked for.
    if (hide && target.kind === "report") {
      await reportsApi.hide(target.id).catch(() => {});
    }
    close();
  }, [close, hide, target]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={sent ? finish : close}
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: alpha(colors.deep, scrim.sheetDeep) }]}
          onPress={sent ? finish : close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.s2, maxHeight: "86%", paddingBottom: Math.max(insets.bottom, 12) },
          ]}
          testID="flag-sheet"
        >
          <View style={[styles.grabber, { backgroundColor: alpha(colors.t0, 0.18) }]} />

          {sent ? (
            /* D9 */
            <View style={{ paddingTop: 20 }} testID="flag-sent">
              <View style={[styles.tick, { backgroundColor: alpha(colors.ok, 0.14) }]}>
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
                {flagReceiptLine(sent.expectedWithin)}
              </Text>

              <View style={[styles.receipt, { backgroundColor: colors.s5 }]}>
                <ReceiptRow label="Reference" value={sent.flagRef} />
                <ReceiptRow label="You will hear back" value="By email" />
                {/* The promise, restated — in the server's words. */}
                <ReceiptRow label="The author is told" value={sent.authorIsTold || "Nothing about you"} />
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
                  {target.kind === "comment" ? "Why are you flagging this comment?" : "Why are you flagging this?"}
                </Text>
                <Text variant="bodyXs" color={colors.t3} style={{ marginTop: 6, lineHeight: 19 }}>
                  {flagSheetIntro(target.kind)}
                </Text>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                keyboardShouldPersistTaps="handled"
              >
                <View accessibilityRole="radiogroup">
                  {options.map((option, index) => {
                    const selected = reason === option.code;
                    return (
                      <Pressable
                        key={option.code}
                        onPress={() => {
                          setReason(option.code);
                          setProblem(null);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, checked: selected }}
                        accessibilityLabel={
                          option.safety ? `${option.label}. ${SAFETY_ROW_HINT}` : option.label
                        }
                        style={({ pressed }) => [
                          styles.reasonRow,
                          index < options.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: alpha(colors.t0, 0.06),
                          },
                          pressed && { opacity: 0.9 },
                        ]}
                        testID={`flag-reason-${option.code}`}
                      >
                        <View
                          style={[
                            styles.radio,
                            { borderColor: colors.line },
                            selected && { borderWidth: 5, borderColor: colors.acc, backgroundColor: colors.bg },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text variant="body" color={colors.t0} style={{ fontSize: 14 }}>
                            {option.label}
                          </Text>
                          {option.safety ? (
                            <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
                              {SAFETY_ROW_HINT}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 16 }}>
                  ANYTHING TO ADD{" "}
                  <Text variant="metaSm" color={colors.t5}>
                    — optional
                  </Text>
                </Text>
                <TextField
                  value={note}
                  onChangeText={(value) => setNote(value.slice(0, NOTE_MAX))}
                  maxLength={NOTE_MAX}
                  placeholder="What should the moderator look at?"
                  multiline
                  multilineHeight={76}
                  containerStyle={{ marginTop: 8 }}
                  testID="flag-note"
                />
              </ScrollView>

              <View style={[styles.footer, { borderTopColor: alpha(colors.t0, 0.07) }]}>
                {problem ? (
                  <Text
                    variant="metaSm"
                    color={colors.bad2}
                    style={{ marginBottom: 10 }}
                    accessibilityLiveRegion="polite"
                    testID="flag-problem"
                  >
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
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
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
  },

  reasonRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 13 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.6,
  },

  footer: {
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  tick: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  receipt: {
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 18,
    gap: 9,
  },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});

export default FlagSheet;
