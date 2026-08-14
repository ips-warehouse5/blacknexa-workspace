import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/utils/navigation";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  Clock,
  ExternalLink,
  Globe2,
  Languages,
  Loader2,
  MapPin,
  Sparkles,
  Volume2,
} from "lucide-react-native";
import { Audio } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { CATEGORY_FALLBACK_IMAGES, CATEGORY_LABELS, estimateReadingTime, formatNewsAbsolute, formatNewsRelative, type NewsArticle } from "@/mocks/news";
import { useNews } from "@/providers/NewsProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  LANGUAGE_BY_CODE,
  SUPPORTED_LANGUAGES,
  type ArticleTranslation,
  type LanguageCode,
} from "@/constants/i18n";
import ShareSheet from "@/components/ShareSheet";
import {
  buildArticleSpokenScript,
  isNativeTtsAvailable,
  playAudioUri,
  speakWithNativeTTS,
  stopNativeTTS,
  synthesizeSpeech,
} from "@/utils/audio";

/** Condense a long source title to a clean publisher name for a news-style
 * citation. Falls back to the URL host when the title is unwieldy. */
function condensedPublisher(name: string, url: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 32) return trimmed;
  return hostOf(url);
}

/** Extract a clean host (e.g. "reuters.com") from a URL string. */
function hostOf(urlString: string): string {
  try {
    const comps = new URL(urlString);
    return comps.hostname.replace(/^www\./, "");
  } catch {
    return urlString;
  }
}

export default function NewsArticleScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feed, fetchTranslationFor } = useNews();
  const { settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string>("");
  const [hasFailed, setHasFailed] = useState<boolean>(false);
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [langPickerOpen, setLangPickerOpen] = useState<boolean>(false);
  const [translation, setTranslation] = useState<ArticleTranslation | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [backgroundPending, setBackgroundPending] = useState<boolean>(false);
  const [audioLoading, setAudioLoading] = useState<boolean>(false);
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const article = useMemo<NewsArticle | undefined>(
    () => feed.find((a) => a.id === id || a.slug === id),
    [feed, id]
  );

  const readMinutes = useMemo<number>(
    () => (article ? estimateReadingTime(article) : 1),
    [article]
  );

  const preferredLanguage = settings.preferredLanguage;
  const isTranslated = translation && translation.language !== "en";
  const isRtl = isTranslated && LANGUAGE_BY_CODE[translation.language]?.rtl;
  const display = translation ?? {
    language: "en" as LanguageCode,
    headline: article?.headline ?? "",
    summary: article?.summary ?? "",
    content: article?.content ?? "",
    godlyPrincipleAlignment: article?.godlyPrincipleAlignment ?? "",
    translatedAt: article?.publishedAt ?? new Date().toISOString(),
  };

  useEffect(() => {
    if (article) {
      setImageUri(article.imageUrl);
      setHasFailed(false);
    }
  }, [article?.imageUrl]);

  // Fetch a translation whenever the article or preferred language changes.
  // English short-circuits to the source text. A stale in-flight request is
  // aborted so switching languages is always snappy. If the Worker returns the
  // English source because the target translation is still being generated in
  // the background, we poll every few seconds until the cached translation is
  // ready.
  useEffect(() => {
    if (!article) return;
    abortRef.current?.abort();
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    const controller = new AbortController();
    abortRef.current = controller;

    if (preferredLanguage === "en") {
      setTranslation({
        language: "en",
        headline: article.headline,
        summary: article.summary,
        content: article.content,
        godlyPrincipleAlignment: article.godlyPrincipleAlignment,
        translatedAt: article.publishedAt,
      });
      setIsTranslating(false);
      setTranslateError(null);
      setBackgroundPending(false);
      return;
    }

    const loadTranslation = (isPoll = false) => {
      if (!isPoll) {
        setIsTranslating(true);
      }
      setTranslateError(null);
      fetchTranslationFor(article.slug, preferredLanguage, controller.signal)
        .then((t) => {
          if (controller.signal.aborted) return;
          setTranslation(t);
          setIsTranslating(false);
          if (t.background) {
            setBackgroundPending(true);
            pollRef.current = setTimeout(() => loadTranslation(true), 3500);
          } else {
            setBackgroundPending(false);
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setIsTranslating(false);
          setBackgroundPending(false);
          const message = err instanceof Error ? err.message : "Translation failed.";
          setTranslateError(message);
          // Fall back to the source text so the article is still readable.
          setTranslation({
            language: "en",
            headline: article.headline,
            summary: article.summary,
            content: article.content,
            godlyPrincipleAlignment: article.godlyPrincipleAlignment,
            translatedAt: article.publishedAt,
          });
        });
    };

    loadTranslation();

    return () => {
      controller.abort();
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [article, preferredLanguage, fetchTranslationFor]);

  const onSelectLanguage = useCallback(
    (code: LanguageCode) => {
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      update("preferredLanguage", code);
      setLangPickerOpen(false);
    },
    [update]
  );

  const onImageError = useCallback(() => {
    if (hasFailed || !article) return;
    setHasFailed(true);
    const fallback = CATEGORY_FALLBACK_IMAGES[article.category];
    if (fallback) setImageUri(fallback);
  }, [hasFailed, article]);

  const onShare = useCallback(() => {
    if (!article) return;
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    setShareOpen(true);
  }, [article]);

  const stopAudio = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    stopNativeTTS();
    soundRef.current = null;
    setAudioPlaying(false);
  }, []);

  const playAudioBriefing = useCallback(async () => {
    if (!article) return;
    if (audioPlaying) {
      await stopAudio();
      return;
    }
    setAudioError(null);
    setAudioLoading(true);
    try {
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }

      // The language we speak in matches the currently displayed text. English
      // uses the source article; any other language uses the cached translation.
      const ttsLanguage = translation?.language ?? preferredLanguage;
      const headline = isTranslated ? display.headline : article.headline;
      const summary = isTranslated ? display.summary : article.summary;
      const script = buildArticleSpokenScript(headline, summary);

      const backendAudioUrl = article.audioUrl;
      if (backendAudioUrl && backendAudioUrl.includes("/api/v1/news/audio/")) {
        // Backend has a pre-generated MP3. Try to play it; if the mobile player
        // rejects the format, fall back to native TTS in the same language.
        try {
          const sound = await playAudioUri(backendAudioUrl);
          soundRef.current = sound;
          setAudioPlaying(true);
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status && "didJustFinish" in status && status.didJustFinish) {
              setAudioPlaying(false);
              sound.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          });
          return;
        } catch (playerErr) {
          const msg = playerErr instanceof Error ? playerErr.message : String(playerErr);
          console.warn("Backend audio playback failed, falling back to native TTS:", msg);
          if (isNativeTtsAvailable()) {
            await speakWithNativeTTS(script, ttsLanguage);
            setAudioPlaying(true);
            return;
          }
          throw playerErr;
        }
      }

      // No backend audio: on mobile we go straight to native TTS (reliable and
      // multilingual); on web we try the AI TTS data URI first.
      if (isNativeTtsAvailable()) {
        await speakWithNativeTTS(script, ttsLanguage);
        setAudioPlaying(true);
        return;
      }

      const tts = await synthesizeSpeech(script);
      const sound = await playAudioUri(tts.uri);
      soundRef.current = sound;
      setAudioPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status && "didJustFinish" in status && status.didJustFinish) {
          setAudioPlaying(false);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not play the audio briefing.";
      // Last resort: native TTS. This uses the OS speech synthesizer, not the
      // network or expo-av file formats, so it works on real devices even when
      // everything else fails.
      if (isNativeTtsAvailable()) {
        try {
          const ttsLanguage = translation?.language ?? preferredLanguage;
          const headline = isTranslated ? display.headline : article.headline;
          const summary = isTranslated ? display.summary : article.summary;
          const content = isTranslated ? display.content : article.content;
          const script = buildArticleSpokenScript(headline, summary, content);
          await speakWithNativeTTS(script, ttsLanguage);
          setAudioPlaying(true);
          setAudioError(null);
          return;
        } catch (nativeErr) {
          const nativeMessage = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
          setAudioError(`Voice briefing unavailable: ${nativeMessage}`);
        }
      } else {
        setAudioError(message);
      }
    } finally {
      setAudioLoading(false);
    }
  }, [article, audioPlaying, isTranslated, display, stopAudio, translation, preferredLanguage, article?.content]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const openSource = useCallback(async (url: string) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    try {
      await Linking.openURL(url);
    } catch {
      /* invalid url */
    }
  }, []);

  const ScopeIcon = article?.scope === "local" ? MapPin : article?.scope === "global" ? Globe2 : Sparkles;

  if (!article) {
    return (
      <View style={styles.missing}>
        <Stack.Screen options={{ title: "Briefing" }} />
        <Text style={styles.missingTitle}>Briefing not found</Text>
        <Text style={styles.missingText}>It may have scrolled out of the feed.</Text>
      </View>
    );
  }

  const currentLang = LANGUAGE_BY_CODE[preferredLanguage];

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Briefing",
          headerBackTitle: "News",
          headerShown: false,
        }}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <ImageBackground
            source={{ uri: imageUri }}
            style={styles.heroImage}
            imageStyle={styles.heroImageInner}
            onError={onImageError}
          >
            <LinearGradient
              colors={["rgba(14,15,18,0.2)", "rgba(14,15,18,0.85)"]}
              style={styles.heroScrim}
            >
              <View style={[styles.heroContent, { paddingTop: insets.top + 56 }]}>
                <View style={styles.heroPillRow}>
                  <View style={styles.categoryPill}>
                    <Text style={styles.categoryText}>
                      {CATEGORY_LABELS[article.category]}
                    </Text>
                  </View>
                  <View style={styles.scopePill}>
                    <ScopeIcon size={10} color={Colors.bg} />
                    <Text style={styles.scopeText}>{article.scope}</Text>
                  </View>
                  {isTranslated && (
                    <View style={styles.translatedPill}>
                      <Languages size={10} color={Colors.gold} />
                      <Text style={styles.translatedText}>
                        {currentLang.nativeName}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.headline, isRtl && styles.rtlText]}
                  accessibilityLiveRegion={isTranslating ? "polite" : "none"}
                >
                  {isTranslating && !translation
                    ? article.headline
                    : display.headline}
                </Text>
                <View style={styles.bylineRow}>
                  <Text style={styles.bylineAuthor}>{article.author}</Text>
                  <View style={styles.dot} />
                  <Clock size={11} color={Colors.textMute} />
                  <Text style={styles.bylineTime}>{readMinutes} min read</Text>
                  <View style={styles.dot} />
                  <Clock size={11} color={Colors.textMute} />
                  <Text style={styles.bylineTime}>{formatNewsRelative(article.publishedAt)}</Text>
                </View>
                <Text style={styles.publishDate}>{formatNewsAbsolute(article.publishedAt)}</Text>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>

        <View style={styles.body}>
          {/* Language picker — translate this story into the reader's native language */}
          <Pressable
            style={styles.langPicker}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              setLangPickerOpen(true);
            }}
            accessibilityLabel="Select language"
            accessibilityRole="button"
          >
            <Languages size={16} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.langLabel}>Reading language</Text>
              <Text style={styles.langValue}>
                {currentLang.flag} {currentLang.nativeName}
                {currentLang.code !== "en" ? ` · ${currentLang.englishName}` : ""}
              </Text>
            </View>
            {isTranslating ? (
              <Loader2 size={16} color={Colors.textMute} />
            ) : (
              <ChevronDown size={16} color={Colors.textMute} />
            )}
          </Pressable>

          {backgroundPending ? (
            <View style={styles.pendingBanner}>
              <Loader2 size={14} color={Colors.gold} />
              <Text style={styles.pendingText}>
                Preparing {currentLang.nativeName} translation — reading in English for now.
              </Text>
            </View>
          ) : null}

          {translateError ? (
            <Text style={styles.translateError}>{translateError}</Text>
          ) : null}

          <Text style={[styles.summary, isRtl && styles.rtlText]}>
            {isTranslating && !translation ? article.summary : display.summary}
          </Text>
          <Text style={[styles.content, isRtl && styles.rtlText]}>
            {isTranslating && !translation ? article.content : display.content}
          </Text>

          <View style={styles.verifiedBanner}>
            <BadgeCheck size={18} color={Colors.emerald} />
            <View style={{ flex: 1 }}>
              <Text style={styles.verifiedTitle}>{article.factCheckStatus}</Text>
              <Text style={styles.verifiedSub}>
                Grounded in official records and public registries.
              </Text>
            </View>
          </View>

          <View style={styles.audioCard}>
            <View style={styles.audioIcon}>
              <Volume2 size={18} color={audioPlaying ? Colors.crimson : Colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.audioTitle}>
                {audioPlaying ? "Playing Audio Briefing" : "Audio Briefing"}
              </Text>
              <Text style={styles.audioSub}>
                {audioLoading ? "Preparing voice narration…" : "Listen to this story on the go"}
              </Text>
            </View>
            <Pressable
              style={[
                styles.audioPlay,
                audioPlaying && { backgroundColor: Colors.crimson },
                audioLoading && { opacity: 0.6 },
              ]}
              onPress={playAudioBriefing}
              disabled={audioLoading}
            >
              {audioLoading ? (
                <Loader2 size={16} color={Colors.bg} />
              ) : (
                <Text style={styles.audioPlayText}>
                  {audioPlaying ? "Stop" : "Play"}
                </Text>
              )}
            </Pressable>
          </View>
          {audioError ? (
            <Text style={styles.audioError}>{audioError}</Text>
          ) : null}

          <Text style={styles.sourcesTitle}>Verified Sources</Text>
          <Text style={styles.sourcesSubtext}>
            Every claim in this briefing is traced to a primary source. Tap any link to read the original.
          </Text>
          {article.verifiedSources.map((s, idx) => {
            const publisher = condensedPublisher(s.name, s.url);
            const domain = hostOf(s.url);
            return (
              <Pressable
                key={`src-${idx}-${s.url}`}
                style={styles.sourceRow}
                onPress={() => openSource(s.url)}
              >
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>
                    {domain.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceName} numberOfLines={2}>{publisher}</Text>
                  <View style={styles.sourceMetaRow}>
                    <Text style={styles.sourceDomain} numberOfLines={1}>{domain}</Text>
                    {s.publishedDate ? (
                      <Text style={styles.sourceDate}>· {s.publishedDate}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.sourceUrl} numberOfLines={2}>{s.url}</Text>
                  {s.excerpt ? (
                    <Text style={styles.sourceExcerpt} numberOfLines={4}>
                      {s.excerpt}
                    </Text>
                  ) : null}
                </View>
                <ExternalLink size={13} color={Colors.textMute} />
              </Pressable>
            );
          })}

          <View style={styles.principleCard}>
            <Sparkles size={15} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.principleLabel}>Godly Principle Alignment</Text>
              <Text style={[styles.principleText, isRtl && styles.rtlText]}>
                {isTranslating && !translation
                  ? article.godlyPrincipleAlignment
                  : display.godlyPrincipleAlignment}
              </Text>
            </View>
          </View>

          <View style={styles.brandFooter}>
            <View style={styles.brandRule} />
            <View style={styles.brandRow}>
              <BadgeCheck size={18} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.brandName}>BLACKNEXA™</Text>
                <Text style={styles.brandTagline}>Verified Faith-Grounded Briefing</Text>
              </View>
            </View>
            <Text style={styles.brandMeta}>
              Published {formatNewsAbsolute(article.publishedAt)} by BlackNexa AI Fact Engine.{"\n"}
              Authenticated & verified for distribution. All rights reserved.
            </Text>
            <Text style={styles.brandURL}>blacknexa.com/news/{article.slug}</Text>
            <View style={styles.tmBlock}>
              <Text style={styles.tmLine}>
                BlackNexa™ is a trademark of BlackNexa, application pending with the USPTO.
              </Text>
              <Text style={styles.tmLine}>
                All content, concepts, methodology, and intellectual property herein are the exclusive protected property of BlackNexa™ — including the Truth Verification Engine, Civic Checks & Balances, and faith-grounded news framework.
              </Text>
              <Text style={styles.tmLine}>
                © {new Date().getFullYear()} BlackNexa™. All rights reserved. Unauthorized reproduction, syndication, or derivative use is prohibited.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.backBar, { top: insets.top }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
            safeBack("/(tabs)/news");
          }}
          accessibilityLabel="Back"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </Pressable>
        <Pressable style={styles.shareBtn} onPress={onShare} accessibilityLabel="Share">
          <Text style={styles.shareText}>Share</Text>
        </Pressable>
      </View>

      {article && (
        <ShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          headline={isTranslated ? display.headline : article.headline}
          summary={isTranslated ? display.summary : article.summary}
          url={`https://blacknexa.com/news/${article.slug}`}
        />
      )}

      {/* Language picker modal — translate this story into the reader's native language */}
      <LanguagePickerModal
        visible={langPickerOpen}
        current={preferredLanguage}
        onSelect={onSelectLanguage}
        onClose={() => setLangPickerOpen(false)}
      />
    </View>
  );
}

/** Full-screen language picker — covers every major global reading language. */
function LanguagePickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onClose: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={langStyles.overlay}>
        <View
          style={[langStyles.sheet, { paddingBottom: 20 + insets.bottom }]}
        >
          <View style={langStyles.handle} />
          <View style={langStyles.header}>
            <Languages size={18} color={Colors.gold} />
            <Text style={langStyles.title}>Select reading language</Text>
            <Pressable onPress={onClose} style={langStyles.closeBtn} accessibilityLabel="Close">
              <ChevronLeft size={20} color={Colors.textMute} style={{ transform: [{ rotate: "90deg" }] }} />
            </Pressable>
          </View>
          <Text style={langStyles.subtitle}>
            Translate this story into your native language. English is the original.
          </Text>
          <ScrollView
            style={langStyles.list}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = lang.code === current;
              return (
                <Pressable
                  key={lang.code}
                  style={[langStyles.row, active && langStyles.rowActive]}
                  onPress={() => onSelect(lang.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={langStyles.flag}>{lang.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[langStyles.nativeName, lang.rtl && styles.rtlText]}>
                      {lang.nativeName}
                    </Text>
                    <Text style={langStyles.englishName}>{lang.englishName}</Text>
                  </View>
                  {active ? (
                    <BadgeCheck size={18} color={Colors.gold} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1 },
  heroWrap: { height: 320, backgroundColor: Colors.surface2 },
  heroImage: { flex: 1, justifyContent: "flex-end" },
  heroImageInner: { resizeMode: "cover" },
  heroScrim: { flex: 1, justifyContent: "flex-end" },
  heroContent: { padding: 18 },
  heroPillRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  categoryPill: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.bg,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  scopePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245,242,234,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  scopeText: { fontSize: 10, fontWeight: "700", color: Colors.bg, textTransform: "capitalize" },
  headline: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.text,
    lineHeight: 30,
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  bylineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bylineAuthor: { fontSize: 12, fontWeight: "700", color: Colors.gold },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.textMute },
  bylineTime: { fontSize: 12, color: Colors.textMute, fontWeight: "500" },
  publishDate: {
    fontSize: 11,
    color: Colors.textMute,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginTop: 6,
    textTransform: "uppercase",
  },
  body: { padding: 18 },
  summary: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 16,
  },
  content: {
    fontSize: 15,
    color: Colors.textDim,
    lineHeight: 24,
    marginBottom: 22,
  },
  verifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.emerald + "14",
    borderWidth: 1,
    borderColor: Colors.emerald + "44",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  verifiedTitle: { fontSize: 13, fontWeight: "800", color: Colors.emerald, letterSpacing: 0.4 },
  verifiedSub: { fontSize: 12, color: Colors.textDim, marginTop: 2 },
  audioCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
  },
  audioIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gold + "1F",
    alignItems: "center",
    justifyContent: "center",
  },
  audioTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  audioSub: { fontSize: 12, color: Colors.textDim, marginTop: 2 },
  audioPlay: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  audioPlayText: { fontSize: 12, fontWeight: "800", color: Colors.bg },
  audioError: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.crimson,
    marginTop: -18,
    marginBottom: 18,
  },
  sourcesTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMute,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sourcesSubtext: {
    fontSize: 12,
    color: Colors.textDim,
    fontWeight: "500",
    lineHeight: 17,
    marginBottom: 12,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sourceBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: Colors.gold,
  },
  sourceName: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: "700",
  },
  sourceDomain: {
    fontSize: 11,
    color: Colors.textMute,
    fontWeight: "500",
  },
  sourceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  sourceDate: {
    fontSize: 10,
    color: Colors.textMute,
    fontWeight: "500",
  },
  sourceUrl: {
    fontSize: 10,
    color: Colors.gold + "AA",
    fontWeight: "600",
    marginTop: 3,
    lineHeight: 14,
  },
  sourceExcerpt: {
    fontSize: 12,
    color: Colors.textDim,
    fontWeight: "400",
    lineHeight: 17,
    marginTop: 6,
    fontStyle: "italic",
  },
  principleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    padding: 14,
    marginTop: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "33",
  },
  principleLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  principleText: { fontSize: 13, color: Colors.text, lineHeight: 19, fontWeight: "500" },
  brandFooter: {
    marginTop: 28,
    paddingTop: 20,
  },
  brandRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  brandName: {
    fontSize: 15,
    fontWeight: "900",
    color: Colors.gold,
    letterSpacing: 1.2,
  },
  brandTagline: {
    fontSize: 11,
    color: Colors.textDim,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginTop: 2,
    textTransform: "uppercase",
  },
  brandMeta: {
    fontSize: 11,
    color: Colors.textMute,
    lineHeight: 16,
    fontWeight: "500",
  },
  brandURL: {
    fontSize: 11,
    color: Colors.gold + "AA",
    fontWeight: "700",
    marginTop: 8,
    letterSpacing: 0.3,
  },
  tmBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  tmLine: {
    fontSize: 10,
    color: Colors.textMute,
    lineHeight: 15,
    fontWeight: "500",
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  backBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(22,24,29,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  shareBtn: {
    backgroundColor: "rgba(22,24,29,0.85)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  shareText: { fontSize: 12, fontWeight: "700", color: Colors.text },
  langPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "33",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  langLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textDim,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  langValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },
  translatedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.gold + "1F",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  translatedText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  translateError: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textDim,
    marginBottom: 12,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.gold + "14",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  pendingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.gold,
    lineHeight: 17,
  },
  rtlText: {
    writingDirection: "rtl",
    textAlign: "right",
  },
  missing: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  missingTitle: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 4 },
  missingText: { fontSize: 13, color: Colors.textDim },
});

const langStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: Colors.text,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textDim,
    paddingHorizontal: 20,
    paddingBottom: 12,
    lineHeight: 17,
  },
  list: {
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: Colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  rowActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.gold + "14",
  },
  flag: {
    fontSize: 26,
  },
  nativeName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 2,
  },
  englishName: {
    fontSize: 12,
    color: Colors.textDim,
    fontWeight: "500",
  },
});
