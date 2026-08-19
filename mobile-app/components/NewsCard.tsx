import { router } from "expo-router";
import { BadgeCheck, Clock, Globe2, Link2, MapPin, Sparkles } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import { Image, ImageBackground, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { CATEGORY_FALLBACK_IMAGES, CATEGORY_LABELS, estimateReadingTime, formatNewsRelative, type NewsArticle } from "@/mocks/news";
import { fontFamily, fontFamilySpectral } from "@/constants/theme";

type Props = {
  article: NewsArticle;
};

function NewsCardBase({ article }: Props) {
  const [imageUri, setImageUri] = useState<string>(article.imageUrl);
  const [hasFailed, setHasFailed] = useState<boolean>(false);
  const source = useMemo(() => ({ uri: imageUri }), [imageUri]);

  const onImageError = useCallback(() => {
    if (hasFailed) return;
    setHasFailed(true);
    const fallback = CATEGORY_FALLBACK_IMAGES[article.category];
    if (fallback) setImageUri(fallback);
  }, [hasFailed, article.category]);

  const open = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push(`/news/${article.id}`);
  }, [article.id]);

  const ScopeIcon = article.scope === "local" ? MapPin : article.scope === "global" ? Globe2 : Sparkles;
  const readMinutes = estimateReadingTime(article);
  const isVerified = article.verifiedSources.length >= 3;

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        styles.card,
        pressed && { transform: [{ scale: 0.992 }], opacity: 0.96 },
      ]}
      testID={`news-card-${article.id}`}
    >
      <View style={styles.imageWrap}>
        <ImageBackground
          source={source}
          style={styles.image}
          imageStyle={styles.imageInner}
          onError={onImageError}
        >
          <View style={styles.imageScrim}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>
                {CATEGORY_LABELS[article.category]}
              </Text>
            </View>
            <View style={styles.scopePill}>
              <ScopeIcon size={10} color={Colors.background} />
              <Text style={styles.scopeText}>{article.scope}</Text>
            </View>
          </View>
        </ImageBackground>
      </View>

      <View style={styles.body}>
        <Text style={styles.headline} numberOfLines={3}>
          {article.headline}
        </Text>
        <Text style={styles.summary} numberOfLines={3}>
          {article.summary}
        </Text>

        <View style={styles.footer}>
          <View style={styles.verifiedRow}>
            <BadgeCheck size={13} color={isVerified ? Colors.success : Colors.textMuted} />
            <Text style={[styles.verifiedText, !isVerified && { color: Colors.textMuted }]}>
              {isVerified ? "Fact-Verified" : "Pending"}
            </Text>
            <View style={[styles.sourceCountBadge, !isVerified && styles.sourceCountBadgePending]}>
              <Link2 size={9} color={isVerified ? Colors.success : Colors.textMuted} />
              <Text style={[styles.sourceCountText, !isVerified && { color: Colors.textMuted }]}>
                {article.verifiedSources.length} {article.verifiedSources.length === 1 ? "source" : "sources"}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Clock size={11} color={Colors.textMuted} />
            <Text style={styles.readTime}>{readMinutes} min read</Text>
            <View style={styles.dot} />
            <Text style={styles.time}>{formatNewsRelative(article.publishedAt)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const NewsCard = memo(NewsCardBase);
export default NewsCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  imageWrap: { height: 180, backgroundColor: Colors.surfaceSecondary },
  image: { flex: 1, justifyContent: "flex-end" },
  imageInner: { resizeMode: "cover" },
  imageScrim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(14,15,18,0.55)",
  },
  categoryPill: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.background,
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
  scopeText: {
    fontSize: 10,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.background,
    textTransform: "capitalize",
  },
  body: { padding: 16 },
  headline: {
    fontSize: 17,
    fontWeight: "700", fontFamily: fontFamilySpectral.bold,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  summary: {
    fontSize: 14,
    fontFamily: fontFamilySpectral.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.success,
    letterSpacing: 0.2,
  },
  sourceCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.success + "26",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 2,
  },
  sourceCountBadgePending: {
    backgroundColor: Colors.surface3,
  },
  sourceCountText: {
    fontSize: 9,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.success,
    letterSpacing: 0.3,
  },
  time: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "500", fontFamily: fontFamily.medium,
  },
  readTime: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "600", fontFamily: fontFamily.semiBold,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
});
