/**
 * D2 · Report detail, owner view.
 *
 * From the caption: "**A separate screen, not a variant.** Status timeline high up,
 * who has seen it, dispatch, edit and delete — no Stand with, no Flag."
 *
 * Being a separate screen is the design decision, and it earns its keep: the owner's
 * questions are different. Not "should I believe this" but "where has it got to, who
 * has seen it, and what can I do next". So the timeline is the first thing, and the
 * social actions are absent rather than disabled — you cannot stand with your own
 * report, and flagging it is meaningless.
 */

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { StatusPill, CategoryPill } from "@/components/report/StatusPill";
import { EvidenceGrid } from "@/components/report/EvidenceGrid";
import { TrustCard } from "@/components/report/TrustCard";
import TrustSheet from "@/components/sheets/TrustSheet";
import ReportShareSheet from "@/components/sheets/ReportShareSheet";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import reportsApi, {
  CATEGORY_META,
  absoluteTime,
  type ReportOwnerView,
} from "@/lib/api/reports";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  verified: "Verified",
  dismissed: "Dismissed",
};

export default function OwnerReportScreen(): React.ReactElement {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();

  const [trustOpen, setTrustOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
  });

  const report = detail.data as ReportOwnerView | undefined;

  const remove = useCallback(async () => {
    if (!report) return;
    setDeleting(true);
    try {
      await reportsApi.remove(report.id);
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      router.back();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [queryClient, report]);

  if (detail.isLoading || !report) {
    return (
      <ScrollScreen padding={screenPadding.detail} testID="owner-loading">
        <BackHeader title="Your report" onBack={() => router.back()} padding={0} />
        <View style={{ gap: 12, marginTop: 18 }}>
          <View style={[styles.bar, { height: 150, borderRadius: 16 }]} />
          <View style={[styles.bar, { width: "88%", height: 24 }]} />
        </View>
      </ScrollScreen>
    );
  }

  const meta = CATEGORY_META[report.category];

  return (
    <>
      <ScrollScreen padding={screenPadding.detail} bottomSpace={34} testID="owner-detail">
        <BackHeader
          title="Your report"
          onBack={() => router.back()}
          padding={0}
          border
          right={
            <Pressable
              onPress={() => setShareOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <DotsGlyph />
            </Pressable>
          }
        />

        {/* Status timeline, high up — the owner's first question. */}
        <View style={styles.statusCard}>
          <Text variant="eyebrowSm" color={colors.t4}>
            STATUS
          </Text>
          <View style={{ marginTop: 14 }}>
            {report.timeline.map((event, index, all) => {
              const isLast = index === all.length - 1;
              return (
                <View key={`${event.status}-${event.at}`} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: isLast ? colors.acc : colors.ok },
                      ]}
                    />
                    {!isLast ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
                    <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
                      {STATUS_LABEL[event.status] ?? event.status}
                    </Text>
                    <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
                      {[absoluteTime(event.at), event.actorLabel].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <Text variant="sectionTitle" color={colors.t0} style={{ marginTop: 20 }}>
          {report.title}
        </Text>

        <View style={styles.badges}>
          <CategoryPill label={meta.label.toUpperCase()} dotColor={colors[meta.token]} />
          <StatusPill kind={report.visibility} />
          {report.author.anonymous ? <StatusPill kind="anonymous" /> : null}
          {report.urgent ? <StatusPill kind="urgent" /> : null}
        </View>

        {/* Who has seen this. */}
        <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
          WHO HAS SEEN THIS
        </Text>
        <View style={styles.seenCard}>
          <SeenRow
            label="Community feed"
            value={`${report.viewCount} view${report.viewCount === 1 ? "" : "s"}`}
          />
          <SeenRow
            label="Moderators"
            value={
              report.moderatorCount === 0
                ? "Not yet"
                : `${report.moderatorCount} ${report.moderatorCount === 1 ? "person" : "people"}`
            }
          />
          {/* The reassurance, stated even when — especially when — it is "None". */}
          <SeenRow
            label="Outside organisations"
            value={report.dispatchedTo.length === 0 ? "None" : report.dispatchedTo.join(", ")}
          />
        </View>

        {report.evidence.length > 0 ? (
          <>
            <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
              {`EVIDENCE · ${report.evidence.length} FILE${report.evidence.length === 1 ? "" : "S"}`}
            </Text>
            <EvidenceGrid
              evidence={report.evidence}
              onOpen={(index) => router.push(`/r/${report.caseRef}/evidence/${index}`)}
              style={{ marginTop: 11 }}
            />
          </>
        ) : null}

        <TrustCard
          status={report.status}
          strength={report.evidenceStrength}
          fileCount={report.evidence.length}
          onOpen={() => setTrustOpen(true)}
          style={{ marginTop: 22 }}
        />

        {/* Dispatch — gated on verified, and it says why. */}
        <View style={styles.dispatchCard}>
          <Text variant="labelLg" color={colors.t0} style={{ fontSize: 14.5 }}>
            Send this somewhere
          </Text>
          <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 6, lineHeight: 19 }}>
            {report.canDispatch
              ? "Because this report is verified, you can dispatch it to press, an agency, an international body or the legal network. You name the recipients and consent before anything leaves."
              : "Once a moderator verifies this report, you can dispatch it to press, an agency, an international body or the legal network. Nothing leaves without your consent."}
          </Text>
          <Button
            label="Start a dispatch"
            variant="secondary"
            height={44}
            disabled={!report.canDispatch}
            onPress={() => router.push(`/incident/${report.id}`)}
            style={{ marginTop: 12, borderRadius: 12 }}
            testID="start-dispatch"
          />
        </View>

        <View style={styles.ownerActions}>
          <Button
            label="Edit report"
            variant="quiet"
            height={46}
            onPress={() => router.push(`/r/${report.caseRef}/edit`)}
            style={{ flex: 1, borderRadius: radius.md }}
            testID="edit-report"
          />
          <Button
            label="Delete"
            variant="destructiveTint"
            height={46}
            onPress={() => setConfirmDelete(true)}
            style={{ flex: 1 }}
            testID="delete-report"
          />
        </View>
        <Text variant="metaSm" color={colors.t4} style={{ marginTop: 10, lineHeight: 17 }}>
          Deleting removes it from the feed and from your Vault. Sealed files are
          destroyed after 30 days.
        </Text>
      </ScrollScreen>

      <TrustSheet
        visible={trustOpen}
        reportRef={report.caseRef}
        onClose={() => setTrustOpen(false)}
      />
      <ReportShareSheet
        visible={shareOpen}
        report={report}
        onClose={() => setShareOpen(false)}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this report?"
        body="It leaves the feed and your Vault now. Sealed files are destroyed after 30 days, so this can still be undone by support until then."
        confirmLabel="Delete it"
        cancelLabel="Keep it"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function SeenRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.seenRow}>
      <Text variant="label" color={colors.t1}>
        {label}
      </Text>
      <Text variant="label" color={colors.t4}>
        {value}
      </Text>
    </View>
  );
}

function DotsGlyph(): React.ReactElement {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.dot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    padding: 16,
    marginTop: 16,
  },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { alignItems: "center", width: 11 },
  timelineDot: { width: 11, height: 11, borderRadius: 6 },
  timelineLine: { flex: 1, width: 2, backgroundColor: alpha(colors.t0, 0.12) },

  badges: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 11 },

  seenCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    padding: 14,
    marginTop: 10,
    gap: 11,
  },
  seenRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },

  dispatchCard: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    padding: 15,
    marginTop: 14,
  },
  ownerActions: { flexDirection: "row", gap: 9, marginTop: 14 },

  bar: { backgroundColor: colors.s5, borderRadius: 6 },
  dots: { width: 21, height: 21, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.t1 },
});
