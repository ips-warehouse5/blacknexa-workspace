/**
 * D2 · Report detail, owner view.
 *
 * From the caption: "**A separate screen, not a variant.** … Dispatch is out of
 * scope for this release, so the 'Send this somewhere' card and its row are both
 * gone. What is left is status, reach, edit and delete. No Stand with, no Flag."
 *
 * Being a separate screen is the design decision, and it earns its keep: the owner's
 * questions are different. Not "should I believe this" but "where has it got to, who
 * has seen it, and what can I do next". So the status is the first thing, and the
 * social actions are absent rather than disabled — you cannot stand with your own
 * report, and flagging it is meaningless. The dispatch card, its "Outside
 * organisations" row and its link into the legacy `incident/[id]` mock are gone
 * with it (v7).
 *
 * ── Where it has got to (docs/INCIDENT_MODULE_PLAN.md §3.2, §7.4, §10) ─────
 * Publication and verification are two axes (D1), and the owner is the one
 * person told about both:
 *
 *   • **The banner** — only while the report is not simply live: *Checking*,
 *     *With a moderator*, *Not published* (the reason, the moderator's note and
 *     *Edit and resubmit*), *Taken down* (the reason and note). Hold reasons are
 *     staff-only, so a held report's banner never guesses at one. While the
 *     automated check runs the screen re-reads the report every 3 s for up to a
 *     minute, as C9 does, then says it will notify instead of asking the owner to
 *     wait.
 *   • **The timeline** — the case-status events and the moderation events
 *     (published, with a moderator, not published, taken down, live again),
 *     merged into one history, with the reasons and notes the author may read
 *     ("Edited by the author", a dismissal's reason).
 *
 * ── Resubmitting ───────────────────────────────────────────────────────────
 * A rejected report can be edited and resubmitted three times (D19); the fourth
 * attempt is refused with 409 "Contact support". The owner view's
 * `moderation.resubmissionsLeft` says when they are used up, so the banner and
 * MANAGE offer *Contact support* instead of an edit that would only be refused
 * (§10 "hidden after 3"). Against a server that does not send the field, D16
 * records the refusal (`resubmissionLimitKey`) and this screen learns it from
 * there. A taken-down report cannot be edited at all; only a moderator's
 * *Reactivate* brings it back.
 *
 * A failed read is an error state, never an endless skeleton: 404 says the report
 * is not available, anything else offers I3's "Try again".
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { StatusPill, CategoryPill, DisplayStatusPill } from "@/components/report/StatusPill";
import { EvidenceGrid } from "@/components/report/EvidenceGrid";
import { TrustCard } from "@/components/report/TrustCard";
import TrustSheet from "@/components/sheets/TrustSheet";
import ReportShareSheet from "@/components/sheets/ReportShareSheet";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useSnackbar } from "@/providers/SnackbarProvider";
import reportsApi, {
  CATEGORY_META,
  absoluteTime,
  type ReportOwnerView,
} from "@/lib/api/reports";
import {
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_POLL_WINDOW_MS,
  RESUBMIT_COPY,
  displayStatusForView,
  type StatusTone,
} from "@/lib/report/moderation";
import {
  canShare,
  deleteReportCopy,
  errorInfo,
  ownerBanner,
  ownerEditMode,
  ownerTimelineNodes,
  readErrorCopy,
  resubmissionLimitKey,
  shouldRetryRead,
  type OwnerTimelineNode,
} from "@/lib/report/detail";

/** H3b — where "Contact support" goes. */
const CONTACT_SUPPORT_ROUTE = "/profile/contact";

/** A tone as this screen's colours: the accent for the rule, the ink for its words. */
function toneInk(tone: StatusTone): { accent: string; ink: string } {
  switch (tone) {
    case "ok":
      return { accent: colors.ok, ink: colors.ok };
    case "attention":
      return { accent: colors.warn, ink: colors.warn };
    case "bad":
      return { accent: colors.bad, ink: colors.bad2 };
    case "progress":
      return { accent: colors.acc, ink: colors.acc };
    case "neutral":
      return { accent: colors.t3, ink: colors.t1 };
    case "muted":
    default:
      return { accent: colors.t4, ink: colors.t3 };
  }
}

/** A timeline dot: red for an ending, grey for a dismissal, accent for "now", green behind. */
function dotColor(node: OwnerTimelineNode): string {
  if (node.tone === "bad") return colors.bad;
  if (node.tone === "muted") return colors.t3;
  return node.current ? colors.acc : colors.ok;
}

export default function OwnerReportScreen(): React.ReactElement {
  useThemeSync();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();

  const [trustOpen, setTrustOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** When the report was first seen `checking` — the start of the 60 s re-read window. */
  const checkingSince = useRef<number | null>(null);
  const [stillChecking, setStillChecking] = useState(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
    retry: shouldRetryRead,
    refetchInterval: (query) => {
      const data = query.state.data as ReportOwnerView | undefined;
      if (!data?.isOwner || displayStatusForView(data) !== "checking") return false;
      const since = checkingSince.current ?? Date.now();
      return Date.now() - since < RECEIPT_POLL_WINDOW_MS ? RECEIPT_POLL_INTERVAL_MS : false;
    },
  });

  const report = detail.data as ReportOwnerView | undefined;
  const displayStatus = report?.isOwner ? displayStatusForView(report) : null;

  /** Only the owner's view has anything for this screen; anyone else belongs on D1. */
  useEffect(() => {
    if (report && !report.isOwner) router.replace(`/r/${report.caseRef}`);
  }, [report]);

  // The re-read window: opens when the report is first seen checking (on arrival,
  // or after an edit sent it back), closes after a minute or when it settles.
  useEffect(() => {
    if (displayStatus !== "checking") {
      checkingSince.current = null;
      setStillChecking(false);
      return;
    }
    if (checkingSince.current === null) checkingSince.current = Date.now();
    const remaining = RECEIPT_POLL_WINDOW_MS - (Date.now() - checkingSince.current);
    if (remaining <= 0) {
      setStillChecking(true);
      return;
    }
    setStillChecking(false);
    const timer = setTimeout(() => setStillChecking(true), remaining);
    return () => clearTimeout(timer);
  }, [displayStatus]);

  // What D16 learned from a refused fourth resubmission (see the file header).
  const limitKey = resubmissionLimitKey(report?.id ?? "");
  const limit = useQuery({
    queryKey: limitKey,
    queryFn: () => queryClient.getQueryData<boolean>(limitKey) ?? false,
    enabled: Boolean(report?.id),
    initialData: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const resubmissionLimitReached = limit.data === true;

  const remove = useCallback(async () => {
    if (!report || deleting) return;
    setDeleting(true);
    try {
      await reportsApi.remove(report.id);
      setConfirmDelete(false);
      // The Vault and the feed both read under `feed`.
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      showSnackbar({ message: "Removed from the feed and from your Vault.", type: "success" });
      router.back();
    } catch (err) {
      setConfirmDelete(false);
      showSnackbar({
        message: errorInfo(err).message ?? "That report was not deleted. Try again.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }, [deleting, queryClient, report, showSnackbar]);

  if (detail.isLoading || (report && !report.isOwner)) {
    return (
      <ScrollScreen padding={screenPadding.detail} testID="owner-loading">
        <BackHeader title="Your report" onBack={() => router.back()} padding={0} />
        <View style={{ gap: 12, marginTop: 18 }} accessibilityLabel="Loading your report">
          <View style={[styles.bar, { backgroundColor: colors.s5, height: 150, borderRadius: 16 }]} />
          <View style={[styles.bar, { backgroundColor: colors.s5, width: "88%", height: 24 }]} />
        </View>
      </ScrollScreen>
    );
  }

  if (detail.isError || !report || !displayStatus) {
    const copy = readErrorCopy(detail.error, { owner: true });
    return (
      <ScrollScreen padding={screenPadding.detail} testID="owner-error">
        <BackHeader title="Your report" onBack={() => router.back()} padding={0} />
        <View style={styles.centre}>
          <Text variant="sectionTitle" color={colors.t0} center>
            {copy.title}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            {copy.body}
          </Text>
          <Button
            label={copy.retry ? "Try again" : "Back"}
            onPress={copy.retry ? () => void detail.refetch() : () => router.back()}
            loading={copy.retry && detail.isFetching}
            block={false}
            style={{ marginTop: 22, paddingHorizontal: 22 }}
            testID="owner-error-action"
          />
        </View>
      </ScrollScreen>
    );
  }

  const meta = CATEGORY_META[report.category];
  const isPrivate = report.visibility === "private";
  const banner = ownerBanner(report, { resubmissionLimitReached, stillChecking });
  const nodes = ownerTimelineNodes(report.timeline, report.moderationTimeline ?? [], {
    displayStatus,
    at: report.moderation?.at ?? null,
  });
  const editMode = ownerEditMode(report, { resubmissionLimitReached });
  const shareable = canShare({ ...report, isOwner: true });

  return (
    <>
      <ScrollScreen padding={screenPadding.detail} bottomSpace={34} testID="owner-detail">
        <BackHeader
          title="Your report"
          onBack={() => router.back()}
          padding={0}
          border
          right={
            shareable ? (
              <Pressable
                onPress={() => setShareOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Share"
                testID="owner-share"
              >
                <DotsGlyph />
              </Pressable>
            ) : undefined
          }
        />

        {/* The banner — only while the report is not simply live. */}
        {banner ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: alpha(toneInk(banner.tone).accent, 0.1),
                borderLeftColor: toneInk(banner.tone).accent,
              },
            ]}
            accessibilityRole="summary"
            testID={`owner-banner-${banner.displayStatus}`}
          >
            <Text variant="labelLg" color={toneInk(banner.tone).ink} style={{ fontSize: 14.5 }}>
              {banner.title}
            </Text>
            <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 5, lineHeight: 19 }}>
              {banner.body}
            </Text>

            {banner.reasonLabel ? (
              <View style={{ marginTop: 12 }}>
                <Text variant="eyebrowSm" color={colors.t4}>
                  REASON
                </Text>
                <Text variant="label" color={colors.t0} style={{ marginTop: 4 }} testID="owner-banner-reason">
                  {banner.reasonLabel}
                </Text>
              </View>
            ) : null}

            {banner.note ? (
              <View style={[styles.noteBox, { backgroundColor: colors.s3 }]}>
                <Text variant="eyebrowSm" color={colors.t4}>
                  NOTE FROM THE MODERATOR
                </Text>
                <Text variant="bodySm" color={colors.t1} style={{ marginTop: 5, lineHeight: 20 }} testID="owner-banner-note">
                  {banner.note}
                </Text>
              </View>
            ) : null}

            {banner.action === "resubmit" ? (
              <Button
                label={RESUBMIT_COPY.action}
                height={46}
                onPress={() => router.push(`/r/${report.caseRef}/edit`)}
                style={{ marginTop: 14 }}
                testID="owner-resubmit"
              />
            ) : banner.action === "contact_support" ? (
              <Button
                label="Contact support"
                variant="secondary"
                height={46}
                onPress={() => router.push(CONTACT_SUPPORT_ROUTE)}
                style={{ marginTop: 14 }}
                testID="owner-contact-support"
              />
            ) : null}
            {banner.actionHint ? (
              <Text variant="metaSm" color={colors.t3} style={{ marginTop: 8, lineHeight: 17 }}>
                {banner.actionHint}
              </Text>
            ) : null}

            {banner.displayStatus === "checking" && stillChecking ? (
              <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
                <TextButton
                  label={detail.isFetching ? "Checking…" : "Check again"}
                  color={colors.acc}
                  height={36}
                  onPress={() => void detail.refetch()}
                  testID="owner-check-again"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Status timeline, high up — the owner's first question. */}
        <View style={[styles.statusCard, { backgroundColor: colors.s3 }]} testID="owner-timeline">
          <Text variant="eyebrowSm" color={colors.t4}>
            STATUS
          </Text>
          <View style={{ marginTop: 14 }}>
            {nodes.map((node, index) => {
              const isLast = index === nodes.length - 1;
              const detailLine = [absoluteTime(node.at), node.actorLabel].filter(Boolean).join(" · ");
              return (
                <View key={node.key} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, { backgroundColor: dotColor(node) }]} />
                    {!isLast ? (
                      <View style={[styles.timelineLine, { backgroundColor: alpha(colors.t0, 0.12) }]} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
                    <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
                      {node.label}
                    </Text>
                    {detailLine ? (
                      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
                        {detailLine}
                      </Text>
                    ) : null}
                    {node.reasonLabel ? (
                      <Text variant="metaSm" color={colors.t2} style={{ marginTop: 4, lineHeight: 17 }}>
                        {`Reason: ${node.reasonLabel}`}
                      </Text>
                    ) : null}
                    {node.note ? (
                      <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 4, lineHeight: 18 }}>
                        {`“${node.note}”`}
                      </Text>
                    ) : null}
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
          {/* Where it sits, in the owner's word — unless that word is the visibility pill's "Private". */}
          {displayStatus !== "private" && !(isPrivate && displayStatus === "published") ? (
            <DisplayStatusPill displayStatus={displayStatus} isPrivate={isPrivate} />
          ) : null}
          <CategoryPill label={meta.label.toUpperCase()} dotColor={colors[meta.token]} />
          <StatusPill kind={report.visibility} />
          {report.author.anonymous ? <StatusPill kind="anonymous" /> : null}
          {report.urgent ? <StatusPill kind="urgent" /> : null}
        </View>

        {/* Who has seen this — v7 keeps two rows. */}
        <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
          WHO HAS SEEN THIS
        </Text>
        <View style={[styles.seenCard, { backgroundColor: colors.s3 }]}>
          <SeenRow
            label="Community feed"
            value={
              isPrivate
                ? "Never shown"
                : `${report.viewCount.toLocaleString()} view${report.viewCount === 1 ? "" : "s"}`
            }
          />
          <SeenRow
            label="Moderators"
            value={
              report.moderatorCount === 0
                ? "Not yet"
                : `${report.moderatorCount} ${report.moderatorCount === 1 ? "person" : "people"}`
            }
          />
        </View>

        {report.evidence.length > 0 ? (
          <>
            <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
              {`EVIDENCE · ${report.evidence.length} FILE${report.evidence.length === 1 ? "" : "S"}`}
            </Text>
            <EvidenceGrid
              evidence={report.evidence}
              owner
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

        <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 22 }}>
          MANAGE THIS REPORT
        </Text>
        <View style={styles.ownerActions}>
          {editMode === "edit" ? (
            <Button
              label="Edit report"
              variant="quiet"
              height={46}
              onPress={() => router.push(`/r/${report.caseRef}/edit`)}
              style={{ flex: 1, borderRadius: radius.md }}
              testID="edit-report"
            />
          ) : null}
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
          {isPrivate
            ? "Deleting removes it from your Vault. Sealed files are destroyed after 30 days."
            : "Deleting removes it from the feed and from your Vault. Sealed files are destroyed after 30 days."}
        </Text>
      </ScrollScreen>

      <TrustSheet
        visible={trustOpen}
        reportRef={report.caseRef}
        onClose={() => setTrustOpen(false)}
      />
      {shareable ? (
        <ReportShareSheet
          visible={shareOpen}
          report={report}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      {/* D17. */}
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this report?"
        body={deleteReportCopy({ files: report.evidence.length, visibility: report.visibility })}
        confirmLabel="Delete report"
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
        <View key={index} style={[styles.dot, { backgroundColor: colors.t1 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.xl,
    borderLeftWidth: 3,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 16,
  },
  noteBox: {
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginTop: 12,
  },

  statusCard: {
    borderRadius: radius.xl,
    padding: 16,
    marginTop: 16,
  },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { alignItems: "center", width: 11 },
  timelineDot: { width: 11, height: 11, borderRadius: 6 },
  timelineLine: { flex: 1, width: 2 },

  badges: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 11 },

  seenCard: {
    borderRadius: radius.xl,
    padding: 14,
    marginTop: 10,
    gap: 11,
  },
  seenRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },

  ownerActions: { flexDirection: "row", gap: 9, marginTop: 10 },

  centre: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 20 },
  bar: { borderRadius: 6 },
  dots: { width: 21, height: 21, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  dot: { width: 3, height: 3, borderRadius: 2 },
});
