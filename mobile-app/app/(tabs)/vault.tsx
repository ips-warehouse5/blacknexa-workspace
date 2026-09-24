/**
 * F1 · Vault — My Reports.
 *
 * From the caption: "Filters is pinned left exactly as it is on the feed … the
 * status chips stay on the rail beside it as one-tap shortcuts. A draft shows how
 * far it got and offers Resume; a dismissed row dims but is never hidden."
 *
 * ── Private reports are the point ──────────────────────────────────────────
 * A private report never appears in the feed, so this is the only place it is
 * reachable. That makes the Vault the answer to "where did my report go" for anyone
 * who chose Private on C6 — and, since revision 2, for anyone whose report is
 * still being checked, is with a moderator, or was not published.
 *
 * ── Revision 2 (docs/INCIDENT_MODULE_PLAN.md §3.2, §10 "Vault F1") ─────────
 *   • **One status per row.** Each report carries the owner's `displayStatus` —
 *     publication and case folded into one word (Checking, With a moderator, Not
 *     published, Published, Under review, Verified, Dismissed, Taken down,
 *     Private). The old rows showed only a Verified pill, which could not tell a
 *     held report from a published one.
 *   • **The rail filters on the server.** A status chip asks
 *     `GET /reports?mine=true&displayStatus=…`, the inverse of the server's own
 *     table, so a chip returns exactly the rows that show its word. Chips with
 *     nothing in them are hidden (except All, and the one selected). There is no
 *     count endpoint for the Vault, so the counts come from reading the caller's
 *     reports once; past a few hundred every chip shows rather than a guess.
 *   • **Rows open the owner view** (D2, never D1 — F6 wiring), and a draft row
 *     opens `/report?draftId=<id>`, which resumes *that* draft, from any device.
 *
 * Not built here (plan §12): the Evidence tab and F1b's date-range and sort
 * sheet — so the rail stands without the Filters button beside it.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { alpha, colors, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { CategoryDot, Chip } from "@/components/ui/Controls";
import { completedStepsOf } from "@/providers/ReportDraftProvider";
import reportsApi, {
  CATEGORY_META,
  absoluteTime,
  relativeTime,
  type DraftSummary,
  type FeedCardView,
  type Visibility,
} from "@/lib/api/reports";
import {
  displayStatusForCard,
  ownerStatusCopy,
  vaultChipLabel,
  vaultCounts,
  visibleVaultChips,
  type DisplayStatus,
  type StatusTone,
  type VaultChip,
  type VaultCounts,
} from "@/lib/report/moderation";

/** Rows per page of the list itself. */
const PAGE_SIZE = 30;
/** The counts read the caller's reports this many at a time, for at most this many pages. */
const COUNT_PAGE_SIZE = 50;
const COUNT_MAX_PAGES = 10;

const VISIBILITY_WORD: Record<Visibility, string> = {
  public: "Public",
  trusted: "Trusted Circle",
  private: "Private",
};

type Row =
  | { kind: "draft"; at: string; value: DraftSummary }
  | { kind: "report"; at: string; value: FeedCardView };

/**
 * Every filed report's display status, for the chip counts. Null when there are
 * more than the counts read — the rail then shows every chip instead of hiding
 * one that might not be empty.
 */
async function fetchMineStatuses(): Promise<DisplayStatus[] | null> {
  const statuses: DisplayStatus[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < COUNT_MAX_PAGES; page += 1) {
    const result = await reportsApi.feed({ mine: true, limit: COUNT_PAGE_SIZE, cursor });
    for (const card of result.items) statuses.push(displayStatusForCard(card));
    if (!result.nextCursor) return statuses;
    cursor = result.nextCursor;
  }
  return null;
}

/** A tone as this screen's colours: a status tint behind full-strength text. */
function toneColors(tone: StatusTone): { background: string; foreground: string } {
  switch (tone) {
    case "ok":
      return { background: alpha(colors.ok, 0.14), foreground: colors.ok };
    case "attention":
      return { background: alpha(colors.warn, 0.14), foreground: colors.warn };
    case "bad":
      return { background: alpha(colors.bad, 0.14), foreground: colors.bad2 };
    case "progress":
      return { background: alpha(colors.acc, 0.14), foreground: colors.acc };
    case "neutral":
      return { background: colors.s6, foreground: colors.t1 };
    case "muted":
    default:
      return { background: colors.s5, foreground: colors.t3 };
  }
}

export default function VaultScreen(): React.ReactElement {
  useThemeSync();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [chip, setChip] = useState<VaultChip>("all");

  const drafts = useQuery({
    queryKey: ["drafts"],
    queryFn: () => reportsApi.listDrafts(),
  });

  const statuses = useQuery({
    queryKey: ["feed", "mine", "statuses"],
    queryFn: fetchMineStatuses,
  });

  const statusFilter: DisplayStatus | undefined =
    chip === "all" || chip === "drafts" ? undefined : chip;

  const reports = useInfiniteQuery({
    queryKey: ["feed", "mine", "list", statusFilter ?? "all"],
    enabled: chip !== "drafts",
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      reportsApi.feed({
        mine: true,
        displayStatus: statusFilter,
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  /**
   * Coming back from the wizard or from D2 (a draft saved, a report filed, edited
   * or deleted) re-reads the lists. Skipped on the first focus, which the queries
   * already fetch for.
   */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
      void queryClient.invalidateQueries({ queryKey: ["feed", "mine"] });
    }, [queryClient]),
  );

  const draftList = useMemo(() => drafts.data ?? [], [drafts.data]);
  const reportList = useMemo(
    () => reports.data?.pages.flatMap((page) => page.items) ?? [],
    [reports.data],
  );

  const counts: VaultCounts | null = useMemo(
    () => (statuses.data ? vaultCounts(statuses.data, draftList.length) : null),
    [draftList.length, statuses.data],
  );
  const chips = useMemo(() => visibleVaultChips(counts, chip), [chip, counts]);

  /**
   * Newest first across drafts and reports. A draft older than the last report
   * loaded waits for the next page, so it cannot jump ahead of reports that
   * have not arrived yet.
   */
  const rows = useMemo<Row[]>(() => {
    const draftRows: Row[] =
      chip === "all" || chip === "drafts"
        ? draftList.map((value) => ({ kind: "draft", at: value.updatedAt, value }))
        : [];
    const reportRows: Row[] =
      chip === "drafts"
        ? []
        : reportList.map((value) => ({ kind: "report", at: value.filedAt, value }));
    if (chip === "drafts") return draftRows;

    const oldestLoaded = reportRows[reportRows.length - 1]?.at;
    const includedDrafts =
      reports.hasNextPage && oldestLoaded
        ? draftRows.filter((row) => row.at >= oldestLoaded)
        : draftRows;
    return [...includedDrafts, ...reportRows].sort((a, b) =>
      a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
    );
  }, [chip, draftList, reportList, reports.hasNextPage]);

  /** "6 reports · Newest first" — the whole set's size when it is known. */
  const resultLine = useMemo(() => {
    const total = counts ? counts[chip] : chip === "drafts" ? draftList.length : rows.length;
    const noun = chip === "drafts" ? "draft" : "report";
    return `${total} ${noun}${total === 1 ? "" : "s"} · Newest first`;
  }, [chip, counts, draftList.length, rows.length]);

  const openDraft = useCallback((draftId: string) => {
    router.push({ pathname: "/report", params: { draftId } });
  }, []);

  const openReport = useCallback((report: FeedCardView) => {
    router.push(`/r/${report.caseRef}/owner`);
  }, []);

  const refresh = useCallback(() => {
    void drafts.refetch();
    void statuses.refetch();
    if (chip !== "drafts") void reports.refetch();
  }, [chip, drafts, reports, statuses]);

  const loading = drafts.isLoading || (chip !== "drafts" && reports.isLoading);
  const failed = drafts.isError && (chip === "drafts" || reports.isError);
  const listFailed = chip !== "drafts" && reports.isError;
  const nothingAtAll =
    chip === "all" && rows.length === 0 && !loading && !listFailed && !drafts.isError;
  const refreshing =
    (drafts.isRefetching || reports.isRefetching || statuses.isRefetching) &&
    !reports.isFetchingNextPage;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 2, paddingBottom: 10 }}>
        <Text variant="cardTitle" color={colors.t0} style={{ fontSize: 22 }}>
          Vault
        </Text>
        <Text variant="metaSm" color={colors.t3} style={{ marginTop: 8, lineHeight: 17 }}>
          Your files are encrypted on our servers and sealed the moment you upload them.
        </Text>
      </View>

      {/* The status rail — the one horizontally scrolling region, faded at its edge. */}
      <MaskedView
        style={{ height: 40 }}
        maskElement={
          <LinearGradient
            colors={["#000", "#000", "transparent"]}
            locations={[0, 0.94, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={chips}
          keyExtractor={(entry) => entry}
          contentContainerStyle={{ gap: 7, paddingHorizontal: 18, alignItems: "center" }}
          renderItem={({ item: entry }) => (
            <Chip
              label={vaultChipLabel(entry)}
              count={counts ? counts[entry] : undefined}
              selected={chip === entry}
              height={31}
              onPress={() => setChip(entry)}
              testID={`vault-chip-${entry}`}
            />
          )}
        />
      </MaskedView>

      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: alpha(colors.t0, 0.07),
        }}
      >
        <Text variant="metaSm" color={colors.t3} testID="vault-result-line">
          {resultLine}
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: screenPadding.feed + 2 }}>
          {[1, 0.7, 0.45].map((opacity, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 12, paddingVertical: 14, opacity }}>
              <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.s5 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ width: 90, height: 12, borderRadius: 5, backgroundColor: colors.s5 }} />
                <View style={{ width: "88%", height: 16, borderRadius: 5, backgroundColor: colors.s5 }} />
                <View style={{ width: "60%", height: 11, borderRadius: 5, backgroundColor: colors.s5 }} />
              </View>
            </View>
          ))}
        </View>
      ) : failed || (listFailed && rows.length === 0) ? (
        <CentredState
          title="Couldn’t load your reports"
          body="This isn’t you. Check your connection and try again."
          action={{ label: "Try again", onPress: refresh, testID: "vault-retry" }}
        />
      ) : nothingAtAll ? (
        <CentredState
          title="Nothing here yet"
          body="Reports you file appear here — including private ones, which never reach the community feed."
          action={{ label: "File a report", onPress: () => router.push("/report"), testID: "vault-file" }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => `${row.kind}-${row.value.id}`}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: alpha(colors.t0, 0.06) }} />
          )}
          renderItem={({ item: row }) =>
            row.kind === "draft" ? (
              <DraftRow draft={row.value} onPress={openDraft} />
            ) : (
              <ReportRow report={row.value} onPress={openReport} />
            )
          }
          ListEmptyComponent={
            <Text variant="bodySm" color={colors.t3} center style={{ paddingTop: 40, lineHeight: 20 }}>
              {chip === "drafts"
                ? "No unfinished drafts."
                : `No reports are “${vaultChipLabel(chip)}” right now.`}
            </Text>
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (reports.hasNextPage && !reports.isFetchingNextPage) void reports.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.acc} />
          }
          ListFooterComponent={
            reports.isFetchingNextPage ? (
              <Text variant="metaSm" color={colors.t4} center style={{ paddingVertical: 18 }}>
                Loading more…
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

/** F1's status tag: a tinted pill with the owner's word, upper-cased. */
function StatusTag({ label, tone }: { label: string; tone: StatusTone }): React.ReactElement {
  const { background, foreground } = toneColors(tone);
  return (
    <View
      style={{
        height: 20,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="eyebrow" color={foreground} style={{ fontSize: 10, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** The 56px tile at the start of a row: the lead image when there is one. */
function RowThumb({ uri }: { uri: string | null }): React.ReactElement {
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: uri ? colors.ph : colors.s5,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
    </View>
  );
}

/**
 * A filed report. Opens D2. A dismissed row dims but is never hidden — the case
 * is closed, and the report is still the person's record.
 */
function ReportRow({
  report,
  onPress,
}: {
  report: FeedCardView;
  onPress: (report: FeedCardView) => void;
}): React.ReactElement {
  const status = displayStatusForCard(report);
  const copy = ownerStatusCopy(status, { isPrivate: report.visibility === "private" });
  const meta = CATEGORY_META[report.category];
  return (
    <Pressable
      onPress={() => onPress(report)}
      accessibilityRole="button"
      accessibilityLabel={`${copy.label}. ${report.title}. ${report.caseRef}`}
      style={({ pressed }) => [
        { flexDirection: "row", gap: 12, paddingVertical: 14 },
        status === "dismissed" && { opacity: 0.45 },
        pressed && { opacity: status === "dismissed" ? 0.4 : 0.85 },
      ]}
      testID={`vault-report-${report.caseRef}`}
    >
      <RowThumb uri={report.leadMedia?.thumbUrl ?? report.leadMedia?.posterUrl ?? null} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <StatusTag label={copy.label} tone={copy.tone} />
          <Text variant="metaSm" color={colors.t4} style={{ fontSize: 11 }}>
            {report.caseRef}
          </Text>
        </View>
        <Text
          variant="cardTitleSm"
          color={colors.t0}
          numberOfLines={2}
          style={{ fontSize: 15, marginTop: 6 }}
        >
          {report.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
          <CategoryDot color={colors[meta.token]} size={6} />
          <Text variant="metaSm" color={colors.t4} numberOfLines={1} style={{ fontSize: 11, flexShrink: 1 }}>
            {[meta.label, VISIBILITY_WORD[report.visibility], absoluteTime(report.filedAt)]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        {report.mediaCount > 0 || report.urgent ? (
          <Text variant="metaSm" color={colors.t3} style={{ fontSize: 11, marginTop: 3 }}>
            {[
              report.urgent ? "Urgent" : null,
              report.mediaCount > 0
                ? `${report.mediaCount} file${report.mediaCount === 1 ? "" : "s"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** An unfinished draft: how far it got, and Resume. */
function DraftRow({
  draft,
  onPress,
}: {
  draft: DraftSummary;
  onPress: (draftId: string) => void;
}): React.ReactElement {
  const done = completedStepsOf(draft.payload ?? {});
  const title = draft.payload?.title?.trim() || "Untitled report";
  const files = draft.evidenceCount;
  return (
    <Pressable
      onPress={() => onPress(draft.id)}
      accessibilityRole="button"
      accessibilityLabel={`Draft, not filed. ${title}. ${done} of 7 steps done. Resume`}
      style={({ pressed }) => [
        { flexDirection: "row", gap: 12, paddingVertical: 14 },
        pressed && { opacity: 0.85 },
      ]}
      testID={`draft-${draft.id}`}
    >
      <RowThumb uri={null} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <StatusTag label="Draft" tone="neutral" />
          <Text variant="metaSm" color={colors.t4} style={{ fontSize: 11 }}>
            Not filed
          </Text>
        </View>
        <Text
          variant="cardTitleSm"
          color={colors.t0}
          numberOfLines={2}
          style={{ fontSize: 15, marginTop: 6 }}
        >
          {title}
        </Text>
        <Text variant="metaSm" color={colors.t4} style={{ fontSize: 11, marginTop: 5 }}>
          {[
            `${done} of 7 steps done`,
            files > 0 ? `${files} file${files === 1 ? "" : "s"}` : null,
            `saved ${relativeTime(draft.updatedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <View
            style={{
              height: 28,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: colors.s6,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="labelSm" color={colors.t0} style={{ fontSize: 11.5 }}>
              Resume
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: alpha(colors.t0, 0.1),
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round((done / 7) * 100)}%`,
                height: "100%",
                borderRadius: 2,
                backgroundColor: colors.acc,
              }}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** A centred title, sentence and one action — the Vault's empty and error states. */
function CentredState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: { label: string; onPress: () => void; testID: string };
}): React.ReactElement {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 42,
        paddingBottom: 80,
      }}
    >
      <Text variant="sectionTitle" color={colors.t0} center>
        {title}
      </Text>
      <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
        {body}
      </Text>
      <Button
        label={action.label}
        onPress={action.onPress}
        block={false}
        style={{ marginTop: 22, paddingHorizontal: 22 }}
        testID={action.testID}
      />
    </View>
  );
}
