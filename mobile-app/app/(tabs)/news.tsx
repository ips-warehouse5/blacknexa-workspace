import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { BookOpen, Link2, Loader2, LocateFixed, MapPin, MessageCircle, Navigation, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import NewsCard from "@/components/NewsCard";
import CivilRightsPremiumBanner from "@/components/CivilRightsPremiumBanner";
import VoiceInputButton from "@/components/VoiceInputButton";
import WeatherWidget from "@/components/WeatherWidget";
import LiveChatSheet from "@/components/LiveChatSheet";
import SafetyBeaconButton from "@/components/SafetyBeaconButton";
import {
  CATEGORY_LABELS,
  NEWS_CATEGORIES,
  formatNewsRelative,
  type NewsArticle,
  type NewsCategory,
  type NewsScope,
} from "@/mocks/news";
import { useNews, type GenerateNewsResult } from "@/providers/NewsProvider";
import { useLocation } from "@/providers/LocationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { fontFamily, fontFamilySpectral } from "@/constants/theme";

type FilterKey = "all" | NewsCategory;

type LocalNewsBlockProps = {
  location: { label: string; city: string; region: string; country: string } | null;
  locationStatus: "idle" | "requesting" | "granted" | "denied" | "unavailable";
  localFeed: NewsArticle[];
  isLocalLoading: boolean;
  isLocalRefetching: boolean;
  nearbyEnabled: boolean;
  nearbyCount: number;
  onRequestLocation: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
  onRefreshLocal: () => void;
  onToggleNearby: () => void;
  onOpenArticle: (id: string) => void;
};

function LocalNewsBlock({
  location,
  locationStatus,
  localFeed,
  isLocalLoading,
  isLocalRefetching,
  nearbyEnabled,
  nearbyCount,
  onRequestLocation,
  onOpenSettings,
  onRefreshLocal,
  onToggleNearby,
  onOpenArticle,
}: LocalNewsBlockProps): React.ReactElement | null {
  const placeLabel = location?.label || "your area";

  const handleToggleNearby = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onToggleNearby();
  }, [onToggleNearby]);

  const handleEnable = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    void onRequestLocation();
  }, [onRequestLocation]);

  const handleOpenSettings = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    void onOpenSettings();
  }, [onOpenSettings]);

  const handleRefresh = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onRefreshLocal();
  }, [onRefreshLocal]);

  // Idle + no location: show GPS prompt only (no manual text input).
  if (locationStatus === "idle" || locationStatus === "denied" || locationStatus === "unavailable") {
    const isDenied = locationStatus === "denied";
    return (
      <View style={styles.localPromptBlock}>
        <View style={styles.localPromptIconRow}>
          <View style={styles.localPromptIcon}>
            <MapPin size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.localPromptTitle}>Local BlackNexa News</Text>
            <Text style={styles.localPromptSubtitle}>
              Enable location to automatically see verified briefings from your area.
            </Text>
          </View>
        </View>
        <View style={styles.locationOptionsRow}>
          <Pressable onPress={handleEnable} style={styles.locationOption}>
            <LocateFixed size={13} color={Colors.gold} />
            <Text style={styles.locationOptionText}>Use my location</Text>
          </Pressable>
          {isDenied ? (
            <Pressable onPress={handleOpenSettings} style={styles.locationOption}>
              <Text style={styles.locationOptionText}>Open Settings</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // Requesting: show a loading state.
  if (locationStatus === "requesting" || (isLocalLoading && localFeed.length === 0)) {
    return (
      <View style={styles.localPromptBlock}>
        <View style={styles.localPromptIconRow}>
          <View style={styles.localPromptIcon}>
            <ActivityIndicator size="small" color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.localPromptTitle}>Finding local briefings…</Text>
            <Text style={styles.localPromptSubtitle}>
              Pinpointing your area to surface nearby BlackNexa News.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Granted but no local articles yet.
  if (localFeed.length === 0) {
    return (
      <View style={styles.localPromptBlock}>
        <View style={styles.localPromptIconRow}>
          <View style={styles.localPromptIcon}>
            <MapPin size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.localPromptTitle}>Local BlackNexa News · {placeLabel}</Text>
            <Text style={styles.localPromptSubtitle}>
              {"No local briefings yet for your area. We're generating one now — pull to refresh in a moment."}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleRefresh}
          style={({ pressed }) => [
            styles.localPromptBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.localPromptBtnText}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  // Granted with articles: show the local feed carousel.
  const nearbyLabel = nearbyEnabled
    ? nearbyCount > 0
      ? `Nearby · ${nearbyCount} adjacent`
      : "Nearby · on"
    : "Include nearby";
  return (
    <View style={styles.briefingsBlock}>
      <View style={styles.localHeaderRow}>
        <View style={styles.localHeaderLeft}>
          <MapPin size={13} color={Colors.gold} />
          <Text style={styles.briefingsTitle}>BlackNexa News · Local · {placeLabel}</Text>
        </View>
        {isLocalRefetching ? (
          <ActivityIndicator size="small" color={Colors.gold} />
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.briefingsRow}
      >
        {localFeed.map((b) => {
          const isNearby = b.nearby === true;
          return (
            <Pressable
              key={`local-${b.id}`}
              onPress={() => onOpenArticle(b.id)}
              style={({ pressed }) => [
                styles.briefingCard,
                isNearby && styles.briefingCardNearby,
                pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
              ]}
            >
              <View style={styles.briefingTagRow}>
                <Text style={styles.briefingCategory}>
                  {CATEGORY_LABELS[b.category]}
                </Text>
                {isNearby ? (
                  <View style={styles.nearbyTag}>
                    <Navigation size={9} color={Colors.gold} />
                    <Text style={styles.nearbyTagText}>NEARBY</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.briefingHeadline} numberOfLines={3}>
                {b.headline}
              </Text>
              <Text style={styles.briefingTime}>
                {formatNewsRelative(b.publishedAt)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={handleToggleNearby}
        style={({ pressed }) => [
          styles.nearbyToggle,
          nearbyEnabled && styles.nearbyToggleActive,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Navigation size={13} color={nearbyEnabled ? Colors.background : Colors.gold} />
        <Text style={[styles.nearbyToggleText, nearbyEnabled && styles.nearbyToggleTextActive]}>
          {nearbyLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  ...NEWS_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

const SCOPES: { key: NewsScope; label: string }[] = [
  { key: "local", label: "Local" },
  { key: "national", label: "National" },
  { key: "global", label: "Global" },
];

export default function NewsScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { feed, briefings, isLoading, isRefetching, refetch, generate, isGenerating, generateError, searchResults, runSearch, isSearching } = useNews();
  const {
    location,
    status: locationStatus,
    requestLocation,
    openSettings,
    localFeed,
    nearbyEnabled,
    toggleNearby,
    isLocalLoading,
    isLocalRefetching,
    refetchLocal,
  } = useLocation();
  const { settings } = useSettings();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [scope, setScope] = useState<NewsScope | "all">("all");
  const [query, setQuery] = useState<string>("");
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [genOpen, setGenOpen] = useState<boolean>(false);
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [topic, setTopic] = useState<string>("");
  const [genCategory, setGenCategory] = useState<NewsCategory>("business-wealth-stewardship");
  const [genScope, setGenScope] = useState<NewsScope>("national");
  const [genStep, setGenStep] = useState<number>(0);
  const [genSlow, setGenSlow] = useState<boolean>(false);
  const [sourceUrls, setSourceUrls] = useState<string[]>(["", "", ""]);
  const [sourceValidationError, setSourceValidationError] = useState<string | null>(null);

  const GENERATION_STEPS = useMemo(
    () => [
      { label: "Searching the live web…", detail: "Pulling current sources" },
      { label: "Synthesizing verified facts…", detail: "Building the briefing" },
      { label: "Publishing to BlackNexa…", detail: "Almost ready" },
    ],
    []
  );

  // Drive the backend search engine with a debounce so we don't hammer
  // the Worker on every keystroke.
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      runSearch(query);
    }, 350);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, runSearch]);

  const filtered = useMemo(() => {
    let list = query.trim() ? searchResults : feed;
    if (filter !== "all") list = list.filter((a) => a.category === filter);
    if (scope !== "all") list = list.filter((a) => a.scope === scope);
    return list;
  }, [feed, filter, scope, query, searchResults]);

  const openArticle = useCallback((id: string) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push(`/news/${id}`);
  }, []);

  const openGenerate = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setGenOpen(true);
  }, []);

  const handleLocationRefresh = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (locationStatus === "granted" && location) {
      refetchLocal();
    } else {
      void requestLocation();
    }
  }, [locationStatus, location, refetchLocal, requestLocation]);

  const submitGenerate = useCallback(() => {
    if (!topic.trim()) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setGenStep(0);
    setGenSlow(false);
    // Validate source URLs — when 3+ are provided, the enterprise
    // verified-story endpoint is used (strict 3-5 source rule).
    const validUrls = sourceUrls.map((u) => u.trim()).filter((u) => u.length > 0);
    const uniqueUrls = [...new Set(validUrls)];
    if (uniqueUrls.length > 0 && uniqueUrls.length < 3) {
      setSourceValidationError("At least 3 independent source URLs are required to publish a verified story. Add more or leave blank for AI generation.");
      return;
    }
    if (uniqueUrls.length > 10) {
      setSourceValidationError("Maximum 10 source URLs allowed.");
      return;
    }
    // Basic URL format check
    for (const u of uniqueUrls) {
      try {
        new URL(u);
      } catch {
        setSourceValidationError(`"${u}" is not a valid URL. Include the full https:// link.`);
        return;
      }
    }
    setSourceValidationError(null);

    generate(
      {
        topicPrompt: topic.trim(),
        category: genCategory,
        scope: genScope,
        verifiedSourceUrls: uniqueUrls.length >= 3 ? uniqueUrls : undefined,
        language: settings.preferredLanguage,
      },
      {
        onSuccess: (result: GenerateNewsResult) => {
          const created = result.article;
          setGenOpen(false);
          setTopic("");
          setGenStep(0);
          setGenSlow(false);
          if (created) {
            Alert.alert(
              "Briefing generated",
              result.translation
                ? "A new fact-verified briefing has been added to the feed — already translated into your language."
                : "A new fact-verified briefing has been added to the top of the feed.",
              [
                { text: "Stay here" },
                {
                  text: "Read now",
                  onPress: () => router.push(`/news/${created.id}`),
                },
              ]
            );
          }
        },
        onError: (e: unknown) => {
          setGenStep(0);
          setGenSlow(false);
          Alert.alert(
            "Generation failed",
            e instanceof Error ? e.message : "The AI engine could not produce a briefing. Please try again."
          );
        },
      }
    );
  }, [topic, genCategory, genScope, sourceUrls, generate, settings.preferredLanguage]);

  // Cycle through progress steps while generation is running, and flag when it
  // is slower than the backend's fast-path target so the user knows to wait.
  useEffect(() => {
    if (!isGenerating) {
      setGenStep(0);
      setGenSlow(false);
      return;
    }
    setGenStep(0);
    const stepInterval = setInterval(() => {
      setGenStep((s) => (s + 1) % GENERATION_STEPS.length);
    }, 1500);
    const slowTimeout = setTimeout(() => {
      setGenSlow(true);
    }, 6000);
    return () => {
      clearInterval(stepInterval);
      clearTimeout(slowTimeout);
    };
  }, [isGenerating, GENERATION_STEPS.length]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.surface, Colors.background]}
        style={[styles.headerBg, { paddingTop: insets.top }]}
      >
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <BookOpen size={16} color={Colors.background} />
            </View>
            <View>
              <View style={styles.brandLine}>
                <Text style={styles.brand}>BlackNexa</Text>
 <Text style={styles.tm}>TM</Text>
              </View>
              <Text style={styles.brandSub}>Truth · Stewardship · Dignity</Text>
            </View>
          </View>
          <Pressable
            style={styles.iconBtn}
            testID="news-generate"
            onPress={openGenerate}
          >
            <Sparkles size={18} color={Colors.gold} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search verified briefings"
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
            testID="news-search"
            returnKeyType="search"
            autoCorrect={false}
            autoComplete="off"
            autoCapitalize="none"
          />
          {isSearching ? (
            <ActivityIndicator size="small" color={Colors.gold} />
          ) : null}
        </View>

        <Pressable
          onPress={handleLocationRefresh}
          style={({ pressed }) => [
            styles.locationChip,
            pressed && { opacity: 0.8 },
          ]}
        >
          {locationStatus === "requesting" || isLocalRefetching ? (
            <ActivityIndicator size="small" color={Colors.gold} />
          ) : (
            <MapPin size={12} color={Colors.gold} />
          )}
          <Text style={styles.locationChipText} numberOfLines={1}>
            {location?.label ?? "Set location"}
          </Text>
          <RefreshCw size={11} color={Colors.textSecondary} />
        </Pressable>
      </LinearGradient>

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
        initialNumToRender={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        refreshing={isRefetching}
        onRefresh={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          refetch();
        }}
        progressViewOffset={insets.top + 60}
        ListHeaderComponent={
          <View>
            {briefings.length > 0 && (
              <View style={styles.briefingsBlock}>
                <Text style={styles.briefingsTitle}>BlackNexa News · Daily Briefings</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.briefingsRow}
                >
                  {briefings.map((b) => (
                    <Pressable
                      key={`briefing-${b.id}`}
                      onPress={() => openArticle(b.id)}
                      style={({ pressed }) => [
                        styles.briefingCard,
                        pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
                      ]}
                    >
                      <Text style={styles.briefingCategory}>
                        {CATEGORY_LABELS[b.category]}
                      </Text>
                      <Text style={styles.briefingHeadline} numberOfLines={3}>
                        {b.headline}
                      </Text>
                      <Text style={styles.briefingTime}>
                        {formatNewsRelative(b.publishedAt)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <WeatherWidget />

            <LocalNewsBlock
              location={location}
              locationStatus={locationStatus}
              localFeed={localFeed}
              isLocalLoading={isLocalLoading}
              isLocalRefetching={isLocalRefetching}
              nearbyEnabled={nearbyEnabled}
              nearbyCount={localFeed.filter((a) => a.nearby === true).length}
              onRequestLocation={requestLocation}
              onOpenSettings={openSettings}
              onRefreshLocal={refetchLocal}
              onToggleNearby={toggleNearby}
              onOpenArticle={openArticle}
            />

            <CivilRightsPremiumBanner />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setFilter(item.key)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    testID={`news-filter-${item.key}`}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scopeRow}
            >
              <Pressable
                onPress={() => setScope("all")}
                style={[styles.scopeChip, scope === "all" && styles.scopeChipActive]}
              >
                <Text style={[styles.scopeText, scope === "all" && styles.scopeTextActive]}>
                  All scopes
                </Text>
              </Pressable>
              {SCOPES.map((s) => {
                const active = scope === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setScope(s.key)}
                    style={[styles.scopeChip, active && styles.scopeChipActive]}
                  >
                    <Text style={[styles.scopeText, active && styles.scopeTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>BlackNexa News · Verified Feed</Text>
              <Text style={styles.sectionCount}>
                {filtered.length} {filtered.length === 1 ? "briefing" : "briefings"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <NewsCard article={item} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={Colors.gold} />
              <Text style={styles.emptyText}>Loading verified briefings…</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No briefings match</Text>
              <Text style={styles.emptyText}>
                Try a different category or generate a new briefing with the AI engine.
              </Text>
            </View>
          )
        }
      />

      <View style={[styles.fabRow, { bottom: 100 + insets.bottom }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setChatOpen(true);
          }}
          style={styles.chatFab}
          testID="news-chat-fab"
        >
          <MessageCircle size={20} color={Colors.gold} />
        </Pressable>
        <Pressable
          onPress={openGenerate}
          style={styles.fab}
          testID="news-fab"
        >
          <LinearGradient
            colors={[Colors.gold, Colors.goldDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Plus size={22} color={Colors.background} strokeWidth={3} />
            <Text style={styles.fabText}>Generate</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <SafetyBeaconButton />

      <Modal
        visible={genOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGenOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setGenOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Sparkles size={18} color={Colors.gold} />
                <Text style={styles.modalTitle}>BlackNexa News AI Engine</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setGenOpen(false)}>
                <X size={18} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Topic or prompt</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Recent federal grants for Black-owned clean tech firms"
              placeholderTextColor={Colors.textMuted}
              multiline
              style={styles.topicInput}
              testID="news-gen-topic"
              autoCorrect={false}
              autoComplete="off"
              autoCapitalize="sentences"
              returnKeyType="default"
              blurOnSubmit={true}
              spellCheck={false}
              keyboardType="default"
            />
            <VoiceInputButton
              prominent
              placeholder="Tap to dictate your briefing topic"
              onTranscript={(text) => setTopic((prev) => (prev ? `${prev} ${text}` : text))}
            />
            <Text style={styles.voiceHint}>
              Use the BlackNexa mic above. The keyboard mic uses Apple Dictation, which is not connected to our AI engine.
            </Text>

            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {NEWS_CATEGORIES.map((c) => {
                const active = genCategory === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setGenCategory(c.key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>Scope</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {SCOPES.map((s) => {
                const active = genScope === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setGenScope(s.key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>Verified Source URLs (3-5 required for verified publishing)</Text>
            <Text style={styles.sourceHint}>
              Add 3+ independent source links to publish a verified briefing. Leave blank for AI-generated briefings with automatic source discovery.
            </Text>
            {sourceUrls.map((url, idx) => (
              <View key={`src-${idx}`} style={styles.sourceInputRow}>
                <View style={styles.sourceInputBadge}>
                  <Text style={styles.sourceInputBadgeText}>{idx + 1}</Text>
                </View>
                <TextInput
                  value={url}
                  onChangeText={(text) => {
                    setSourceUrls((prev) => prev.map((u, i) => (i === idx ? text : u)));
                    setSourceValidationError(null);
                  }}
                  placeholder={`https://example.com/source-${idx + 1}`}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.sourceInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  keyboardType="url"
                  returnKeyType="done"
                />
                {sourceUrls.length > 3 && idx >= 3 ? (
                  <Pressable
                    onPress={() => {
                      setSourceUrls((prev) => prev.filter((_, i) => i !== idx));
                      setSourceValidationError(null);
                    }}
                    style={styles.sourceRemoveBtn}
                  >
                    <X size={14} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {sourceUrls.length < 10 ? (
              <Pressable
                onPress={() => setSourceUrls((prev) => [...prev, ""])}
                style={styles.sourceAddBtn}
              >
                <Link2 size={13} color={Colors.gold} />
                <Text style={styles.sourceAddBtnText}>Add another source</Text>
              </Pressable>
            ) : null}
            {sourceValidationError ? (
              <Text style={styles.errorText}>{sourceValidationError}</Text>
            ) : null}

            <Text style={styles.disclaimer}>
              All generated briefings follow strict factual and godly alignment rules. Sources are cited and marked fact-verified.
            </Text>

            {isGenerating ? (
              <View style={styles.progressBlock}>
                <View style={styles.progressRow}>
                  <ActivityIndicator size="small" color={Colors.gold} />
                  <Text style={styles.progressLabel}>
                    {GENERATION_STEPS[genStep].label}
                  </Text>
                </View>
                <Text style={styles.progressDetail}>
                  {GENERATION_STEPS[genStep].detail}
                </Text>
                {genSlow ? (
                  <Text style={styles.progressSlow}>
                    Still gathering sources — please keep the app open.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {generateError ? (
              <Text style={styles.errorText}>
                {generateError instanceof Error ? generateError.message : "Generation failed."}
              </Text>
            ) : null}

            <Pressable
              onPress={submitGenerate}
              disabled={isGenerating || !topic.trim()}
              style={[styles.genButton, (isGenerating || !topic.trim()) && styles.genButtonDisabled]}
              testID="news-gen-submit"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} color={Colors.background} />
                  <Text style={styles.genButtonText}>Generating…</Text>
                </>
              ) : (
                <>
                  <Sparkles size={18} color={Colors.background} />
                  <Text style={styles.genButtonText}>Generate Briefing</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <LiveChatSheet visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  headerBg: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    marginBottom: 14,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  brandLine: { flexDirection: "row", alignItems: "flex-start", gap: 3 },
  brand: {
    fontSize: 20,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  tm: { fontSize: 9, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.gold, marginTop: 2 },
  brandSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "44",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500", fontFamily: fontFamily.medium,
    padding: 0,
  },
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "33",
  },
  locationChipText: {
    fontSize: 12,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    color: Colors.gold,
    maxWidth: 220,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  briefingsBlock: { marginBottom: 8, marginTop: 4 },
  briefingsTitle: {
    fontSize: 13,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  localHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  localHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  localPromptBlock: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "33",
  },
  localPromptIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  localPromptIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "44",
  },
  localPromptTitle: {
    fontSize: 15,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.text,
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  localPromptSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  localPromptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
  },
  localPromptBtnText: {
    fontSize: 13,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.background,
    letterSpacing: 0.3,
  },
  locationOptionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  locationOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  locationOptionText: {
    fontSize: 12,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
    color: Colors.gold,
  },
  briefingsRow: { gap: 12, paddingRight: 12 },
  briefingCard: {
    width: 230,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  briefingCardNearby: {
    borderColor: Colors.gold + "55",
    backgroundColor: Colors.surface3,
  },
  briefingTagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  nearbyTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.gold + "1A",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nearbyTagText: {
    fontSize: 8,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.6,
  },
  nearbyToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  nearbyToggleActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  nearbyToggleText: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  nearbyToggleTextActive: {
    color: Colors.background,
  },
  briefingCategory: {
    fontSize: 10,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  briefingHeadline: {
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamilySpectral.bold,
    color: Colors.text,
    lineHeight: 19,
    marginBottom: 10,
  },
  briefingTime: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
  filterRow: { gap: 8, paddingVertical: 12, paddingRight: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterText: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", fontFamily: fontFamily.semiBold },
  filterTextActive: { color: Colors.background, fontWeight: "700", fontFamily: fontFamily.bold },
  scopeRow: { gap: 8, paddingRight: 12, marginBottom: 6 },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scopeChipActive: { backgroundColor: Colors.surface3, borderColor: Colors.gold + "66" },
  scopeText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", fontFamily: fontFamily.semiBold },
  scopeTextActive: { color: Colors.gold, fontWeight: "700", fontFamily: fontFamily.bold },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700", fontFamily: fontFamilySpectral.bold,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  sectionCount: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", fontFamily: fontFamily.semiBold },
  empty: { paddingVertical: 60, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  fab: {
    position: "absolute",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  fabRow: {
    position: "absolute",
    right: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  chatFab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    shadowColor: Colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  fabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
  },
  fabText: {
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.background,
    letterSpacing: 0.3,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 6,
  },
  topicInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500", fontFamily: fontFamily.medium,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  voiceHint: {
    flex: 1,
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "500", fontFamily: fontFamily.medium,
    textAlign: "right",
  },
  chipRow: { gap: 8, paddingRight: 12, paddingVertical: 2, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", fontFamily: fontFamily.semiBold },
  chipTextActive: { color: Colors.background, fontWeight: "700", fontFamily: fontFamily.bold },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: 8,
    marginBottom: 14,
  },
  sourceHint: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
    marginBottom: 10,
  },
  sourceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sourceInputBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceInputBadgeText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
  },
  sourceInput: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: Colors.text,
    fontSize: 12,
    fontWeight: "500", fontFamily: fontFamily.medium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  sourceRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    marginBottom: 6,
  },
  sourceAddBtnText: {
    fontSize: 12,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.gold,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    marginBottom: 10,
  },
  genButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingVertical: 15,
  },
  genButtonDisabled: { opacity: 0.5 },
  genButtonText: { fontSize: 15, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.background },
  progressBlock: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "44",
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  progressLabel: { fontSize: 13, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text },
  progressDetail: { fontSize: 11, color: Colors.textSecondary, marginLeft: 26 },
  progressSlow: {
    fontSize: 11,
    color: Colors.gold,
    marginTop: 8,
    marginLeft: 26,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
});
