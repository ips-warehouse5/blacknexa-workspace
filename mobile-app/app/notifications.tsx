/**
 * B3 · Notification centre.
 *
 * From the caption: "One title, one line of description, one timestamp. Unread rows
 * sit on a raised background; read rows recede. **No icons, no counts, no badges.**"
 *
 * That last clause is a real constraint and it is tempting to break: a status icon
 * per row would be easy and would turn a calm list into a dashboard. The only
 * signal is the surface — `s4` for unread, `s1` for read — and the day grouping.
 *
 * The list reads the notifications table, not push history, so it is complete even
 * when a push was never delivered.
 */

import React, { useCallback, useMemo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { Screen, BackHeader } from "@/components/ui/Screen";
import reportsApi, { type NotificationView } from "@/lib/api/reports";

/** "TODAY" / "YESTERDAY" / a date — the grouping the artboard shows. */
function dayLabel(iso: string): string {
  const value = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(value, today)) return "TODAY";
  if (sameDay(value, yesterday)) return "YESTERDAY";
  return value
    .toLocaleDateString(undefined, { day: "numeric", month: "long" })
    .toUpperCase();
}

/** A row's timestamp: a time today, "Yesterday, 6:12 PM" before that. */
function rowTime(iso: string): string {
  const value = new Date(iso);
  const label = dayLabel(iso);
  const time = value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (label === "TODAY") {
    const hours = Math.round((Date.now() - value.getTime()) / 3_600_000);
    return hours < 1 ? "Just now" : `${hours}h ago`;
  }
  if (label === "YESTERDAY") return `Yesterday, ${time}`;
  return `${value.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

type Row = { kind: "header"; label: string } | { kind: "item"; value: NotificationView };

export default function NotificationsScreen(): React.ReactElement {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => reportsApi.notifications(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const unread = query.data?.pages[0]?.unread ?? 0;

  /** Flatten into day-grouped rows so one FlatList renders both. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastLabel: string | null = null;
    for (const value of items) {
      const label = dayLabel(value.createdAt);
      if (label !== lastLabel) {
        out.push({ kind: "header", label });
        lastLabel = label;
      }
      out.push({ kind: "item", value });
    }
    return out;
  }, [items]);

  const markAllRead = useCallback(async () => {
    // Optimistic: the rows recede immediately, and a failure only means they
    // come back on the next fetch.
    queryClient.setQueryData(["notifications"], (old: typeof query.data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          unread: 0,
          items: page.items.map((item) => ({ ...item, read: true })),
        })),
      };
    });
    await reportsApi.markAllRead().catch(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [queryClient]);

  const open = useCallback((value: NotificationView) => {
    // Every notification carries its destination, so a tap lands on the thing.
    if (value.link) router.push(value.link as never);
  }, []);

  return (
    <Screen padding={0} testID="notifications">
      <View style={{ paddingHorizontal: 18 }}>
        <BackHeader
          title="Notifications"
          onBack={() => router.back()}
          padding={0}
          right={
            unread > 0 ? (
              <Pressable onPress={markAllRead} hitSlop={8} accessibilityRole="button">
                <Text variant="labelSm" color={colors.acc}>
                  Mark all read
                </Text>
              </Pressable>
            ) : undefined
          }
        />
      </View>

      {query.isLoading ? (
        <View style={styles.list}>
          {[1, 0.7, 0.45].map((opacity, index) => (
            <View key={index} style={[styles.row, { backgroundColor: colors.s1, opacity }]}>
              <View style={[styles.bar, { width: 180, height: 13 }]} />
              <View style={[styles.bar, { width: "88%", height: 11, marginTop: 9 }]} />
              <View style={[styles.bar, { width: 70, height: 10, marginTop: 11 }]} />
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <View style={styles.centre}>
          <Text variant="sectionTitle" color={colors.t0} center>
            Couldn&rsquo;t load notifications
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9 }}>
            This isn&rsquo;t you.
          </Text>
          <Button
            label="Try again"
            onPress={() => void query.refetch()}
            block={false}
            style={{ marginTop: 20, paddingHorizontal: 22 }}
          />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centre}>
          <Text variant="sectionTitle" color={colors.t0} center>
            Nothing yet
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={styles.emptyBody}>
            We only send four things: your report changing status, someone
            corroborating or replying, a dispatch being ready, and urgent safety
            notices for your area.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, index) =>
            row.kind === "header" ? `h-${row.label}-${index}` : row.value.id
          }
          contentContainerStyle={styles.list}
          renderItem={({ item: row }) =>
            row.kind === "header" ? (
              <Text variant="eyebrow" color={colors.t3} style={styles.dayHeader}>
                {row.label}
              </Text>
            ) : (
              <Pressable
                onPress={() => open(row.value)}
                accessibilityRole="button"
                accessibilityLabel={`${row.value.title}. ${row.value.body ?? ""}`}
                style={({ pressed }) => [
                  styles.row,
                  // The only unread signal: a raised surface. No badge, no icon.
                  { backgroundColor: row.value.read ? colors.s1 : colors.s4 },
                  pressed && { opacity: 0.92 },
                ]}
                testID={`notification-${row.value.id}`}
              >
                <Text
                  variant="labelLg"
                  color={row.value.read ? colors.t1 : colors.t0}
                  numberOfLines={2}
                >
                  {row.value.title}
                </Text>
                {row.value.body ? (
                  <Text
                    variant="bodyXs"
                    color={row.value.read ? colors.t3 : colors.t2}
                    numberOfLines={2}
                    style={{ marginTop: 4, lineHeight: 19 }}
                  >
                    {row.value.body}
                  </Text>
                ) : null}
                <Text variant="metaSm" color={colors.t4} style={{ marginTop: 9 }}>
                  {rowTime(row.value.createdAt)}
                </Text>
              </Pressable>
            )
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: screenPadding.feed, paddingBottom: 32, gap: 9 },
  dayHeader: { paddingTop: 14, paddingBottom: 1, paddingHorizontal: 4, letterSpacing: 1.54 },
  row: { borderRadius: radius.xl, padding: 15 },
  bar: { backgroundColor: colors.s5, borderRadius: 5 },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 42,
    paddingBottom: 60,
  },
  emptyBody: { marginTop: 9, lineHeight: 21 },
});
