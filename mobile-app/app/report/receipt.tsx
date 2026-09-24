/**
 * C9 · Receipt.
 *
 * From the caption: "Case ID with copy, what was sealed, who can see it, and where
 * it sits — plus the sentence people most need to read."
 *
 * That sentence is "Nothing has been sent to any outside organisation." It is the
 * last thing on the screen and it is the reason the screen exists: someone who has
 * just documented an encounter with the police needs to know, immediately and
 * without hunting, that filing did not report them to anyone.
 *
 * The screen reads from the filed report rather than the draft — the draft is gone
 * by now, and the sealed timestamps are the server's.
 *
 * ── Revision 2: where it sits (docs/INCIDENT_MODULE_PLAN.md §3.2, §10) ─────
 * "Published" and "Verified" are two different things (D1), so the stepper is
 * *Filed → Checked → Published → Verified* — or *Filed → Saved privately* for a
 * private report, which is never checked or published (D3). It reads the owner's
 * `displayStatus`: first from the filing receipt (route params), then from
 * `GET /reports/:id`, re-read every 3 s for up to a minute while the automated
 * check is still running, because most reports are decided in seconds and the
 * person is looking at this screen when it happens. A report the check held says
 * so in the spec's words: "A moderator checks it before it's published — urgent
 * reports within the hour." (Whether a hold was a *safety* hold is not sent to the
 * owner, so the crisis-line variant arrives as the server's notification instead.)
 *
 * The Android back button finishes the flow: the steps are still beneath this
 * screen, and popping to an emptied Review would look like the report was lost.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen } from "@/components/ui/Screen";
import { SuccessTick } from "@/app/(auth)/reset/done";
import { SectionLabel } from "@/components/report/WizardShell";
import reportsApi, {
  formatBytes,
  formatDuration,
  type ReportDetailView,
  type ReportOwnerView,
} from "@/lib/api/reports";
import {
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_POLL_WINDOW_MS,
  STILL_CHECKING_COPY,
  audienceCopy,
  displayStatusForView,
  isDisplayStatus,
  isSettling,
  receiptSteps,
  receiptSummary,
  type DisplayStatus,
  type ReceiptStep,
} from "@/lib/report/moderation";

/** "13 Aug, 4:12 PM" — the board's receipt line carries no year. */
function filedTime(iso: string | undefined): string | null {
  const value = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(value)) return null;
  const date = new Date(value);
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

export default function ReceiptScreen(): React.ReactElement {
  useThemeSync();
  const params = useLocalSearchParams<{
    caseRef?: string;
    reportId?: string;
    filedAt?: string;
    displayStatus?: string;
    visibility?: string;
    anonymous?: string;
  }>();
  const [copied, setCopied] = useState(false);

  // The polling window runs from the moment this screen opened.
  const openedAt = useRef(Date.now());
  const [windowOver, setWindowOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWindowOver(true), RECEIPT_POLL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  const receiptStatus: DisplayStatus | null = isDisplayStatus(params.displayStatus)
    ? params.displayStatus
    : null;

  // Keyed like D2's own query, so "View report" opens onto data already here.
  const target = params.caseRef ?? params.reportId;
  const detail = useQuery({
    queryKey: ["report", target],
    queryFn: () => reportsApi.detail(target!),
    enabled: Boolean(target),
    refetchInterval: (query) => {
      const data = query.state.data as ReportDetailView | ReportOwnerView | undefined;
      const status = data ? displayStatusForView(data as ReportOwnerView) : receiptStatus;
      const withinWindow = Date.now() - openedAt.current < RECEIPT_POLL_WINDOW_MS;
      return isSettling(status) && withinWindow ? RECEIPT_POLL_INTERVAL_MS : false;
    },
  });

  // The report is filed either way — a failed read leaves the receipt's own words,
  // which are enough to act on, rather than an error screen.
  const report = detail.data as ReportOwnerView | undefined;
  const displayStatus: DisplayStatus =
    (report ? displayStatusForView(report) : receiptStatus) ?? "checking";
  const visibility = report?.visibility ?? (params.visibility || null);
  const isPrivate = visibility === "private" || displayStatus === "private";
  const anonymous = report ? report.author.anonymous : params.anonymous === "1";
  const caseRef = report?.caseRef ?? params.caseRef ?? "";
  const sealedFiles = report?.evidence ?? [];
  const steps = receiptSteps(displayStatus, { isPrivate });

  const done = useCallback(() => {
    router.dismissTo("/(tabs)");
  }, []);

  /** Back finishes the flow — see the file header. */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      done();
      return true;
    });
    return () => subscription.remove();
  }, [done]);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(caseRef);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    // Confirms in place rather than by toast, matching D10's copy behaviour.
    setTimeout(() => setCopied(false), 2200);
  }, [caseRef]);

  /** Your own report opens D2, never D1 (F6 wiring). */
  const view = useCallback(() => {
    router.dismissTo("/(tabs)");
    if (caseRef) router.push(`/r/${caseRef}/owner`);
  }, [caseRef]);

  const filed = filedTime(report?.filedAt ?? params.filedAt);
  const sealedClause =
    sealedFiles.length > 0
      ? ` · ${sealedFiles.length} file${sealedFiles.length === 1 ? "" : "s"} sealed`
      : "";
  const summary =
    isSettling(displayStatus) && windowOver
      ? STILL_CHECKING_COPY
      : receiptSummary(displayStatus, { isPrivate });

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="wizard-receipt"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="View report"
            variant="quiet"
            height={52}
            onPress={view}
            style={{ flex: 1 }}
            testID="receipt-view"
          />
          <Button label="Done" onPress={done} style={{ flex: 1 }} testID="receipt-done" />
        </View>
      }
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: alpha(colors.ok, 0.14),
          alignItems: "center",
          justifyContent: "center",
          marginTop: 18,
        }}
      >
        <SuccessTick size={24} />
      </View>

      <Text variant="displaySm" color={colors.t0} style={{ marginTop: 18 }}>
        Your report is filed
      </Text>
      <Text
        variant="bodySm"
        color={colors.t2}
        style={{ marginTop: 9, lineHeight: 21 }}
        testID="receipt-summary"
        accessibilityLiveRegion="polite"
      >
        {filed ? `Filed ${filed}${sealedClause}. ${summary}` : summary}
      </Text>

      {/* Case reference, with copy. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.s3,
          borderRadius: radius.lg,
          paddingVertical: 14,
          paddingHorizontal: 15,
          marginTop: 18,
        }}
      >
        <View>
          <Text variant="eyebrowSm" color={colors.t4}>
            CASE REFERENCE
          </Text>
          <Text variant="cardTitle" color={colors.t0} style={{ marginTop: 6, letterSpacing: 0.4 }}>
            {caseRef || "—"}
          </Text>
        </View>
        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel={`Copy case reference ${caseRef}`}
          style={({ pressed }) => [
            {
              height: 36,
              paddingHorizontal: 13,
              borderRadius: 12,
              backgroundColor: copied ? alpha(colors.ok, 0.14) : colors.s6,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && { opacity: 0.85 },
          ]}
          testID="copy-case-ref"
        >
          <Text variant="chip" color={copied ? colors.ok : colors.t0}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>

      {sealedFiles.length > 0 ? (
        <>
          <SectionLabel style={{ marginTop: 22 }}>WHAT WAS SEALED</SectionLabel>
          <View style={{ gap: 7, marginTop: 10 }}>
            {sealedFiles.map((file) => (
              <View
                key={file.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text variant="label" color={colors.t1}>
                  {[
                    file.kind.charAt(0).toUpperCase() + file.kind.slice(1),
                    file.durationMs ? formatDuration(file.durationMs) : null,
                    file.bytes ? formatBytes(file.bytes) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <Text variant="metaSm" color={colors.ok}>
                  {file.sealedAt
                    ? `Sealed ${new Date(file.sealedAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : "Sealed"}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <SectionLabel style={{ marginTop: 22 }}>WHO CAN SEE IT</SectionLabel>
      <Text variant="bodySm" color={colors.t2} style={{ marginTop: 9, lineHeight: 20 }}>
        {audienceCopy({ visibility, anonymous })}
      </Text>

      <SectionLabel style={{ marginTop: 22 }}>WHERE IT IS NOW</SectionLabel>
      <Stepper steps={steps} />

      {/* The sentence people most need to read. */}
      <View
        style={{
          backgroundColor: colors.s2,
          borderRadius: radius.md,
          paddingVertical: 13,
          paddingHorizontal: 14,
          marginTop: 22,
          borderWidth: 1,
          borderColor: alpha(colors.t0, 0.07),
        }}
      >
        <Text variant="bodyXs" color={colors.t2} style={{ lineHeight: 19 }}>
          Nothing has been sent to any outside organisation.
        </Text>
      </View>
    </ScrollScreen>
  );
}

/**
 * The stepper. A node is filled when reached, ringed in the accent where the
 * report sits now, filled red where the journey stopped ("Not published", "Taken
 * down", "Dismissed"), and hollow ahead.
 */
function Stepper({ steps }: { steps: ReceiptStep[] }): React.ReactElement {
  const current = steps.find((step) => step.state === "current" || step.state === "stopped");
  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 14 }}
      accessibilityRole="progressbar"
      accessibilityLabel={`Where it is now: ${current?.label ?? steps[steps.length - 1].label}`}
      testID="receipt-stepper"
    >
      {steps.map((step, index) => (
        <React.Fragment key={step.key}>
          {index > 0 ? (
            <View
              style={{
                flex: 1,
                height: 2,
                marginTop: 5,
                backgroundColor:
                  step.state === "done" ? alpha(colors.acc, 0.55) : alpha(colors.t0, 0.1),
              }}
            />
          ) : null}
          <View style={{ flex: 1, alignItems: "center", gap: 8 }} testID={`receipt-step-${step.key}`}>
            <View
              style={[
                { width: 12, height: 12, borderRadius: 6 },
                step.state === "done"
                  ? { backgroundColor: colors.acc }
                  : step.state === "current"
                    ? { borderWidth: 3, borderColor: colors.acc, backgroundColor: colors.bg }
                    : step.state === "stopped"
                      ? { backgroundColor: colors.bad }
                      : { borderWidth: 2, borderColor: colors.line },
              ]}
            />
            <Text
              variant="metaSm"
              center
              color={
                step.state === "stopped"
                  ? colors.bad2
                  : step.state === "todo"
                    ? colors.t4
                    : colors.t0
              }
            >
              {step.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
