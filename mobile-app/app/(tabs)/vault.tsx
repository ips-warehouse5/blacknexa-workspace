/**
 * Vault. `DERIVED` — not drawn in sections A–D.
 *
 * It exists because D2's copy references it: "Deleting removes it from the feed
 * **and from your Vault**." A screen the design names has to be there.
 *
 * Contents follow from what the rest of the app already needs: the reports you
 * filed, grouped by where they have got to, and the drafts you have not finished.
 * It is a filtered view of `/reports?mine=true` plus the local draft store, not a
 * new subsystem.
 *
 * ── Private reports are the point ──────────────────────────────────────────
 * A private report never appears in the feed, so this is the only place it is
 * reachable. That makes the Vault the answer to "where did my report go" for anyone
 * who chose Private on C6.
 */

import React, { useCallback, useMemo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { CategoryDot } from "@/components/ui/Controls";
import { StatusPill } from "@/components/report/StatusPill";
import reportsApi, {
  CATEGORY_META,
  relativeTime,
  type DraftSummary,
  type FeedCardView,
} from "@/lib/api/reports";

type Row =
  | { kind: "header"; label: string; count: number }
  | { kind: "draft"; value: DraftSummary }
  | { kind: "report"; value: FeedCardView };

const STATUS_ORDER = ["submitted", "under_review", "verified", "dismissed"] as const;

export default function VaultScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();

  const mine = useQuery({
    queryKey: ["feed", "mine"],
    queryFn: () => reportsApi.feed({ mine: true, limit: 50 }),
  });

  const drafts = useQuery({
    queryKey: ["drafts"],
    queryFn: () => reportsApi.listDrafts(),
  });

  const reports = mine.data?.items ?? [];
  const draftList = drafts.data ?? [];

  /** Drafts first — they are the only thing here that needs finishing. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    if (draftList.length > 0) {
      out.push({ kind: "header", label: "UNFINISHED", count: draftList.length });
      for (const draft of draftList) out.push({ kind: "draft", value: draft });
    }

    if (reports.length > 0) {
      out.push({ kind: "header", label: "FILED", count: reports.length });
      // Newest first within the group, which is how a person remembers them.
      for (const report of reports) out.push({ kind: "report", value: report });
    }

    return out;
  }, [draftList, reports]);

  const stats = useMemo(() => {
    const verified = reports.filter((row) => row.verified).length;
    const files = reports.reduce((sum, row) => sum + row.mediaCount, 0);
    return { total: reports.length, verified, files };
  }, [reports]);

  const openDraft = useCallback(() => {
    // The wizard resumes at the step the draft stopped on.
    router.push("/report");
  }, []);

  const refreshing = mine.isRefetching || drafts.isRefetching;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text variant="cardTitle" color={colors.t0} style={{ fontSize: 18 }}>
          Vault
        </Text>
        <Text variant="metaSm" color={colors.t4} style={{ marginTop: 3 }}>
          Everything you have filed, and everything still open.
        </Text>
      </View>

      {/* Three numbers, not a dashboard. */}
      <View style={styles.stats}>
        <Stat label="Reports" value={stats.total} />
        <Stat label="Verified" value={stats.verified} tint={colors.ok} />
        <Stat label="Files sealed" value={stats.files} />
      </View>

      {mine.isLoading ? (
        <View style={styles.list}>
          {[1, 0.6].map((opacity, index) => (
            <View key={index} style={[styles.card, { opacity }]}>
              <View style={[styles.bar, { width: 90, height: 11 }]} />
              <View style={[styles.bar, { width: "88%", height: 16, marginTop: 10 }]} />
            </View>
          ))}
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centre}>
          <Text variant="sectionTitle" color={colors.t0} center>
            Nothing here yet
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            Reports you file appear here — including private ones, which never reach
            the community feed.
          </Text>
          <Button
            label="File a report"
            onPress={() => router.push("/report")}
            block={false}
            style={{ marginTop: 22, paddingHorizontal: 22 }}
            testID="vault-file"
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, index) =>
            row.kind === "header"
              ? `h-${row.label}`
              : row.kind === "draft"
                ? `d-${row.value.id}`
                : `r-${row.value.id}`
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void mine.refetch();
                void drafts.refetch();
              }}
              tintColor={colors.acc}
            />
          }
          renderItem={({ item: row }) => {
            if (row.kind === "header") {
              return (
                <Text variant="fieldLabel" color={colors.t3} style={styles.groupHeader}>
                  {`${row.label} · ${row.count}`}
                </Text>
              );
            }

            if (row.kind === "draft") {
              const payload = row.value.payload;
              const category = payload.category;
              return (
                <Pressable
                  onPress={openDraft}
                  accessibilityRole="button"
                  accessibilityLabel={`Unfinished draft, step ${row.value.step} of 7`}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
                  testID={`draft-${row.value.id}`}
                >
                  <View style={styles.cardHead}>
                    {category ? (
                      <View style={styles.metaRow}>
                        <CategoryDot color={colors[CATEGORY_META[category].token]} />
                        <Text variant="meta" color={colors.t2}>
                          {CATEGORY_META[category].label}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.draftTag}>
                      <Text variant="eyebrow" color={colors.warn} style={{ fontSize: 9.5 }}>
                        Draft
                      </Text>
                    </View>
                  </View>

                  <Text variant="cardTitleSm" color={colors.t0} numberOfLines={2} style={{ marginTop: 8 }}>
                    {payload.title?.trim() || "Untitled report"}
                  </Text>

                  <Text variant="metaSm" color={colors.t4} style={{ marginTop: 7 }}>
                    {[
                      `Step ${row.value.step} of 7`,
                      row.value.evidenceCount > 0
                        ? `${row.value.evidenceCount} file${row.value.evidenceCount === 1 ? "" : "s"}`
                        : null,
                      `saved ${relativeTime(row.value.updatedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Pressable>
              );
            }

            const report = row.value;
            return (
              <Pressable
                onPress={() => router.push(`/r/${report.caseRef}`)}
                accessibilityRole="button"
                accessibilityLabel={report.title}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
                testID={`vault-report-${report.caseRef}`}
              >
                <View style={styles.cardHead}>
                  <View style={styles.metaRow}>
                    <CategoryDot color={colors[CATEGORY_META[report.category].token]} />
                    <Text variant="meta" color={colors.t2}>
                      {CATEGORY_META[report.category].label}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {report.urgent ? <StatusPill kind="urgent" /> : null}
                    {report.verified ? <StatusPill kind="verified" /> : null}
                    <StatusPill kind={report.visibility} />
                  </View>
                </View>

                <Text variant="cardTitleSm" color={colors.t0} numberOfLines={2} style={{ marginTop: 8 }}>
                  {report.title}
                </Text>

                <Text variant="metaSm" color={colors.t4} style={{ marginTop: 7 }}>
                  {[
                    report.caseRef,
                    relativeTime(report.filedAt),
                    report.mediaCount > 0
                      ? `${report.mediaCount} file${report.mediaCount === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  tint = colors.t0,
}: {
  label: string;
  value: number;
  tint?: string;
}): React.ReactElement {
  return (
    <View style={styles.stat}>
      <Text variant="sectionTitle" color={tint}>
        {String(value)}
      </Text>
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  stats: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: screenPadding.feed,
    paddingBottom: 6,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.s3,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },

  list: { paddingHorizontal: screenPadding.feed, paddingTop: 8, paddingBottom: 28, gap: 10 },
  groupHeader: { paddingTop: 14, paddingBottom: 2, paddingHorizontal: 2 },
  card: {
    backgroundColor: colors.s3,
    borderRadius: radius.xl,
    padding: 15,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  draftTag: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: alpha(colors.warn, 0.13),
    alignItems: "center",
    justifyContent: "center",
  },

  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 42,
    paddingBottom: 80,
  },
  bar: { backgroundColor: colors.s5, borderRadius: 5 },
});
