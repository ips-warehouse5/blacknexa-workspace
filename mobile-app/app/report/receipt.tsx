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
 */

import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, StickyFooter } from "@/components/ui/Screen";
import { SuccessTick } from "@/app/(auth)/reset/done";
import { SectionLabel } from "@/components/report/WizardShell";
import reportsApi, {
  absoluteTime,
  formatBytes,
  formatDuration,
  type ReportDetailView,
} from "@/lib/api/reports";

/** C9's three-node stepper. */
const STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "verified", label: "Verified" },
] as const;

export default function ReceiptScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ caseRef?: string; reportId?: string }>();
  const [report, setReport] = useState<ReportDetailView | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const target = params.reportId ?? params.caseRef;
    if (!target) return;
    void reportsApi
      .detail(target)
      .then((value) => setReport(value as ReportDetailView))
      .catch(() => {
        // The report is filed either way — the reference below is enough for the
        // person to act on, so a failed read is not worth an error screen here.
      });
  }, [params.caseRef, params.reportId]);

  const caseRef = report?.caseRef ?? params.caseRef ?? "";

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(caseRef);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    // Confirms in place rather than by toast, matching D10's copy behaviour.
    setTimeout(() => setCopied(false), 2200);
  }, [caseRef]);

  const done = useCallback(() => {
    router.dismissTo("/(tabs)");
  }, []);

  const view = useCallback(() => {
    router.dismissTo("/(tabs)");
    if (caseRef) router.push(`/r/${caseRef}`);
  }, [caseRef]);

  const sealedFiles = report?.evidence ?? [];

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
          />
          <Button label="Done" onPress={done} style={{ flex: 1 }} testID="receipt-done" />
        </View>
      }
    >
      <View style={styles.tick}>
        <SuccessTick size={24} />
      </View>

      <Text variant="displaySm" color={colors.t0} style={{ marginTop: 18 }}>
        Your report is filed
      </Text>
      <Text variant="bodySm" color={colors.t2} style={{ marginTop: 9, lineHeight: 21 }}>
        {report
          ? `Filed ${absoluteTime(report.filedAt)}${
              sealedFiles.length > 0
                ? ` · ${sealedFiles.length} file${sealedFiles.length === 1 ? "" : "s"} sealed`
                : ""
            }. A moderator reviews it next.`
          : "A moderator reviews it next."}
      </Text>

      {/* Case reference, with copy. */}
      <View style={styles.refCard}>
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
            styles.copyChip,
            copied && { backgroundColor: alpha(colors.ok, 0.14) },
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
              <View key={file.id} style={styles.sealedRow}>
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
        {visibilityCopy(report)}
      </Text>

      <SectionLabel style={{ marginTop: 22 }}>WHERE IT IS NOW</SectionLabel>
      <View style={styles.stepper}>
        {STAGES.map((stage, index) => {
          const reached = stageReached(stage.key, report?.status);
          return (
            <React.Fragment key={stage.key}>
              {index > 0 ? <View style={styles.stepperLine} /> : null}
              <View style={styles.stepperNode}>
                <View
                  style={[
                    styles.stepperDot,
                    reached
                      ? { backgroundColor: colors.acc }
                      : { borderWidth: 2, borderColor: colors.line },
                  ]}
                />
                <Text variant="metaSm" color={reached ? colors.t0 : colors.t4} center>
                  {stage.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* The sentence people most need to read. */}
      <View style={styles.reassurance}>
        <Text variant="bodyXs" color={colors.t2} style={{ lineHeight: 19 }}>
          Nothing has been sent to any outside organisation.
        </Text>
      </View>
    </ScrollScreen>
  );
}

/** C9 spells out who can see it, in words rather than a label. */
function visibilityCopy(report: ReportDetailView | null): string {
  if (!report) return "Only the people your visibility setting allows.";
  const anonymousClause = report.author.anonymous ? ", without your name or photo" : "";
  switch (report.visibility) {
    case "public":
      return `Anyone in the community feed${anonymousClause}. Moderators can still see who filed it.`;
    case "trusted":
      return `Verified advocates only${anonymousClause}. Nothing appears in the public feed.`;
    default:
      return "Only you. It still counts toward your own record.";
  }
}

function stageReached(stage: string, status?: string): boolean {
  const order = ["submitted", "under_review", "verified"];
  if (!status) return stage === "submitted";
  const current = order.indexOf(status);
  return current >= order.indexOf(stage);
}

const styles = {
  tick: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: alpha(colors.ok, 0.14),
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 18,
  },
  refCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 18,
  },
  copyChip: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.s6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  sealedRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
  },
  stepper: { flexDirection: "row" as const, alignItems: "flex-start" as const, marginTop: 14 },
  stepperNode: { flex: 1, alignItems: "center" as const, gap: 8 },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: alpha(colors.t0, 0.1),
    marginTop: 5,
  },
  stepperDot: { width: 12, height: 12, borderRadius: 6 },
  reassurance: {
    backgroundColor: colors.s2,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 22,
    borderWidth: 1,
    borderColor: alpha(colors.t0, 0.07),
  },
};
