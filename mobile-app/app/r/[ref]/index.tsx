/**
 * D1 · Report detail, community viewer.
 *
 * From the caption: "The header carries the title, never the category. The
 * condensed header carries the truncated title; the bottom bar stays put."
 *
 * And the section header, which is the rule this screen is organised around:
 * "There is exactly **one** trust card on the page and it holds three plain
 * signals; every hash, cipher and percentage lives one sheet down."
 *
 * That consolidation replaces four separate cards in the previous build
 * (Credibility, Custody, Security, plus a Compliance panel). The technical detail
 * is not deleted — it moved to D3, one tap away, where someone who wants a hash
 * can find one and everyone else is not asked to read one.
 *
 * ── The bottom bar ends in a Flag ─────────────────────────────────────────
 * v7's caption: "The bottom bar now ends in a Flag, not a Share — flagging for
 * admin review is the scope requirement, and sharing is the system sheet from the
 * header." And D9's: "the Flag button in the bar stays filled so the state is
 * legible after the snackbar goes." So the bar is *Stand with · Comments · Flag*,
 * Share lives in the header, and a report the viewer has already flagged
 * (`flaggedByMe`, §7.4) shows a filled, inert Flag and says "You flagged this" —
 * flagging twice would only return the same flag (§7.6). The flag itself still
 * goes through the reason sheet (D7: a category tab needs a category).
 *
 * ── What a viewer is never told (docs/INCIDENT_MODULE_PLAN.md §3.2, §10) ──
 * A viewer only reaches a *published* report — anything else is a 404, which is
 * why the error state cannot and does not say "not published yet". So there is
 * no *Under review* pill here: the case axis is the owner's business until it
 * ends in Verified. Evidence still waiting for a moderator is listed as
 * "Awaiting review" tiles, and a photo cleared only as a preview shows its
 * thumbnail with a note — said about the file, never the report.
 *
 * Share is offered only where it can work: a viewer of a public report gets the
 * plain `/r/<ref>` link back from the server (§11a); a Trusted-Circle report can
 * be shared only by its author, so the action is absent rather than broken.
 *
 * ── Owner routing ─────────────────────────────────────────────────────────
 * D2 is "a separate screen, not a variant", so an owner is redirected rather than
 * shown a version of this page with pieces swapped out — and sees the skeleton,
 * not a flash of the viewer page, while that happens.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import { alpha, colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { StatusPill, CategoryPill } from "@/components/report/StatusPill";
import { EvidenceGrid } from "@/components/report/EvidenceGrid";
import { MapPreview } from "@/components/report/MapPreview";
import { TrustCard } from "@/components/report/TrustCard";
import TrustSheet from "@/components/sheets/TrustSheet";
import FlagSheet from "@/components/sheets/FlagSheet";
import ReportShareSheet from "@/components/sheets/ReportShareSheet";
import { AuthorRow } from "@/components/report/AuthorRow";
import { useSnackbar } from "@/providers/SnackbarProvider";
import reportsApi, {
  CATEGORY_META,
  absoluteTime,
  type ReportDetailView,
} from "@/lib/api/reports";
import {
  canShare,
  errorInfo,
  readErrorCopy,
  shouldRetryRead,
  viewerStatusPills,
} from "@/lib/report/detail";

export default function ReportDetailScreen(): React.ReactElement {
  useThemeSync();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();

  const [trustOpen, setTrustOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [corroborating, setCorroborating] = useState(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
    retry: shouldRetryRead,
  });

  const report = detail.data as ReportDetailView | undefined;

  /** D2 is a separate screen — send the owner there rather than adapting this one. */
  useEffect(() => {
    if (report?.isOwner) {
      router.replace(`/r/${report.caseRef}/owner`);
    }
  }, [report?.caseRef, report?.isOwner]);

  const toggleSupport = useCallback(async () => {
    if (!report) return;
    // Optimistic, as on the feed: a tap that waits reads as broken.
    queryClient.setQueryData(["report", ref], (old: ReportDetailView | undefined) =>
      old
        ? {
            ...old,
            standingWith: !old.standingWith,
            supportCount: old.supportCount + (old.standingWith ? -1 : 1),
          }
        : old,
    );
    try {
      await reportsApi.toggleSupport(report.id);
    } catch (err) {
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
      showSnackbar({
        message: errorInfo(err).message ?? "That didn't save. Try again.",
        type: "error",
      });
    }
  }, [queryClient, ref, report, showSnackbar]);

  const corroborate = useCallback(async () => {
    if (!report || corroborating) return;
    setCorroborating(true);
    try {
      await reportsApi.corroborate(report.id);
    } catch (err) {
      showSnackbar({
        message: errorInfo(err).message ?? "That didn't save. Try again.",
        type: "error",
      });
    } finally {
      setCorroborating(false);
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
    }
  }, [corroborating, queryClient, ref, report, showSnackbar]);

  /** D9: the bar's Flag fills the moment the server has the flag. */
  const markFlagged = useCallback(() => {
    queryClient.setQueryData(["report", ref], (old: ReportDetailView | undefined) =>
      old ? { ...old, flaggedByMe: true } : old,
    );
  }, [queryClient, ref]);

  if (detail.isLoading || report?.isOwner) {
    return <DetailSkeleton />;
  }

  if (detail.isError || !report) {
    const copy = readErrorCopy(detail.error);
    return (
      <ScrollScreen padding={screenPadding.detail} testID="report-detail-error">
        <BackHeader onBack={() => router.back()} padding={0} />
        <View style={styles.centre}>
          <Text variant="sectionTitle" color={colors.t0} center>
            {copy.title}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            {copy.body}
          </Text>
          {copy.retry ? (
            <Button
              label="Try again"
              onPress={() => void detail.refetch()}
              loading={detail.isFetching}
              block={false}
              style={{ marginTop: 22, paddingHorizontal: 22 }}
              testID="report-detail-retry"
            />
          ) : (
            <Button
              label="Back to the feed"
              onPress={() => router.back()}
              block={false}
              style={{ marginTop: 22, paddingHorizontal: 22 }}
              testID="report-detail-back"
            />
          )}
        </View>
      </ScrollScreen>
    );
  }

  const meta = CATEGORY_META[report.category];
  const flagged = report.flaggedByMe === true;
  const shareable = canShare(report);

  return (
    <>
      <ScrollScreen
        padding={screenPadding.detail}
        bottomSpace={34}
        testID="report-detail"
        footer={
          /* The bottom bar stays put, and ends in a Flag. */
          <View style={styles.actionBar}>
            <Button
              label={`${report.standingWith ? "Standing with" : "Stand with"} · ${report.supportCount}`}
              onPress={toggleSupport}
              height={50}
              style={{ flex: 1 }}
              testID="detail-stand-with"
            />
            <Pressable
              onPress={() => router.push(`/r/${report.caseRef}/comments`)}
              accessibilityRole="button"
              accessibilityLabel={`${report.commentCount} comment${report.commentCount === 1 ? "" : "s"}`}
              style={[styles.iconButton, { backgroundColor: colors.s5 }]}
              testID="detail-comments"
            >
              <CommentGlyph />
            </Pressable>
            <Pressable
              onPress={() => setFlagOpen(true)}
              disabled={flagged}
              accessibilityRole="button"
              accessibilityLabel={flagged ? "You flagged this report" : "Flag this report"}
              accessibilityState={{ disabled: flagged, selected: flagged }}
              style={[
                styles.iconButton,
                { backgroundColor: flagged ? alpha(colors.bad, 0.12) : colors.s5 },
              ]}
              testID="detail-flag"
            >
              <FlagGlyph filled={flagged} />
            </Pressable>
          </View>
        }
      >
        {/* Condensed header: the title, truncated — never the category. */}
        <BackHeader
          title={report.title}
          onBack={() => router.back()}
          padding={0}
          border
          right={
            shareable ? (
              <Pressable
                onPress={() => setShareOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Share this report"
                testID="detail-share"
              >
                <ShareGlyph />
              </Pressable>
            ) : undefined
          }
        />

        {/* Urgent and Verified only — never a moderation word (§10 "Viewer D1"). */}
        <View style={styles.badges}>
          {viewerStatusPills(report).map((kind) => (
            <StatusPill key={kind} kind={kind} />
          ))}
          <CategoryPill label={meta.label.toUpperCase()} dotColor={colors[meta.token]} />
          <StatusPill kind={report.visibility} />
        </View>

        <Text variant="displaySm" color={colors.t0} style={styles.title}>
          {report.title}
        </Text>

        <AuthorRow author={report.author} area={report.location.label} style={{ marginTop: 18 }} />

        {/* HAPPENED / FILED, between hairlines. */}
        <View style={[styles.timePair, { borderColor: alpha(colors.t0, 0.07) }]}>
          <View>
            <Text variant="eyebrowSm" color={colors.t4}>
              HAPPENED
            </Text>
            <Text variant="label" color={colors.t0} style={{ marginTop: 6 }}>
              {report.occurredPrecision === "day_part" && report.occurredDayPart
                ? `${new Date(report.occurredAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}, ${report.occurredDayPart}`
                : absoluteTime(report.occurredAt)}
            </Text>
          </View>
          <View>
            <Text variant="eyebrowSm" color={colors.t4}>
              FILED
            </Text>
            <Text variant="label" color={colors.t0} style={{ marginTop: 6 }}>
              {absoluteTime(report.filedAt)}
            </Text>
          </View>
        </View>

        <Text variant="bodyLg" color={colors.t1} style={{ marginTop: 16 }}>
          {report.body}
        </Text>

        {report.evidence.length > 0 ? (
          <>
            <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 24 }}>
              {`EVIDENCE · ${report.evidence.length} FILE${report.evidence.length === 1 ? "" : "S"}`}
            </Text>
            <EvidenceGrid
              evidence={report.evidence}
              onOpen={(index) => router.push(`/r/${report.caseRef}/evidence/${index}`)}
              style={{ marginTop: 11 }}
            />
          </>
        ) : null}

        {report.location.precision !== "hidden" ? (
          <MapPreview
            precision={report.location.precision}
            lat={report.location.lat}
            lng={report.location.lng}
            caption={
              report.location.label
                ? `${report.location.precision === "approximate" ? "Approximate" : "Exact"} · ${report.location.label}`
                : undefined
            }
            height={172}
            style={{ marginTop: 16 }}
          />
        ) : null}

        {/* Support summary, with Corroborate as its own act. */}
        <View style={[styles.supportCard, { backgroundColor: colors.s3 }]}>
          <View style={{ flex: 1 }}>
            <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
              {`${report.supportCount} standing with`}
            </Text>
            <Text variant="metaSm" color={colors.t3} style={{ marginTop: 3, lineHeight: 18 }}>
              <Text variant="metaSm" color={colors.corro}>
                {`Corroborated by ${report.corroborationCount} ${
                  report.corroborationCount === 1 ? "person" : "people"
                }`}
              </Text>
              {` · ${report.commentCount} comment${report.commentCount === 1 ? "" : "s"}`}
            </Text>
          </View>
          <Button
            label={report.corroborated ? "Corroborated" : "Corroborate"}
            variant="secondary"
            block={false}
            height={36}
            disabled={report.corroborated}
            loading={corroborating}
            onPress={corroborate}
            style={{ paddingHorizontal: 14, borderRadius: 12 }}
            testID="detail-corroborate"
          />
        </View>

        {/* Comments preview, then the link out. */}
        {report.commentCount > 0 ? (
          <>
            <Text variant="fieldLabel" color={colors.t3} style={{ marginTop: 24 }}>
              COMMENTS
            </Text>
            <Pressable
              onPress={() => router.push(`/r/${report.caseRef}/comments`)}
              accessibilityRole="button"
              style={{ marginTop: 12 }}
              testID="detail-see-comments"
            >
              <Text variant="labelSm" color={colors.acc}>
                {`See all ${report.commentCount} comment${report.commentCount === 1 ? "" : "s"}`}
              </Text>
            </Pressable>
          </>
        ) : null}

        {/* The one trust card. Everything technical is one sheet down. */}
        <TrustCard
          status={report.status}
          strength={report.evidenceStrength}
          fileCount={report.evidence.length}
          onOpen={() => setTrustOpen(true)}
          style={{ marginTop: 22 }}
        />

        <View style={[styles.footerRow, { borderTopColor: alpha(colors.t0, 0.07) }]}>
          <Text variant="meta" color={colors.t4}>
            {`Reference ${report.caseRef}`}
          </Text>
          {flagged ? (
            <Text variant="meta" color={colors.bad2} testID="detail-flagged">
              You flagged this
            </Text>
          ) : null}
        </View>
      </ScrollScreen>

      <TrustSheet
        visible={trustOpen}
        reportRef={report.caseRef}
        onClose={() => setTrustOpen(false)}
      />
      <FlagSheet
        visible={flagOpen}
        target={{ kind: "report", id: report.id }}
        onFlagged={markFlagged}
        onClose={() => setFlagOpen(false)}
      />
      {shareable ? (
        <ReportShareSheet
          visible={shareOpen}
          report={report}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );
}

/** I1's skeleton — also what an owner sees for the instant before D2 replaces this. */
function DetailSkeleton(): React.ReactElement {
  return (
    <ScrollScreen padding={screenPadding.detail} testID="report-detail-loading">
      <BackHeader onBack={() => router.back()} padding={0} />
      <View style={{ gap: 12, marginTop: 18 }} accessibilityLabel="Loading the report">
        <View style={[styles.bar, { backgroundColor: colors.s5, width: 140, height: 24, borderRadius: 7 }]} />
        <View style={[styles.bar, { backgroundColor: colors.s5, width: "94%", height: 28 }]} />
        <View style={[styles.bar, { backgroundColor: colors.s5, width: "72%", height: 28 }]} />
        <View
          style={[
            styles.bar,
            { backgroundColor: colors.s5, width: "100%", height: 172, borderRadius: 16, marginTop: 12 },
          ]}
        />
      </View>
    </ScrollScreen>
  );
}

function CommentGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={[styles.bubble, { borderColor: colors.t1 }]} />
      <View style={[styles.bubbleTail, { borderColor: colors.t1 }]} />
    </View>
  );
}

/**
 * The board's flag: a pennant on a pole. Outlined in the bar; filled red once
 * the viewer has flagged the report, and it stays that way (D9).
 */
function FlagGlyph({ filled }: { filled: boolean }): React.ReactElement {
  const tint = filled ? colors.bad2 : colors.t1;
  return (
    <Svg width={19} height={19} viewBox="0 0 22 22">
      <Path
        d="M5.5 19V3.4h11l-2 3.6 2 3.6h-11"
        fill={filled ? tint : "none"}
        stroke={tint}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ShareGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={[styles.shareStem, { backgroundColor: colors.t1 }]} />
      <View style={[styles.shareArrow, { backgroundColor: colors.t1, transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.shareArrow, { backgroundColor: colors.t1, transform: [{ rotate: "-45deg" }] }]} />
      <View style={[styles.shareTray, { borderColor: colors.t1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 18 },
  title: { marginTop: 15, fontSize: 29 },

  timePair: {
    flexDirection: "row",
    gap: 26,
    marginTop: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  supportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 16,
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  actionBar: { flexDirection: "row", gap: 9 },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },

  centre: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 20 },
  bar: { borderRadius: 6 },

  glyph: { width: 19, height: 19, alignItems: "center", justifyContent: "center" },
  bubble: {
    width: 15,
    height: 11,
    borderRadius: 3,
    borderWidth: 1.5,
    marginBottom: 3,
  },
  bubbleTail: {
    position: "absolute",
    bottom: 2,
    left: 4,
    width: 4,
    height: 4,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
  },
  shareStem: { position: "absolute", top: 1, width: 1.7, height: 10 },
  shareArrow: {
    position: "absolute",
    top: 3,
    width: 1.7,
    height: 5,
  },
  shareTray: {
    position: "absolute",
    bottom: 1,
    width: 14,
    height: 7,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
});
