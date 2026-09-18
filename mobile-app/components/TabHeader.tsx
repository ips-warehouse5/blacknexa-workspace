/**
 * The shared header for every root tab — Home, News, Vault, Support, and the
 * centre "New" slot (`app/(tabs)/_layout.tsx`'s five destinations).
 *
 * Avatar (left) / brand (centre) / search + notifications (right) — same
 * layout B1 draws for Home, reused as-is rather than redrawn per screen so
 * the five tabs read as one app, not five different headers that happen to
 * be next to each other.
 *
 * Search and notifications are disabled placeholders everywhere right now:
 * every tab but Home is a `ComingSoon` stub, and Home's own feed is paused
 * too (see app/(tabs)/index.tsx's TODO), so neither action has anywhere to
 * go yet. Re-enable per screen once that screen's real content ships.
 */

import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { UserRound } from "lucide-react-native";
import { colors } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { useAuth } from "@/providers/AuthProvider";

export default function TabHeader(): React.ReactElement {
  const { user } = useAuth();
  // "anonymous" hides the photo outright, even when `avatarUrl` is a valid
  // URL — matches app/profile/index.tsx, the source of truth for this rule.
  const isAnonymous = user?.avatarMode === "anonymous";
  const showAvatarImage = !isAnonymous && Boolean(user?.avatarUrl);

  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        style={[styles.avatar, { backgroundColor: colors.s6 }]}
        testID="tab-header-avatar"
      >
        {isAnonymous ? (
          <UserRound size={16} color={colors.t3} />
        ) : showAvatarImage ? (
          <Image
            source={{ uri: user?.avatarUrl ?? undefined }}
            style={{ width: 34, height: 34 }}
            resizeMode="cover"
          />
        ) : (
          <Text variant="labelSm" color={colors.acc}>
            {user?.initials ?? "?"}
          </Text>
        )}
      </Pressable>

      <Text variant="cardTitle" color={colors.t0} style={{ fontSize: 18 }}>
        BlackNexa™
      </Text>

      <View style={styles.headerActions}>
        <Pressable
          disabled
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Search reports is coming soon"
          testID="tab-header-search"
        >
          <SearchGlyph />
        </Pressable>
        <Pressable
          disabled
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notifications are coming soon"
          testID="tab-header-notifications"
        >
          <BellGlyph withDot />
        </Pressable>
      </View>
    </View>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────
// Drawn with views rather than an icon set: the design's glyphs don't match
// any lucide equivalent, and matching the artboard matters more than the
// convenience of a library.

function SearchGlyph(): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={[styles.searchRing, { borderColor: colors.t1 }]} />
      <View style={[styles.searchHandle, { backgroundColor: colors.t1 }]} />
    </View>
  );
}

function BellGlyph({ withDot }: { withDot?: boolean }): React.ReactElement {
  return (
    <View style={styles.glyph}>
      <View style={[styles.bellDome, { borderColor: colors.t1 }]} />
      <View style={[styles.bellBar, { backgroundColor: colors.t1 }]} />
      <View style={[styles.bellClapper, { borderColor: colors.t1 }]} />
      {withDot ? (
        <View
          style={[
            styles.bellDot,
            { backgroundColor: colors.acc, borderColor: colors.bg },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },

  glyph: { width: 21, height: 21, alignItems: "center", justifyContent: "center" },
  searchRing: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.7,
  },
  searchHandle: {
    position: "absolute",
    right: 2,
    bottom: 3,
    width: 6,
    height: 1.7,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },
  bellDome: {
    width: 13,
    height: 11,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 1.7,
    borderBottomWidth: 0,
    marginTop: 1,
  },
  bellBar: { width: 17, height: 1.7 },
  bellClapper: {
    width: 5,
    height: 2.5,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderWidth: 1.7,
    borderTopWidth: 0,
    marginTop: 1,
  },
  bellDot: {
    position: "absolute",
    top: 0,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
});
