/**
 * D16 · Edit a filed report — from "Edit report" (or *Edit and resubmit*) on D2.
 *
 * From the caption: "The wizard's steps become a two-list screen — what you can
 * change, and what filing fixed — each locked row saying why."
 *
 * ── Why only the title and the body ────────────────────────────────────────
 * Sealed evidence cannot change without voiding every integrity claim on D3, D11
 * and D12 — "Nothing has changed since" has to stay true. Location precision can
 * narrow but never widen, and visibility likewise, so neither belongs in a
 * free-form edit form. D2's Delete is the escape hatch for anything else. (The
 * board's "Add more evidence" and "Who can see it" rows, and its edit history,
 * are out of scope — spec §12.)
 *
 * ── The consequence, stated before the save ────────────────────────────────
 * The same principle as C6's urgent card. Every edit of a public or Trusted
 * report is checked again before anyone else sees it (docs/INCIDENT_MODULE_PLAN.md
 * D19, §10): "Your edit is checked before it goes live again; the report and its
 * comments are hidden while it's checked (usually under a minute)." A rejected
 * report is *resubmitted*, and a moderator reads it before it is published. A
 * verified or dismissed report goes back for review. A private report is never
 * checked (D3), so it is never promised a check.
 *
 * ── What the server can refuse ─────────────────────────────────────────────
 *   • A taken-down report cannot be edited (409). Its refusal is shown in the
 *     server's words.
 *   • A fourth resubmission is refused (409 "…Contact support…"). The owner view
 *     says so in advance (`moderation.resubmissionsLeft` at 0), and then this
 *     screen offers Contact support instead of a Resubmit that can only fail.
 *     Against a server that does not send the field the refusal itself is
 *     recorded under `resubmissionLimitKey`, so D2 stops offering the edit too.
 *
 * The fields are filled once from the report and then belong to the person
 * typing: D2 re-reads the report underneath this screen while a check runs, and a
 * re-read must never overwrite what someone is in the middle of writing.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useSnackbar } from "@/providers/SnackbarProvider";
import reportsApi, { CATEGORY_META, absoluteTime, type ReportOwnerView } from "@/lib/api/reports";
import { DISPLAY_STATUS_LABELS, displayStatusForView, type StatusTone } from "@/lib/report/moderation";
import {
  editNotices,
  editSavedMessage,
  errorInfo,
  isResubmissionLimitError,
  readErrorCopy,
  resubmissionCapReached,
  resubmissionLimitKey,
  shouldRetryRead,
} from "@/lib/report/detail";

const TITLE_MAX = 70;
/** The server's limit on a report body. */
const BODY_MAX = 20_000;

/** A notice tone as its colour: the accent behind, the ink for the headline. */
function noticeInk(tone: StatusTone): string {
  switch (tone) {
    case "bad":
      return colors.bad2;
    case "attention":
      return colors.warn;
    case "progress":
      return colors.acc;
    case "ok":
      return colors.ok;
    default:
      return colors.t1;
  }
}

function noticeGround(tone: StatusTone): string {
  switch (tone) {
    case "bad":
      return alpha(colors.bad, 0.1);
    case "attention":
      return alpha(colors.warn, 0.1);
    case "progress":
      return alpha(colors.acc, 0.1);
    case "ok":
      return alpha(colors.ok, 0.1);
    default:
      return colors.s3;
  }
}

/** "13 Aug" — D16's header line carries no year. */
function shortDate(iso: string): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function EditReportScreen(): React.ReactElement {
  useThemeSync();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
    retry: shouldRetryRead,
  });

  const report = detail.data as ReportOwnerView | undefined;

  // Filled once — see the file header.
  useEffect(() => {
    if (!report || !report.isOwner || hydrated.current) return;
    hydrated.current = true;
    setTitle(report.title);
    setBody(report.body);
  }, [report]);

  const save = useCallback(async () => {
    if (!report || saving) return;
    setProblem(null);

    if (!title.trim()) {
      setProblem("Give the report a title — it is what people see first.");
      return;
    }
    if (!body.trim()) {
      setProblem("The report needs an account of what happened.");
      return;
    }
    if (title.trim() === report.title.trim() && body.trim() === report.body.trim()) {
      setProblem("Nothing has changed yet.");
      return;
    }

    setSaving(true);
    try {
      const updated = await reportsApi.update(report.id, { title: title.trim(), body: body.trim() });
      // D2 opens straight onto the new state — "Checking" for a moderated report.
      queryClient.setQueryData(["report", ref], updated);
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      void queryClient.invalidateQueries({ queryKey: ["comments", ref] });
      showSnackbar({ message: editSavedMessage(report), type: "success" });
      router.back();
    } catch (err) {
      if (isResubmissionLimitError(err, report.moderation?.state)) {
        queryClient.setQueryData(resubmissionLimitKey(report.id), true);
        setLimitReached(true);
      }
      setProblem(errorInfo(err).message ?? "That change did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [body, queryClient, ref, report, saving, showSnackbar, title]);

  if (detail.isLoading) {
    return (
      <ScrollScreen padding={screenPadding.detail} testID="edit-report-loading">
        <BackHeader title="Edit report" onBack={() => router.back()} padding={0} />
        <View style={{ gap: 12, marginTop: 20 }} accessibilityLabel="Loading your report">
          <View style={{ backgroundColor: colors.s5, borderRadius: radius.md, height: 50 }} />
          <View style={{ backgroundColor: colors.s5, borderRadius: radius.md, height: 260 }} />
        </View>
      </ScrollScreen>
    );
  }

  if (detail.isError || !report || !report.isOwner) {
    const copy = report && !report.isOwner
      ? { title: "Only the person who filed a report can edit it", body: "This report is not yours to change.", retry: false }
      : readErrorCopy(detail.error, { owner: true });
    return (
      <ScrollScreen padding={screenPadding.detail} testID="edit-report-error">
        <BackHeader title="Edit report" onBack={() => router.back()} padding={0} />
        <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 20 }}>
          <Text variant="sectionTitle" color={colors.t0} center>
            {copy.title}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            {copy.body}
          </Text>
          <Button
            label={copy.retry ? "Try again" : "Back"}
            onPress={copy.retry ? () => void detail.refetch() : () => router.back()}
            block={false}
            style={{ marginTop: 22, paddingHorizontal: 22 }}
          />
        </View>
      </ScrollScreen>
    );
  }

  const displayStatus = displayStatusForView(report);
  const notices = editNotices(report);
  const resubmitting = displayStatus === "not_published";
  // Used up — known from the view, or from the refusal this screen just got.
  const capReached = resubmitting && resubmissionCapReached(report, limitReached);
  const meta = CATEGORY_META[report.category];

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="edit-report"
      footer={
        <View>
          {problem ? (
            <Text
              variant="metaSm"
              color={colors.bad2}
              style={{ marginBottom: 10, lineHeight: 17 }}
              accessibilityLiveRegion="polite"
              testID="edit-problem"
            >
              {problem}
            </Text>
          ) : null}
          {capReached ? (
            <Button
              label="Contact support"
              variant="secondary"
              onPress={() => router.push("/profile/contact")}
              style={{ marginBottom: 10 }}
              testID="edit-contact-support"
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Cancel"
              variant="quiet"
              height={52}
              block={false}
              style={capReached ? { flex: 1 } : { width: 100 }}
              onPress={() => router.back()}
            />
            {/* No Resubmit once they are used up: the server can only refuse it. */}
            {capReached ? null : (
              <Button
                label={resubmitting ? "Resubmit" : "Save changes"}
                onPress={save}
                loading={saving}
                style={{ flex: 1 }}
                testID="save-edit"
              />
            )}
          </View>
        </View>
      }
    >
      <BackHeader title={`Editing ${report.caseRef}`} onBack={() => router.back()} padding={0} />
      <Text variant="metaSm" color={colors.t4} center style={{ marginTop: 2 }}>
        {`Filed ${shortDate(report.filedAt)} · ${
          displayStatus === "published" && report.visibility === "private"
            ? DISPLAY_STATUS_LABELS.private
            : DISPLAY_STATUS_LABELS[displayStatus]
        }`}
      </Text>

      {/* The consequences, stated before the save. */}
      {notices.map((notice) => (
        <View
          key={notice.key}
          style={{
            backgroundColor: noticeGround(notice.tone),
            borderRadius: radius.md,
            paddingVertical: 13,
            paddingHorizontal: 14,
            marginTop: 16,
          }}
          testID={`edit-notice-${notice.key}`}
        >
          <Text variant="labelSm" color={noticeInk(notice.tone)}>
            {notice.title}
          </Text>
          <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 5, lineHeight: 19 }}>
            {notice.body}
          </Text>
          {notice.quote ? (
            <Text variant="bodyXs" color={colors.t1} style={{ marginTop: 8, lineHeight: 19 }}>
              {`“${notice.quote}”`}
            </Text>
          ) : null}
        </View>
      ))}

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
        YOU CAN CHANGE
      </Text>
      <TextField
        label="TITLE"
        value={title}
        onChangeText={(value) => setTitle(value.slice(0, TITLE_MAX))}
        counter={`${title.length}/${TITLE_MAX}`}
        maxLength={TITLE_MAX}
        height={50}
        containerStyle={{ marginTop: 12 }}
        testID="edit-title"
      />

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 18 }}>
        WHAT HAPPENED
      </Text>
      <TextField
        value={body}
        onChangeText={setBody}
        maxLength={BODY_MAX}
        multiline
        multilineHeight={260}
        containerStyle={{ marginTop: 8 }}
        testID="edit-body"
      />

      {/* What filing fixed — locked rows explain themselves rather than disappearing. */}
      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
        FIXED ONCE FILED
      </Text>
      <View
        style={{ backgroundColor: colors.s3, borderRadius: radius.lg, paddingHorizontal: 14, marginTop: 10 }}
      >
        <LockedRow label="Category" value={meta.label} />
        <LockedRow label="Date and time it happened" value={absoluteTime(report.occurredAt)} />
        <LockedRow
          label="Sealed files already attached"
          value={
            report.evidence.length === 0
              ? "None were attached"
              : "Removing one would break the seal"
          }
        />
        <LockedRow label="Who can see it" value="Fixed so it can never widen" last />
      </View>
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 10, lineHeight: 17 }}>
        If any of those are wrong, delete the report and file it again.
      </Text>
    </ScrollScreen>
  );
}

function LockedRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}): React.ReactElement {
  return (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: alpha(colors.t0, 0.06),
      }}
      accessible
      accessibilityLabel={`${label}. ${value}. Can't be changed.`}
    >
      <Text variant="label" color={colors.t1}>
        {label}
      </Text>
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 3 }}>
        {value}
      </Text>
    </View>
  );
}
