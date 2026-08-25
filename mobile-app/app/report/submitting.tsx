/**
 * C8 · Submitting.
 *
 * From the caption: "Filing is never optimistic. A real three-row checklist, with
 * the percentage on the row that is actually working."
 *
 * And from the artboard itself: "There is no way to close this screen — nothing is
 * half-filed."
 *
 * ── What "never optimistic" costs ──────────────────────────────────────────
 * The three rows are derived from real state, not a timer: sealing is done when
 * every attachment reports sealed, uploading shows the actual mean progress, and
 * filing is pending until the request returns. A staged animation that always
 * completes would be easier and would be a lie — and this is the screen where a
 * lie matters most, because the person is waiting to be told their evidence is safe.
 *
 * On failure the screen does not bounce back to Review: it says what happened and
 * offers a retry, because the draft is intact and re-walking six steps to try again
 * would be a punishment for a network blip.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, BackHandler, Easing, Platform, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { Screen, StickyFooter } from "@/components/ui/Screen";
import { useReportDraft } from "@/providers/ReportDraftProvider";

type RowState = "done" | "active" | "pending" | "failed";

export default function SubmittingScreen(): React.ReactElement {
  const { attachments, allSealed, uploadingCount, fileReport, filing, fileError } =
    useReportDraft();

  const [phase, setPhase] = useState<"working" | "failed">("working");
  const started = useRef(false);

  /** Nothing closes this screen — including the hardware back button. */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, []);

  const uploadProgress = useMemo(() => {
    if (attachments.length === 0) return 1;
    const total = attachments.reduce((sum, item) => sum + item.progress, 0);
    return total / attachments.length;
  }, [attachments]);

  const anyFailed = attachments.some((item) => item.state === "failed");

  /** Fire once every file is sealed. */
  const submit = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    const result = await fileReport();
    if (result) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      router.replace({
        pathname: "/report/receipt",
        params: { caseRef: result.caseRef, reportId: result.reportId },
      });
      return;
    }
    started.current = false;
    setPhase("failed");
  }, [fileReport]);

  useEffect(() => {
    if (phase !== "working") return;
    if (anyFailed) {
      setPhase("failed");
      return;
    }
    if (allSealed && !filing) void submit();
  }, [allSealed, anyFailed, filing, phase, submit]);

  const sealState: RowState = anyFailed ? "failed" : allSealed ? "done" : "active";
  const uploadState: RowState = anyFailed
    ? "failed"
    : allSealed
      ? "done"
      : uploadingCount > 0
        ? "active"
        : "pending";
  const fileState: RowState =
    phase === "failed" ? "failed" : filing ? "active" : allSealed ? "pending" : "pending";

  const retry = useCallback(() => {
    setPhase("working");
    started.current = false;
  }, []);

  return (
    <Screen padding={0} testID="wizard-submitting">
      <View style={styles.centre}>
        {phase === "failed" ? (
          <FailedMark />
        ) : (
          <Spinner size={96} stroke={4} />
        )}

        <Text variant="displayXs" color={colors.t0} center style={{ marginTop: 28 }}>
          {phase === "failed" ? "That did not finish" : "Filing your report"}
        </Text>
        <Text variant="bodySm" color={colors.t3} center style={{ marginTop: 8, lineHeight: 20 }}>
          {phase === "failed"
            ? fileError ?? "Nothing has been filed. Your draft is exactly as you left it."
            : "Keep the app open until this finishes."}
        </Text>

        <View style={styles.checklist}>
          <ChecklistRow
            state={sealState}
            label={
              attachments.length === 0
                ? "No files to seal"
                : `Sealing ${attachments.length} file${attachments.length === 1 ? "" : "s"}`
            }
          />
          <ChecklistRow
            state={uploadState}
            label={
              attachments.length === 0
                ? "Nothing to upload"
                : uploadState === "active"
                  ? `Uploading ${Math.round(uploadProgress * 100)}%`
                  : "Uploading"
            }
          />
          <ChecklistRow state={fileState} label="Filing the report" />
        </View>
      </View>

      {phase === "failed" ? (
        <StickyFooter padding={screenPadding.detail}>
          <Button label="Try again" onPress={retry} testID="submitting-retry" />
          <Button
            label="Back to review"
            variant="quiet"
            onPress={() => router.replace("/report/review")}
            style={{ marginTop: 9 }}
          />
        </StickyFooter>
      ) : (
        <Text
          variant="bodyXs"
          color={colors.t4}
          center
          style={{ paddingHorizontal: 30, paddingBottom: 40, lineHeight: 19 }}
        >
          There is no way to close this screen — nothing is half-filed.
        </Text>
      )}
    </Screen>
  );
}

/** One checklist row: a tick, a spinner, a hollow ring, or a cross. */
function ChecklistRow({ state, label }: { state: RowState; label: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      {state === "done" ? (
        <RowTick />
      ) : state === "active" ? (
        <Spinner size={20} stroke={2.2} />
      ) : state === "failed" ? (
        <RowCross />
      ) : (
        <View style={styles.pendingRing} />
      )}
      <Text
        variant="labelLg"
        color={
          state === "failed"
            ? colors.bad2
            : state === "pending"
              ? colors.t5
              : state === "done"
                ? colors.t1
                : colors.t0
        }
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * A rotating arc.
 *
 * Under reduce-motion it becomes a static ring: a permanent spinner is exactly the
 * ambient movement that setting exists to remove, and the checklist rows already
 * carry the progress in words.
 */
function Spinner({ size, stroke }: { size: number; stroke: number }): React.ReactElement {
  const spin = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, spin]);

  const ring = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: stroke,
        borderColor: alpha(colors.t0, 0.09),
        // One coloured edge makes the rotation legible without an SVG arc.
        borderTopColor: colors.acc,
      }}
    />
  );

  if (reduceMotion) return ring;

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        ],
      }}
    >
      {ring}
    </Animated.View>
  );
}

function RowTick(): React.ReactElement {
  return (
    <View style={[styles.mark, { backgroundColor: alpha(colors.ok, 0.16) }]}>
      <View style={[styles.tickShort, { backgroundColor: colors.ok }]} />
      <View style={[styles.tickLong, { backgroundColor: colors.ok }]} />
    </View>
  );
}

function RowCross(): React.ReactElement {
  return (
    <View style={[styles.mark, { backgroundColor: alpha(colors.bad, 0.14) }]}>
      <View style={[styles.crossBar, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.crossBar, { transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

function FailedMark(): React.ReactElement {
  return (
    <View
      style={{
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: alpha(colors.bad, 0.12),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={[styles.crossBar, { width: 30, backgroundColor: colors.bad2, transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.crossBar, { width: 30, backgroundColor: colors.bad2, transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

const styles = {
  centre: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 30,
  },
  checklist: { width: "100%" as const, gap: 14, marginTop: 34 },
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },

  pendingRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: alpha(colors.t0, 0.1),
  },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  tickShort: {
    position: "absolute" as const,
    width: 5,
    height: 1.8,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }, { translateX: -2.6 }, { translateY: 1.8 }],
  },
  tickLong: {
    position: "absolute" as const,
    width: 9,
    height: 1.8,
    borderRadius: 1,
    transform: [{ rotate: "-45deg" }, { translateX: 1 }],
  },
  crossBar: {
    position: "absolute" as const,
    width: 11,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: colors.bad2,
  },
  // Referenced so the radius token stays in use on this screen.
  card: { borderRadius: radius.lg },
};
