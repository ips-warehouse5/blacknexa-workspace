/**
 * A1 splash + A2/A3 intro carousel, in one screen.
 *
 * They are combined because the splash is not a destination — it is the first
 * 600ms of this screen. A1's caption: "The bar appears only after a delay, so a
 * fast launch never flashes a loader." Routing to a separate splash route would
 * guarantee the flash it exists to avoid.
 *
 * Three slides, and the design's distinctive detail: the dots **stretch** rather
 * than fill — 26 × 4 active, 8 × 4 idle.
 *
 * Each slide's photograph is full-bleed — the image fills the entire screen,
 * not just a header block — with a top-to-bottom scrim so it stays legible
 * under Skip, the copy, and the sticky dots/button, all of which sit directly
 * on top of the photo rather than on a solid page background below it.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { alpha, colors, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";

interface Slide {
  eyebrow: string;
  headline: string;
  body: string;
  /** A3 adds two icon proof-rows; A2 has none. */
  proof?: string[];
  /** Full-bleed background photo, per the artboard's `image-slot`. */
  image: ImageSourcePropType;
}

const SLIDES: Slide[] = [
  {
    eyebrow: "Document",
    headline: "What happened to you is not going to disappear.",
    body: "Write it down in ninety seconds. Come back and finish it when you can.",
    // Board placeholder: "Intro art 1 — a person, mid-street."
    image: require("@/assets/onboarding/onboarding-slide-1.jpg"),
  },
  {
    eyebrow: "Preserve",
    headline: "Sealed the moment it arrives.",
    body: "Photos, video, and audio are sealed on upload, so a later change would show.",
    proof: [
      "Every file is sealed and timestamped",
      "Only you and a moderator can open it",
    ],
    image: require("@/assets/onboarding/onboarding-slide-2.jpg"),
  },
  {
    eyebrow: "Connect",
    headline: "Help that has already been checked.",
    body: "180 legal, health, and crisis organisations, each one confirmed by a person.",
    proof: [
      "Every organisation is checked and dated",
      "Crisis lines work with no signal",
    ],
    // Board placeholder: "Intro art 3 — community, hands, doorway."
    image: require("@/assets/onboarding/onboarding-slide-3.jpg"),
  },
];

/** A1's loader appears only after this delay. */
const LOADER_DELAY_MS = 600;
/** How long the splash holds before the carousel takes over. */
const SPLASH_MS = 1100;
/** Clears the sticky footer (dots + button) so slide text never runs under it. */
const FOOTER_CLEARANCE = 172;

/**
 * Marks onboarding as seen so a returning signed-out user lands on Welcome
 * instead of the intro carousel — read by the root `AuthGate`. Previously
 * lived in `location.tsx`, which no longer exists as a route now that A4 is
 * a modal shown from Welcome rather than a screen of its own.
 */
export const INTRO_SEEN_KEY = "bn.intro_seen";

/**
 * The full physical display height, not the app's layout "window" height.
 *
 * On Android, `useWindowDimensions()` reports the *window* — which can be
 * shorter than the actual screen when the OS reserves space for the
 * navigation bar — while `Dimensions.get("screen")` is the true display
 * size. Sizing the full-bleed photo to `window` left a sliver at the very
 * bottom (the reserved nav-bar strip) unpainted, showing the plain page
 * background through it instead of the photo. `screen` is always >= window,
 * so using it here only ever adds harmless overscan behind the (transparent,
 * edge-to-edge) system bar — it never crops anything.
 */
function useScreenSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => Dimensions.get("screen"));
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => setSize(screen));
    return () => sub.remove();
  }, []);
  return size;
}

export default function IntroScreen(): React.ReactElement {
  useThemeSync();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { height: screenHeight } = useScreenSize();
  const [phase, setPhase] = useState<"splash" | "slides">("splash");
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  // Onboarding's endpoint is Welcome directly — A4 (location permission) is
  // now a modal Welcome shows itself, not a screen in between.
  const finish = useCallback(() => {
    void AsyncStorage.setItem(INTRO_SEEN_KEY, "true").catch(() => {});
    router.replace("/(auth)/welcome");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPhase("slides"), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const onMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  const next = useCallback(() => {
    if (index >= SLIDES.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true });
    setIndex(index + 1);
  }, [finish, index, width]);

  if (phase === "splash") return <Splash />;

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={[styles.root, { width, height: screenHeight }]}>
      {/* Android still needs explicit system-bar styling here. On iOS, React
          Native's StatusBar manager uses a deprecated UIApplication API under
          UIViewControllerBasedStatusBarAppearance=false, so leave iOS on the
          app-level plist default instead of calling setStyle from JS. */}
      {Platform.OS === "android" ? (
        <StatusBar style="light" backgroundColor="transparent" translucent />
      ) : null}

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        keyExtractor={(item) => item.eyebrow}
        style={[styles.list, { width, height: screenHeight }]}
        renderItem={({ item }) => (
          <View style={{ width, height: screenHeight }}>
            <Image
              source={item.image}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
              accessibilityIgnoresInvertColors
            />
            {/* Full-height scrim: legible at the top (status bar, Skip),
                lightest around a third of the way down so the photo actually
                reads, then steadily darkening to fully solid by the very
                bottom. That last stop has to be 100% opaque, not just dark —
                a bright patch in a real photo (wet road, bokeh) still showed
                through at 94% right behind the footer, which is exactly
                where the button needs a dependable, photo-proof background. */}
            <LinearGradient
              colors={[
                alpha(colors.deep, 0.5),
                alpha(colors.deep, 0.18),
                alpha(colors.deep, 0.58),
                alpha(colors.deep, 0.9),
                colors.deep,
              ]}
              locations={[0, 0.3, 0.56, 0.8, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View
              style={[
                styles.slideBody,
                { paddingBottom: FOOTER_CLEARANCE + insets.bottom },
              ]}
            >
              <Text variant="eyebrow" color={colors.acc}>
                {item.eyebrow}
              </Text>
              <Text variant="hero" color={colors.onDeep} style={styles.headline}>
                {item.headline}
              </Text>
              <Text
                variant="bodyLg"
                color={alpha(colors.onDeep, 0.78)}
                style={styles.slideText}
              >
                {item.body}
              </Text>
              {item.proof ? (
                <View style={styles.proof}>
                  {item.proof.map((line) => (
                    <View key={line} style={styles.proofRow}>
                      <ShieldTick />
                      <Text
                        variant="label"
                        color={alpha(colors.onDeep, 0.92)}
                        style={{ flex: 1 }}
                      >
                        {line}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        )}
      />

      {/* Skip is always reachable, per the artboard. */}
      <Pressable
        onPress={finish}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Skip the introduction"
        style={[styles.skip, { top: insets.top + 6 }]}
      >
        <Text variant="label" color={colors.acc} style={{ fontSize: 13.5 }}>
          Skip
        </Text>
      </Pressable>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 22 }]}
        pointerEvents="box-none"
      >
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.eyebrow}
              style={[
                styles.dot,
                dotIndex === index
                  ? { width: 26, backgroundColor: colors.acc }
                  : { width: 8, backgroundColor: alpha(colors.onDeep, 0.32) },
              ]}
            />
          ))}
        </View>
        <Button
          label={isLast ? "Get started" : "Next"}
          onPress={next}
          style={{ marginTop: 22 }}
          testID="intro-next"
        />
      </View>
    </View>
  );
}

/**
 * A1 · Splash.
 *
 * The progress bar is mounted behind a timer, and it does not animate under
 * reduce-motion — a sweeping bar is exactly the kind of ambient movement that
 * setting exists to suppress.
 */
function Splash(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [showBar, setShowBar] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => setShowBar(true), LOADER_DELAY_MS);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showBar || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1600, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, showBar, sweep]);

  return (
    <View style={styles.root}>
      <View style={styles.splashCentre}>
        <View style={styles.mark}>
          <ShieldMark />
        </View>
        <Text variant="displayLg" color={colors.t0} center style={styles.splashTitle}>
          BlackNexa
        </Text>
        <Text
          variant="eyebrow"
          color={colors.t3}
          center
          style={styles.splashTagline}
        >
          Document · Preserve · Connect
        </Text>
      </View>

      {showBar ? (
        <View style={[styles.barTrack, { bottom: Math.max(insets.bottom, 12) + 56 }]}>
          {reduceMotion ? (
            <View style={[styles.barFill, { width: "32%" }]} />
          ) : (
            <Animated.View
              style={[
                styles.barFill,
                {
                  width: "32%",
                  transform: [
                    {
                      translateX: sweep.interpolate({
                        inputRange: [0, 1],
                        // -120% to 420% of the 118px track, matching the design's
                        // `bnBar` keyframes.
                        outputRange: [-142, 496],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** The brand shield, drawn once and reused by the splash and A10. */
export function ShieldMark({ size = 30 }: { size?: number }): React.ReactElement {
  return (
    <View style={{ width: size, height: size * 1.13, alignItems: "center" }}>
      <View
        style={{
          width: size,
          height: size * 1.13,
          borderWidth: 1.7,
          borderColor: colors.acc,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottomLeftRadius: size * 0.45,
          borderBottomRightRadius: size * 0.45,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: size * 0.36,
          width: 1.7,
          height: size * 0.3,
          backgroundColor: colors.acc,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: size * 0.48,
          width: size * 0.3,
          height: 1.7,
          backgroundColor: colors.acc,
        }}
      />
    </View>
  );
}

/**
 * The proof-row mark — a solid accent disc with a white check, per the
 * artboard. Filled (not outlined) because it now sits on a photograph rather
 * than a white card, where a low-opacity outline would disappear.
 */
function ShieldTick(): React.ReactElement {
  return (
    <View style={styles.proofMark}>
      <Check size={12} color={colors.onAcc} strokeWidth={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // Without an explicit flex, a horizontal FlatList inside a flex column
  // sizes to its own content rather than the space actually available on
  // screen.
  list: { flex: 1 },

  splashCentre: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 70 },
  splashTitle: {
    fontSize: 36,
    lineHeight: 46,
    marginTop: 18,
    paddingTop: 2,
    paddingHorizontal: 16,
  },
  splashTagline: {
    letterSpacing: 2.3,
    lineHeight: 18,
    marginTop: 10,
    paddingTop: 2,
    paddingHorizontal: 24,
  },
  mark: {
    width: 68,
    height: 68,
    borderRadius: 21,
    backgroundColor: colors.s6,
    borderWidth: 1,
    borderColor: alpha(colors.acc, 0.34),
    alignItems: "center",
    justifyContent: "center",
  },
  barTrack: {
    position: "absolute",
    alignSelf: "center",
    left: "50%",
    marginLeft: -59,
    width: 118,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: alpha(colors.t0, 0.09),
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2, backgroundColor: colors.acc },

  // Bottom-anchored over the full-bleed photo, rather than a block below it.
  slideBody: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 26,
    paddingTop: 4,
  },
  headline: { marginTop: 14 },
  slideText: { marginTop: 14, maxWidth: 320 },
  proof: { marginTop: 22, gap: 12 },
  proofRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  proofMark: {
    width: 19,
    height: 19,
    borderRadius: 6,
    backgroundColor: colors.acc,
    alignItems: "center",
    justifyContent: "center",
  },

  skip: { position: "absolute", right: 20, paddingHorizontal: 4, paddingVertical: 9 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 26, paddingTop: 8 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { height: 4, borderRadius: 2 },
});
