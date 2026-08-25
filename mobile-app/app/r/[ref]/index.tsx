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
 * ── Owner routing ─────────────────────────────────────────────────────────
 * D2 is "a separate screen, not a variant", so an owner is redirected rather than
 * shown a version of this page with pieces swapped out.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
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
import reportsApi, {
  CATEGORY_META,
  absoluteTime,
  type ReportDetailView,
} from "@/lib/api/reports";

export default function ReportDetailScreen(): React.ReactElement {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();

  const [trustOpen, setTrustOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["report", ref],
    queryFn: () => reportsApi.detail(ref!),
    enabled: Boolean(ref),
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
    } catch {
      void queryClient.invalidateQueries({ queryKey: ["report", ref] });
    }
  }, [queryClient, ref, report]);

  const corroborate = useCallback(async () => {
    if (!report) return;
    await reportsApi.corroborate(report.id).catch(() => {});
    void queryClient.invalidateQueries({ queryKey: ["report", ref] });
  }, [queryClient, ref, report]);

  if (detail.isLoading) {
    return (
      <ScrollScreen padding={screenPadding.detail} testID="report-detail-loading">
        <BackHeader onBack={() => router.back()} padding={0} />
        <View style={{ gap: 12, marginTop: 18 }}>
          <View style={[styles.bar, { width: 140, height: 24, borderRadius: 7 }]} />
          <View style={[styles.bar, { width: "94%", height: 28 }]} />
          <View style={[styles.bar, { width: "72%", height: 28 }]} />
          <View style={[styles.bar, { width: "100%", height: 172, borderRadius: 16, marginTop: 12 }]} />
        </View>
      </ScrollScreen>
    );
  }

  if (detail.isError || !report) {
    return (
      <ScrollScreen padding={screenPadding.detail} testID="report-detail-error">
        <BackHeader onBack={() => router.back()} padding={0} />
        <View style={styles.centre}>
          <Text variant="sectionTitle" color={colors.t0} center>
            That report is not available
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            It may have been removed, or it may not be public.
          </Text>
          <Button
            label="Back to the feed"
            onPress={() => router.back()}
            block={false}
            style={{ marginTop: 22, paddingHorizontal: 22 }}
          />
        </View>
      </ScrollScreen>
    );
  }

  const meta = CATEGORY_META[report.category];

  return (
    <>
      <ScrollScreen
        padding={screenPadding.detail}
        bottomSpace={34}
        testID="report-detail"
        footer={
          /* The bottom bar stays put. */
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
              accessibilityLabel={`${report.commentCount} comments`}
              style={styles.iconButton}
              testID="detail-comments"
            >
              <CommentGlyph />
            </Pressable>
            <Pressable
              onPress={() => setShareOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Share this report"
              style={styles.iconButton}
              testID="detail-share"
            >
              <ShareGlyph />
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
            <Pressable
              onPress={() => setShareOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <ShareGlyph />
            </Pressable>
          }
        />

        <View style={styles.badges}>
          {report.urgent ? <StatusPill kind="urgent" /> : null}
          {report.status === "verified" ? <StatusPill kind="verified" /> : null}
          {report.status === "under_review" ? <StatusPill kind="under_review" /> : null}
          <CategoryPill label={meta.label.toUpperCase()} dotColor={colors[meta.token]} />
          <StatusPill kind={report.visibility} />
        </View>

        <Text variant="displaySm" color={colors.t0} style={styles.title}>
          {report.title}
        </Text>

        <AuthorRow author={report.author} area={report.location.label} style={{ marginTop: 18 }} />

        {/* HAPPENED / FILED, between hairlines. */}
        <View style={styles.timePair}>
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
              onOpen={(index) =>
                router.push(`/r/${report.caseRef}/evidence/${index}`)
              }
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
        <View style={styles.supportCard}>
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

        <View style={styles.footerRow}>
          <Text variant="meta" color={colors.t4}>
            {`Reference ${report.caseRef}`}
          </Text>
          <Pressable
            onPress={() => setFlagOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            testID="detail-flag"
          >
            <Text variant="meta" color={colors.t3}>
              Flag this report
            </Text>
          </Pressable>
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
        onClose={() => setFlagOpen(false)}
      />
      <ReportShareSheet
        visible={shareOpen}
        report={report}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}

function CommentGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={styles.bubble} />
      <View style={styles.bubbleTail} />
    </View>
  );
}

export function ShareGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={styles.shareStem} />
      <View style={[styles.shareArrow, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.shareArrow, { transform: [{ rotate: "-45deg" }] }]} />
      <View style={styles.shareTray} />
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
    borderColor: alpha(colors.t0, 0.07),
  },

  supportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 16,
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(colors.t0, 0.07),
  },

  actionBar: { flexDirection: "row", gap: 9 },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.s5,
    alignItems: "center",
    justifyContent: "center",
  },

  centre: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 20 },
  bar: { backgroundColor: colors.s5, borderRadius: 6 },

  glyph: { width: 19, height: 19, alignItems: "center", justifyContent: "center" },
  bubble: {
    width: 15,
    height: 11,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.t1,
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
    borderColor: colors.t1,
  },
  shareStem: { position: "absolute", top: 1, width: 1.7, height: 10, backgroundColor: colors.t1 },
  shareArrow: {
    position: "absolute",
    top: 3,
    width: 1.7,
    height: 5,
    backgroundColor: colors.t1,
  },
  shareTray: {
    position: "absolute",
    bottom: 1,
    width: 14,
    height: 7,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderColor: colors.t1,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
});
