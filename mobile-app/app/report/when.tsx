/**
 * C3 · Step 3 of 7 — "When did it happen?"
 *
 * Three details from the caption drive the layout:
 *
 *   "Future dates are unselectable."
 *   "A card always restates occurred versus filed so the two are never confused
 *    later."
 *   "It's happening now … Collapses everything below to one line."
 *
 * The occurred-versus-filed card is the quiet one that matters. A report filed
 * hours after the event is normal — someone gets home, calms down, and writes it
 * up — and the design says so in as many words: "A gap between the two is normal
 * and is never held against a report."
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { Checkbox, SegmentedControl, SwitchRow } from "@/components/ui/Controls";
import { WizardShell, cardHairline } from "@/components/report/WizardShell";
import { Chevron } from "@/app/report/details";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";
import { absoluteTime, type DayPart } from "@/lib/api/reports";

type QuickChoice = "today" | "yesterday" | "week";

const DAY_PARTS: { value: DayPart; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

function startOfDayOffset(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export default function WhenStep(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { payload, patch, setStep, savedAt } = useReportDraft();
  const exit = useWizardExit();

  // Ensure we always have a valid Date instance and never an invalid Date or Unix epoch 0
  const initialDate = useMemo(() => {
    if (payload.occurredAt) {
      const parsed = new Date(payload.occurredAt);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1970) {
        return parsed;
      }
    }
    return new Date();
  }, [payload.occurredAt]);

  const [occurred, setOccurred] = useState<Date>(initialDate);
  const [tempDate, setTempDate] = useState<Date>(initialDate);
  const [happeningNow, setHappeningNow] = useState(payload.happeningNow ?? false);
  const [timeUnknown, setTimeUnknown] = useState(payload.occurredPrecision === "day_part");
  const [dayPart, setDayPart] = useState<DayPart>(payload.occurredDayPart ?? "afternoon");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Sync if draft is loaded after initial mount
  useEffect(() => {
    if (payload.occurredAt) {
      const parsed = new Date(payload.occurredAt);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1970) {
        setOccurred(parsed);
      }
    }
  }, [payload.occurredAt]);

  const filedAt = useMemo(() => new Date().toISOString(), []);

  /** Push the whole time answer into the draft in one shape. */
  const commit = useCallback(
    (next: {
      when?: Date;
      now?: boolean;
      unknown?: boolean;
      part?: DayPart;
    }) => {
      const value = next.when ?? occurred;
      const isNow = next.now ?? happeningNow;
      const unknown = next.unknown ?? timeUnknown;
      patch({
        // "It's happening now" is the time — there is nothing else to answer.
        occurredAt: (isNow ? new Date() : value).toISOString(),
        happeningNow: isNow,
        occurredPrecision: isNow ? "exact" : unknown ? "day_part" : "exact",
        occurredDayPart: !isNow && unknown ? (next.part ?? dayPart) : undefined,
      });
    },
    [dayPart, happeningNow, occurred, patch, timeUnknown],
  );

  const chooseQuick = useCallback(
    (choice: QuickChoice) => {
      const base =
        choice === "today"
          ? startOfDayOffset(0)
          : choice === "yesterday"
            ? startOfDayOffset(1)
            : startOfDayOffset(3);
      // Keep the time already chosen; only the day moves.
      base.setHours(occurred.getHours(), occurred.getMinutes(), 0, 0);
      setOccurred(base);
      commit({ when: base });
    },
    [commit, occurred],
  );

  const openPicker = useCallback(
    (mode: "date" | "time") => {
      const startValue = !isNaN(occurred.getTime()) && occurred.getFullYear() > 1970
        ? new Date(occurred)
        : new Date();
      setTempDate(startValue);
      setPicker(mode);
    },
    [occurred],
  );

  const onConfirmIos = useCallback(() => {
    const base = new Date(occurred);
    if (picker === "date") {
      // Merge selected year/month/date with existing hour/minute
      base.setFullYear(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());
    } else if (picker === "time") {
      // Merge selected hour/minute with existing year/month/date
      base.setHours(tempDate.getHours(), tempDate.getMinutes(), 0, 0);
    }
    const clamped = base.getTime() > Date.now() ? new Date() : base;
    setOccurred(clamped);
    commit({ when: clamped });
    setProblem(null);
    setPicker(null);
  }, [commit, occurred, picker, tempDate]);

  const onCancelIos = useCallback(() => {
    setPicker(null);
  }, []);

  const onPickedAndroid = useCallback(
    (event: DateTimePickerEvent, value?: Date) => {
      const currentPicker = picker;
      setPicker(null);
      if (event.type === "dismissed" || !value) return;

      const base = new Date(occurred);
      if (currentPicker === "date") {
        base.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      } else if (currentPicker === "time") {
        base.setHours(value.getHours(), value.getMinutes(), 0, 0);
      }
      const clamped = base.getTime() > Date.now() ? new Date() : base;
      setOccurred(clamped);
      commit({ when: clamped });
      setProblem(null);
    },
    [commit, occurred, picker],
  );

  const next = useCallback(() => {
    if (!happeningNow && occurred.getTime() > Date.now()) {
      setProblem("That is in the future — pick when it actually happened.");
      return;
    }
    commit({ when: occurred });
    setStep(4);
    router.push("/report/where");
  }, [commit, happeningNow, occurred, setStep]);

  /** Which quick chip matches the current date, if any. */
  const activeQuick = useMemo<QuickChoice | null>(() => {
    const days = Math.floor((Date.now() - occurred.getTime()) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days <= 7) return "week";
    return null;
  }, [occurred]);

  return (
    <WizardShell
      step={3}
      stepName="Date & time"
      savedAt={savedAt}
      onClose={exit}
      onBack={() => router.back()}
      onNext={next}
      problem={problem}
      testID="wizard-when"
    >
      <Text variant="displayXs" color={colors.t0}>
        When did it happen?
      </Text>

      <SwitchRow
        title="It's happening now"
        description="Collapses everything below to one line."
        value={happeningNow}
        onValueChange={(value) => {
          setHappeningNow(value);
          commit({ now: value });
        }}
        style={{ marginTop: 16 }}
        testID="happening-now"
      />

      {/* Everything below collapses when it is happening now — as drawn. */}
      {happeningNow ? (
        <View style={styles.nowCard}>
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            Right now
          </Text>
          <Text variant="metaSm" color={colors.t3} style={{ marginTop: 2 }}>
            {absoluteTime(new Date().toISOString())}
          </Text>
        </View>
      ) : (
        <>
          <SegmentedControl<QuickChoice>
            options={[
              { value: "today", label: "Today" },
              { value: "yesterday", label: "Yesterday" },
              { value: "week", label: "This week" },
            ]}
            // No selection when the date is older than a week; forcing one would
            // misreport a two-month-old incident as "this week".
            value={(activeQuick ?? "today") as QuickChoice}
            onChange={chooseQuick}
            height={36}
            style={{ marginTop: 14 }}
          />

          <Pressable
            onPress={() => openPicker("date")}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${occurred.toLocaleDateString()}`}
            style={styles.row}
            testID="pick-date"
          >
            <Text variant="labelLg" color={colors.t2}>
              Date
            </Text>
            <View style={styles.rowValue}>
              <Text variant="labelLg" color={colors.t0}>
                {occurred.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <Chevron open={false} />
            </View>
          </Pressable>

          {/* The Time row is replaced, not disabled, when the time is unknown. */}
          {timeUnknown ? (
            <View style={{ marginTop: 9 }}>
              <SegmentedControl<DayPart>
                options={DAY_PARTS}
                value={dayPart}
                onChange={(value) => {
                  setDayPart(value);
                  commit({ part: value });
                }}
                height={36}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => openPicker("time")}
              accessibilityRole="button"
              accessibilityLabel={`Time, ${occurred.toLocaleTimeString()}`}
              style={[styles.row, { marginTop: 9 }]}
              testID="pick-time"
            >
              <Text variant="labelLg" color={colors.t2}>
                Time
              </Text>
              <View style={styles.rowValue}>
                <Text variant="labelLg" color={colors.t0}>
                  {occurred.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <Chevron open={false} />
              </View>
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              const value = !timeUnknown;
              setTimeUnknown(value);
              commit({ unknown: value });
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: timeUnknown }}
            style={styles.unknownRow}
            testID="time-unknown"
          >
            <View pointerEvents="none">
              <Checkbox checked={timeUnknown} onToggle={() => {}} />
            </View>
            <Text variant="label" color={colors.t1} style={{ fontSize: 13.5 }}>
              I&rsquo;m not sure of the time
            </Text>
          </Pressable>
          <Text variant="metaSm" color={colors.t4} style={styles.unknownHint}>
            Swaps the Time row for Morning / Afternoon / Evening / Night.
          </Text>
        </>
      )}

      {/* The occurred-versus-filed card. Always present, both states. */}
      <View style={styles.pairCard}>
        <View style={styles.pairRow}>
          <Text variant="label" color={colors.t2}>
            Occurred
          </Text>
          <Text variant="label" color={colors.t0}>
            {happeningNow ? "Now" : absoluteTime(occurred.toISOString())}
          </Text>
        </View>
        <View style={[styles.pairRow, { marginTop: 8 }]}>
          <Text variant="label" color={colors.t2}>
            Filed
          </Text>
          <Text variant="label" color={colors.t0}>
            {absoluteTime(filedAt)}
          </Text>
        </View>
        <Text variant="metaSm" color={colors.t4} style={styles.pairNote}>
          A gap between the two is normal and is never held against a report.
        </Text>
      </View>

      {/* Standard modal picker bottom sheet for iOS */}
      {Platform.OS === "ios" ? (
        <Modal
          visible={picker !== null}
          transparent
          animationType="fade"
          onRequestClose={onCancelIos}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={onCancelIos} />
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.modalHeader}>
                <Pressable onPress={onCancelIos} hitSlop={10} style={styles.modalHeaderBtn}>
                  <Text variant="label" color={colors.t3}>
                    Cancel
                  </Text>
                </Pressable>
                <Text variant="labelLg" color={colors.t0}>
                  {picker === "date" ? "Select Date" : "Select Time"}
                </Text>
                <Pressable onPress={onConfirmIos} hitSlop={10} style={styles.modalHeaderBtn}>
                  <Text variant="labelLg" color={colors.acc}>
                    Done
                  </Text>
                </Pressable>
              </View>

              <View style={styles.pickerContainer}>
                {picker ? (
                  <DateTimePicker
                    value={tempDate}
                    mode={picker}
                    maximumDate={picker === "date" ? new Date() : undefined}
                    display="spinner"
                    themeVariant="light"
                    textColor={colors.t0}
                    onChange={(_event, date) => {
                      if (date) setTempDate(date);
                    }}
                    style={styles.iosPicker}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </Modal>
      ) : picker ? (
        <DateTimePicker
          value={occurred}
          mode={picker}
          maximumDate={picker === "date" ? new Date() : undefined}
          display="default"
          onChange={onPickedAndroid}
        />
      ) : null}
    </WizardShell>
  );
}

const styles = StyleSheet.create({
  nowCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    padding: 15,
    marginTop: 14,
  },
  rowValue: { flexDirection: "row", alignItems: "center", gap: 9 },
  unknownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 14,
  },
  unknownHint: { marginTop: 7, paddingLeft: 33, lineHeight: 17 },
  pairCard: {
    backgroundColor: colors.s2,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: cardHairline,
  },
  pairRow: { flexDirection: "row", justifyContent: "space-between" },
  pairNote: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: cardHairline,
    lineHeight: 17,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: colors.s0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: alpha(colors.t0, 0.08),
    overflow: "hidden",
    shadowColor: colors.deep,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.t0, 0.07),
    backgroundColor: colors.s1,
  },
  modalHeaderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  pickerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: colors.s0,
  },
  iosPicker: {
    width: "100%",
    height: 216,
  },
});
