/**
 * The tab bar, built to `TabBar.dc.html`.
 *
 * Five tabs — Home, News, [+], Vault, Support — at h 86, `s0` at 97%, a hairline
 * top border, and the centre button at 50 × 50 / r 17 in the accent, lifted 7px
 * with an accent shadow.
 *
 * ── Two structural changes from the previous tab bar ───────────────────────
 *   • **Report leaves the tab bar.** The centre `+` opens the wizard as a
 *     full-screen modal (A12: "The centre button opens a report over whatever you
 *     were doing"), so it is a button, not a destination. Registering it as a
 *     screen would let the tab bar hold a route the design never navigates to.
 *   • **Profile leaves the tab bar** and becomes the avatar in the feed header,
 *     which is what B1 draws.
 */

import React, { useCallback } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Tabs, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors } from "@/constants/theme";
import { fonts } from "@/constants/typography";

/** The artboard's bar height above the safe-area inset. */
const BAR_HEIGHT = 86;

export default function TabLayout(): React.ReactElement {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.acc,
        tabBarInactiveTintColor: colors.t4,
        tabBarStyle: {
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 11,
          paddingBottom: insets.bottom,
          backgroundColor: colors.s0,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: alpha(colors.t0, 0.07),
          // The design's bar is opaque enough to read as a surface; the artboard's
          // `.97` is a web nicety that would only cost a blur layer here.
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 10.5,
          letterSpacing: 0.1,
        },
        tabBarItemStyle: { paddingTop: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: "News",
          tabBarIcon: ({ color }) => <NewsIcon color={color} />,
        }}
      />

      {/*
        The centre button. It has to be registered as a screen for the tab bar to
        lay out five slots, but `tabBarButton` replaces it entirely and the
        listener prevents navigation — so it opens the wizard modal instead of
        ever showing this route.
      */}
      <Tabs.Screen
        name="new"
        options={{
          title: "",
          tabBarButton: (props) => <CentreButton accessibilityState={props.accessibilityState} />,
        }}
        listeners={{ tabPress: (event) => event.preventDefault() }}
      />

      <Tabs.Screen
        name="vault"
        options={{
          title: "Vault",
          tabBarIcon: ({ color }) => <VaultIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: "Support",
          tabBarIcon: ({ color }) => <SupportIcon color={color} />,
        }}
      />

    </Tabs>
  );
}

/** The lifted accent square that opens the report wizard. */
function CentreButton({
  accessibilityState,
}: {
  accessibilityState?: { selected?: boolean };
}): React.ReactElement {
  const open = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    router.push("/report");
  }, []);

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel="File a new report"
      accessibilityState={accessibilityState}
      style={styles.centreSlot}
    >
      <View style={styles.centreButton}>
        <View style={styles.plusH} />
        <View style={styles.plusV} />
      </View>
    </Pressable>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────
// Drawn with views rather than an icon set: the design's glyphs are 22px
// 1.6px-stroke outlines that do not match any lucide equivalent, and matching the
// artboard matters more than the convenience of a library.

function HomeIcon({ color }: { color: string }): React.ReactElement {
  return (
    <View style={styles.icon}>
      <View style={[styles.homeRoof, { borderBottomColor: color }]} />
      <View style={[styles.homeBody, { borderColor: color }]} />
    </View>
  );
}

function NewsIcon({ color }: { color: string }): React.ReactElement {
  return (
    <View style={styles.icon}>
      <View style={[styles.newsFrame, { borderColor: color }]}>
        <View style={[styles.newsLine, { backgroundColor: color, width: 7 }]} />
        <View style={[styles.newsLine, { backgroundColor: color, width: 7 }]} />
        <View style={[styles.newsLine, { backgroundColor: color, width: 4.5 }]} />
      </View>
    </View>
  );
}

function VaultIcon({ color }: { color: string }): React.ReactElement {
  return (
    <View style={styles.icon}>
      <View style={[styles.vaultShackle, { borderColor: color }]} />
      <View style={[styles.vaultBody, { borderColor: color }]} />
    </View>
  );
}

function SupportIcon({ color }: { color: string }): React.ReactElement {
  return (
    <View style={styles.icon}>
      <View style={[styles.supportOuter, { borderColor: color }]} />
      <View style={[styles.supportInner, { borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  centreSlot: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  centreButton: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: colors.acc,
    alignItems: "center",
    justifyContent: "center",
    // The artboard lifts the button 7px above the bar's content line.
    marginTop: -7,
    shadowColor: colors.acc,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  plusH: { position: "absolute", width: 22, height: 2.1, borderRadius: 1, backgroundColor: colors.onAcc },
  plusV: { position: "absolute", width: 2.1, height: 22, borderRadius: 1, backgroundColor: colors.onAcc },

  icon: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },

  homeRoof: {
    position: "absolute",
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  homeBody: {
    position: "absolute",
    bottom: 3,
    width: 14,
    height: 10,
    borderWidth: 1.6,
    borderTopWidth: 0,
  },

  newsFrame: {
    width: 17,
    height: 14,
    borderWidth: 1.6,
    borderRadius: 2.5,
    paddingHorizontal: 2.5,
    paddingTop: 2.5,
    gap: 1.6,
  },
  newsLine: { height: 1.4, borderRadius: 1 },

  vaultShackle: {
    position: "absolute",
    top: 2,
    width: 10,
    height: 8,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  vaultBody: {
    position: "absolute",
    bottom: 2.5,
    width: 15,
    height: 10,
    borderWidth: 1.6,
    borderRadius: 2.5,
  },

  supportOuter: { position: "absolute", width: 17, height: 17, borderRadius: 9, borderWidth: 1.6 },
  supportInner: { position: "absolute", width: 7.5, height: 7.5, borderRadius: 4, borderWidth: 1.6 },
});
