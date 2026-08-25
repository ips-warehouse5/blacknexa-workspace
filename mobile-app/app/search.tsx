/**
 * B4 · Search focused, B5 · Results, B6 · Zero result — one screen, three states.
 *
 * They are one screen because they are one activity: the field never unmounts, so
 * the recents view and the results view share a caret and a keyboard.
 *
 * Three captions drive the behaviour:
 *
 *   B4: "Recents are removable one at a time; the category chips give a way in when
 *        nobody knows what to type."
 *   B5: "Every row says which field matched — title, description, area or category
 *        — so a surprising result explains itself."
 *   B6: "Names the likely typo, says filters are involved, and gives one recovery
 *        per cause rather than a shrug."
 *
 * B6 is the one worth care: two causes can produce nothing, and each gets its own
 * recovery rather than a single "clear everything" button.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { TextInput } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { Chip, CategoryDot } from "@/components/ui/Controls";
import reportsApi, {
  CATEGORY_META,
  CATEGORY_ORDER,
  relativeTime,
  type MatchedField,
  type ReportCategory,
  type SearchResultView,
} from "@/lib/api/reports";

const RECENTS_KEY = "bn.search_recents.v1";
const MAX_RECENTS = 8;
/** Long enough that a fast typist does not fire a request per keystroke. */
const DEBOUNCE_MS = 280;

const MATCH_LABEL: Record<MatchedField, string> = {
  title: "MATCHED IN TITLE",
  description: "MATCHED IN DESCRIPTION",
  area: "MATCHED IN AREA",
  category: "MATCHED IN CATEGORY",
};

export default function SearchScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [term, setTerm] = useState("");
  const [committed, setCommitted] = useState("");
  const [category, setCategory] = useState<ReportCategory | undefined>();
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    void AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => setRecents(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => setRecents([]));
  }, []);

  /** Debounce so the list settles rather than flickering per character. */
  useEffect(() => {
    const timer = setTimeout(() => setCommitted(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const persistRecents = useCallback(async (next: string[]) => {
    setRecents(next);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const remember = useCallback(
    (value: string) => {
      const clean = value.trim().toLowerCase();
      if (clean.length < 2) return;
      void persistRecents([clean, ...recents.filter((r) => r !== clean)].slice(0, MAX_RECENTS));
    },
    [persistRecents, recents],
  );

  const search = useQuery({
    queryKey: ["search", committed, category ?? null],
    queryFn: () => reportsApi.search(committed, { category }),
    enabled: committed.length > 0,
  });

  const results = search.data?.items ?? [];
  const suggestion = search.data?.suggestion ?? null;

  /** How many filters are narrowing this — B6 says so explicitly. */
  const activeFilters = useMemo(() => (category ? 1 : 0), [category]);

  const open = useCallback(
    (item: SearchResultView) => {
      remember(committed);
      router.push(`/r/${item.caseRef}`);
    },
    [committed, remember],
  );

  const showRecents = committed.length === 0;
  const showZero = committed.length > 0 && !search.isLoading && results.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* The field, always mounted. */}
      <View style={styles.searchRow}>
        <TextField
          ref={inputRef}
          value={term}
          onChangeText={setTerm}
          placeholder="Search reports"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => remember(term)}
          height={44}
          containerStyle={{ flex: 1 }}
          accessory={
            term.length > 0 ? (
              <Pressable
                onPress={() => setTerm("")}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <ClearGlyph />
              </Pressable>
            ) : undefined
          }
          testID="search-field"
        />
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Text variant="label" color={colors.acc} style={{ fontSize: 13.5 }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      {/* Result count + active filters, above the divider. */}
      {!showRecents ? (
        <View style={styles.summaryRow}>
          <Text variant="metaSm" color={colors.t3}>
            {search.isLoading
              ? "Searching…"
              : `${results.length} match${results.length === 1 ? "" : "es"} for “${committed}”`}
          </Text>
          {activeFilters > 0 ? (
            <Text variant="metaSm" color={colors.t3}>
              {`${activeFilters} filter on`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showRecents ? (
        <View style={styles.body}>
          {recents.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text variant="eyebrow" color={colors.t3} style={{ letterSpacing: 1.54 }}>
                  RECENT
                </Text>
                <Pressable
                  onPress={() => void persistRecents([])}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text variant="metaSm" color={colors.acc}>
                    Clear
                  </Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 6 }}>
                {recents.map((entry) => (
                  <View key={entry} style={styles.recentRow}>
                    <Pressable
                      onPress={() => setTerm(entry)}
                      style={styles.recentMain}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${entry}`}
                    >
                      <ClockGlyph />
                      <Text variant="body" color={colors.t1} style={{ flex: 1 }}>
                        {entry}
                      </Text>
                    </Pressable>
                    {/* Removable one at a time, per B4. */}
                    <Pressable
                      onPress={() => void persistRecents(recents.filter((r) => r !== entry))}
                      hitSlop={11}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${entry} from recent searches`}
                    >
                      <ClearGlyph small />
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* A way in when nobody knows what to type. */}
          <Text variant="eyebrow" color={colors.t3} style={styles.browseLabel}>
            BROWSE BY CATEGORY
          </Text>
          <View style={styles.chipWrap}>
            {CATEGORY_ORDER.map((value) => (
              <Chip
                key={value}
                label={CATEGORY_META[value].label}
                dotColor={colors[CATEGORY_META[value].token]}
                selected={category === value}
                onPress={() => {
                  setCategory(category === value ? undefined : value);
                  // A category alone is a search: commit it so results appear.
                  if (category !== value) setTerm(CATEGORY_META[value].label.toLowerCase());
                }}
                testID={`browse-${value}`}
              />
            ))}
          </View>
        </View>
      ) : showZero ? (
        /* B6 — one recovery per cause. */
        <View style={styles.centre}>
          <View style={styles.mark}>
            <View style={styles.markRing} />
          </View>
          <Text variant="sectionTitle" color={colors.t0} center style={{ marginTop: 20 }}>
            {`Nothing matched “${committed}”`}
          </Text>
          <Text variant="bodySm" color={colors.t2} center style={{ marginTop: 9, lineHeight: 21 }}>
            {suggestion ? (
              <>
                Did you mean{" "}
                <Text variant="label" color={colors.acc}>
                  {suggestion}
                </Text>
                ?
              </>
            ) : (
              "Try fewer words, or a place name."
            )}
            {activeFilters > 0 ? " A filter is also narrowing this." : ""}
          </Text>

          {suggestion ? (
            <Button
              label={`Search “${suggestion}” everywhere`}
              onPress={() => {
                setCategory(undefined);
                setTerm(suggestion);
              }}
              block={false}
              style={{ marginTop: 22, paddingHorizontal: 20 }}
              testID="use-suggestion"
            />
          ) : null}

          {activeFilters > 0 ? (
            <Button
              label="Clear the filter"
              variant="quiet"
              height={44}
              onPress={() => setCategory(undefined)}
              block={false}
              style={{ marginTop: 10, paddingHorizontal: 18 }}
              testID="clear-search-filter"
            />
          ) : null}
        </View>
      ) : (
        /* B5 — every row names the field that matched. */
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${MATCH_LABEL[item.matchedIn].toLowerCase()}`}
              style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.9 }]}
              testID={`result-${item.caseRef}`}
            >
              <View style={styles.thumb}>
                {item.leadMedia?.thumbUrl ? null : <View style={styles.thumbFill} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="cardTitleSm" color={colors.t0} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.resultMeta}>
                  <CategoryDot color={colors[CATEGORY_META[item.category].token]} size={6} />
                  <Text variant="metaSm" color={colors.t4} numberOfLines={1}>
                    {[
                      CATEGORY_META[item.category].label,
                      item.areaLabel,
                      relativeTime(item.filedAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {/*
                  `t3` rather than the artboard's `t5`: at 10.5px this is the only
                  thing telling the reader why a surprising row is here, and `t5`
                  on white is about 1.8:1 — below any readable threshold.
                */}
                <Text variant="eyebrow" color={colors.t3} style={styles.matchLabel}>
                  {MATCH_LABEL[item.matchedIn]}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ClearGlyph({ small }: { small?: boolean }): React.ReactElement {
  const size = small ? 14 : 15;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[styles.clearBar, { width: size - 4, transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.clearBar, { width: size - 4, transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

function ClockGlyph(): React.ReactElement {
  return (
    <View style={styles.clock}>
      <View style={styles.clockRing} />
      <View style={styles.clockHand} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: screenPadding.feed,
    paddingTop: 2,
    paddingBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.07),
  },

  body: { flex: 1, paddingHorizontal: 18 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  recentMain: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  browseLabel: { marginTop: 20, letterSpacing: 1.54 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },

  resultsList: { paddingHorizontal: 18, paddingBottom: 32 },
  resultRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.t0, 0.06),
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 12,
    backgroundColor: colors.s5,
    overflow: "hidden",
  },
  thumbFill: { width: "100%", height: "100%", backgroundColor: colors.ph },
  resultMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  matchLabel: { marginTop: 7, fontSize: 10.5, letterSpacing: 0.84 },

  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 42,
    paddingBottom: 60,
  },
  mark: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: colors.s3,
    alignItems: "center",
    justifyContent: "center",
  },
  markRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.7,
    borderColor: colors.t3,
  },

  clearBar: { position: "absolute", height: 1.7, borderRadius: 1, backgroundColor: colors.t4 },
  clock: { width: 17, height: 17, alignItems: "center", justifyContent: "center" },
  clockRing: {
    position: "absolute",
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.6,
    borderColor: colors.t4,
  },
  clockHand: {
    position: "absolute",
    width: 1.6,
    height: 5,
    backgroundColor: colors.t4,
    top: 3.5,
  },
});
