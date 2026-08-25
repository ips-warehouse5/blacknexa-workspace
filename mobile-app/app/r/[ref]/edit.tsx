/**
 * Edit a filed report — D2's "Edit report", which the design gives a button and no
 * destination.
 *
 * ── Why only the title and the body ────────────────────────────────────────
 * Sealed evidence cannot change without voiding every integrity claim on D3, D11
 * and D12 — "Nothing has changed since" has to stay true. Location precision can
 * narrow but never widen, and visibility likewise, so neither belongs in a
 * free-form edit form. D2's Delete is the escape hatch for anything else.
 *
 * ── And why editing costs the badge ────────────────────────────────────────
 * A verified report returns to review when its words change, and this screen says
 * so *before* the save rather than surprising someone with a lost badge. That is
 * the same principle as C6's urgent card: state the consequence up front.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import reportsApi, { type ReportOwnerView } from "@/lib/api/reports";

const TITLE_MAX = 70;

export default function EditReportScreen(): React.ReactElement {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
  });

  const report = detail.data as ReportOwnerView | undefined;

  useEffect(() => {
    if (!report) return;
    setTitle(report.title);
    setBody(report.body);
  }, [report]);

  const save = useCallback(async () => {
    if (!report) return;
    setProblem(null);

    if (!title.trim()) {
      setProblem("Give the report a title — it is what people see first.");
      return;
    }
    if (!body.trim()) {
      setProblem("The report needs an account of what happened.");
      return;
    }

    setSaving(true);
    try {
      await reportsApi.update(report.id, { title: title.trim(), body: body.trim() });
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      router.back();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That change did not save.");
    } finally {
      setSaving(false);
    }
  }, [body, queryClient, ref, report, title]);

  const wasVerified = report?.status === "verified";

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="edit-report"
      footer={
        <View>
          {problem ? (
            <Text variant="metaSm" color={colors.bad2} style={{ marginBottom: 10 }}>
              {problem}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Cancel"
              variant="quiet"
              height={52}
              block={false}
              style={{ width: 100 }}
              onPress={() => router.back()}
            />
            <Button
              label="Save changes"
              onPress={save}
              loading={saving}
              style={{ flex: 1 }}
              testID="save-edit"
            />
          </View>
        </View>
      }
    >
      <BackHeader title="Edit report" onBack={() => router.back()} padding={0} />

      {/* The consequence, stated before the save. */}
      {wasVerified ? (
        <View style={styles.notice}>
          <Text variant="labelSm" color={colors.warn}>
            This report is verified
          </Text>
          <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 5, lineHeight: 19 }}>
            Changing the words sends it back for review, and the Verified badge comes
            off until a moderator has read it again.
          </Text>
        </View>
      ) : null}

      <TextField
        label="TITLE"
        value={title}
        onChangeText={(value) => setTitle(value.slice(0, TITLE_MAX))}
        counter={`${title.length}/${TITLE_MAX}`}
        maxLength={TITLE_MAX}
        height={50}
        containerStyle={{ marginTop: 20 }}
        testID="edit-title"
      />

      <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 18 }}>
        WHAT HAPPENED
      </Text>
      <TextField
        value={body}
        onChangeText={setBody}
        multiline
        multilineHeight={260}
        containerStyle={{ marginTop: 8 }}
        testID="edit-body"
      />

      {/* What cannot change here, and why. */}
      <View style={styles.lockedCard}>
        <Text variant="labelSm" color={colors.t1}>
          What stays as it is
        </Text>
        <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 6, lineHeight: 19 }}>
          Attached files cannot be changed or removed — that is what lets the report
          say nothing has changed since it was sealed. The date, the location
          precision and who can see it are also fixed. If any of those are wrong,
          delete the report and file it again.
        </Text>
      </View>
    </ScrollScreen>
  );
}

const styles = {
  notice: {
    backgroundColor: alpha(colors.warn, 0.1),
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  lockedCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 18,
  },
};
