/**
 * B1 · Home — the community feed.
 *
 * From the caption: "The filter bar is pinned under the header and never scrolls
 * away. Filters and the sort chip hold fixed positions; only the category rail
 * between them scrolls, fading at its right edge so it reads as more-to-come
 * rather than a clipped word."
 *
 * Three parts of that are load-bearing:
 *
 *   • **Pinned, not sticky-on-scroll.** The bar sits outside the list, so it never
 *     animates in or out. Someone filtering a long feed does not lose the control
 *     they are using.
 *
 *   • **Only the rail scrolls.** Filters (left) and the sort chip (right) are
 *     fixed; the category rail is the one horizontally scrolling region, with a
 *     mask fade at its right edge.
 *
 *   • **Counts are live.** Every chip carries a count computed under the *other*
 *     active filters, so tapping one never lands on an empty result by surprise.
 *
 * The card is treatment 1a — see `components/report/FeedCard.tsx`.
 */

import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { alpha, colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { Chip } from "@/components/ui/Controls";
import FeedCard, { CARD_GAP, cardHeight } from "@/components/report/FeedCard";
import { FeedSkeleton, FeedEmpty, FeedError } from "@/components/report/FeedStates";
import FiltersSheet from "@/components/sheets/FiltersSheet";
import SortSheet from "@/components/sheets/SortSheet";
import { useAuth } from "@/providers/AuthProvider";
import reportsApi, {
  CATEGORY_META,
  type FeedCardView,
  type FeedQuery,
  type ReportCategory,
} from "@/lib/api/reports";

const SORT_LABEL: Record<NonNullable<FeedQuery["sort"]>, string> = {
  newest: "Newest",
  supported: "Most supported",
  corroborated: "Most corroborated",
};

const SORT_SENTENCE: Record<NonNullable<FeedQuery["sort"]>, string> = {
  newest: "Newest first",
  supported: "Most supported",
  corroborated: "Most corroborated",
};

export default function FeedScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<FeedQuery>({ sort: "newest", when: "all" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  /** Everything except pagination — the key both queries share. */
  const filterKey = useMemo(
    () => [
      filters.category ?? null,
      filters.when ?? "all",
      filters.verifiedOnly ?? false,
      filters.urgentOnly ?? false,
      filters.sort ?? "newest",
    ],
    [filters],
  );

  const feed = useInfiniteQuery({
    queryKey: ["feed", ...filterKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => reportsApi.feed({ ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  /**
   * Facets run in parallel with the page, not after it.
   *
   * The chips must show their counts on first paint; waiting for the rows would
   * leave the bar numberless for a beat, which is exactly the "empty result by
   * surprise" the design is guarding against.
   */
  const facets = useQuery({
    queryKey: ["feed-facets", ...filterKey],
    queryFn: () => reportsApi.facets(filters),
  });

  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.category) count += 1;
    if (filters.when && filters.when !== "all") count += 1;
    if (filters.verifiedOnly) count += 1;
    if (filters.urgentOnly) count += 1;
    return count;
  }, [filters]);

  /** The result line under the bar: "17 reports · Policing · Newest first". */
  const resultLine = useMemo(() => {
    const total = facets.data?.total ?? items.length;
    const parts = [`${total} report${total === 1 ? "" : "s"}`];
    if (filters.category) parts.push(CATEGORY_META[filters.category].label);
    parts.push(SORT_SENTENCE[filters.sort ?? "newest"]);
    return parts.join(" · ");
  }, [facets.data?.total, filters.category, filters.sort, items.length]);

  const toggleCategory = useCallback((category: ReportCategory) => {
    setFilters((current) => ({
      ...current,
      // Tapping the active chip clears it — the rail is a toggle, not a radio.
      category: current.category === category ? undefined : category,
    }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({ sort: filters.sort, when: "all" });
  }, [filters.sort]);

  /**
   * Stand with, applied optimistically.
   *
   * A tap that waits on a round trip feels broken, and the only cost of being
   * wrong is a count that corrects itself on the next refetch.
   */
  const toggleSupport = useCallback(
    async (item: FeedCardView) => {
      const key = ["feed", ...filterKey];
      queryClient.setQueryData(key, (old: typeof feed.data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    standingWith: !row.standingWith,
                    supportCount: row.supportCount + (row.standingWith ? -1 : 1),
                  }
                : row,
            ),
          })),
        };
      });

      try {
        await reportsApi.toggleSupport(item.id);
      } catch {
        // Put it back rather than leaving a number the server disagrees with.
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [filterKey, queryClient],
  );

  const openReport = useCallback((item: FeedCardView) => {
    router.push(`/r/${item.caseRef}`);
  }, []);

  const categoryChips = facets.data?.categories ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header: avatar / brand / search + bell. */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          style={styles.avatar}
          testID="feed-avatar"
        >
          <Text variant="labelSm" color={colors.acc}>
            {user?.initials ?? "?"}
          </Text>
        </Pressable>

        <Text variant="cardTitle" color={colors.t0} style={{ fontSize: 18 }}>
          BlackNexa
        </Text>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/search")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Search reports"
            testID="feed-search"
          >
            <SearchGlyph />
          </Pressable>
          <Pressable
            onPress={() => router.push("/notifications")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            testID="feed-notifications"
          >
            <BellGlyph withDot />
          </Pressable>
        </View>
      </View>

      {/* The pinned filter bar. Outside the list, so it never scrolls away. */}
      <View style={styles.filterBar}>
        <View style={styles.filterRow}>
          <Chip
            label="Filters"
            count={activeFilterCount > 0 ? activeFilterCount : undefined}
            selected={activeFilterCount > 0}
            onPress={() => setFiltersOpen(true)}
            testID="open-filters"
          />

          {/* The one horizontally scrolling region, faded at its right edge. */}
          <MaskedView
            style={styles.rail}
            maskElement={
              <LinearGradient
                colors={["#000", "#000", "transparent"]}
                locations={[0, 0.92, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={categoryChips}
              keyExtractor={(entry) => entry.category}
              contentContainerStyle={styles.railContent}
              renderItem={({ item: entry }) => (
                <Chip
                  label={CATEGORY_META[entry.category].label}
                  count={entry.count}
                  dotColor={colors[CATEGORY_META[entry.category].token]}
                  selected={filters.category === entry.category}
                  onPress={() => toggleCategory(entry.category)}
                  testID={`filter-${entry.category}`}
                />
              )}
            />
          </MaskedView>

          <Chip
            label={SORT_LABEL[filters.sort ?? "newest"] === "Newest" ? "Newest" : "Sorted"}
            selected={false}
            onPress={() => setSortOpen(true)}
            testID="open-sort"
          />
        </View>

        <View style={styles.resultRow}>
          <Text variant="metaSm" color={colors.t3}>
            {resultLine}
          </Text>
          {activeFilterCount > 0 ? (
            <Pressable onPress={clearAll} hitSlop={8} accessibilityRole="button">
              <Text variant="metaSm" color={colors.acc}>
                Clear all
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {feed.isLoading ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <FeedError onRetry={() => void feed.refetch()} />
      ) : items.length === 0 ? (
        <FeedEmpty
          filtered={activeFilterCount > 0}
          onClear={clearAll}
          onFile={() => router.push("/report")}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
          renderItem={({ item }) => (
            <FeedCard item={item} onPress={openReport} onToggleSupport={toggleSupport} />
          )}
          // Both card variants are fixed-height, which is what makes this
          // possible — and what keeps scroll restoration smooth on a long feed.
          getItemLayout={(data, index) => {
            const rows = data ?? [];
            let offset = 0;
            for (let i = 0; i < index; i += 1) offset += cardHeight(rows[i]) + CARD_GAP;
            return { length: cardHeight(rows[index]), offset, index };
          }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching && !feed.isFetchingNextPage}
              onRefresh={() => {
                void feed.refetch();
                void facets.refetch();
              }}
              tintColor={colors.acc}
            />
          }
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <Text variant="metaSm" color={colors.t4} center style={{ paddingVertical: 18 }}>
                Loading more…
              </Text>
            ) : null
          }
        />
      )}

      <FiltersSheet
        visible={filtersOpen}
        filters={filters}
        facets={facets.data}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
        onClose={() => setFiltersOpen(false)}
      />

      <SortSheet
        visible={sortOpen}
        sort={filters.sort ?? "newest"}
        onSelect={(sort) => {
          setFilters((current) => ({ ...current, sort }));
          setSortOpen(false);
        }}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}

function SearchGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={styles.searchRing} />
      <View style={styles.searchHandle} />
    </View>
  );
}

function BellGlyph({ withDot }: { withDot?: boolean }): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={styles.bellDome} />
      <View style={styles.bellBar} />
      <View style={styles.bellClapper} />
      {withDot ? <View style={styles.bellDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.s6,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },

  filterBar: {
    backgroundColor: colors.s0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.07),
    paddingBottom: 9,
  },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 16 },
  rail: { flex: 1, minWidth: 0, height: 34 },
  railContent: { gap: 7, paddingRight: 18 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 9,
  },

  listContent: {
    paddingHorizontal: screenPadding.feed,
    paddingTop: 12,
    paddingBottom: 24,
  },

  glyph: { width: 21, height: 21, alignItems: "center", justifyContent: "center" },
  searchRing: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.7,
    borderColor: colors.t1,
  },
  searchHandle: {
    position: "absolute",
    right: 2,
    bottom: 3,
    width: 6,
    height: 1.7,
    borderRadius: 1,
    backgroundColor: colors.t1,
    transform: [{ rotate: "45deg" }],
  },
  bellDome: {
    width: 13,
    height: 11,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 1.7,
    borderBottomWidth: 0,
    borderColor: colors.t1,
    marginTop: 1,
  },
  bellBar: { width: 17, height: 1.7, backgroundColor: colors.t1 },
  bellClapper: {
    width: 5,
    height: 2.5,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderColor: colors.t1,
    marginTop: 1,
  },
  bellDot: {
    position: "absolute",
    top: 0,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.acc,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
