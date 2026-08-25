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
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";

interface Slide {
  eyebrow: string;
  headline: string;
  body: string;
  /** A3 adds two icon proof-rows; A2 has none. */
  proof?: string[];
}

const SLIDES: Slide[] = [
  {
    eyebrow: "Document",
    headline: "What happened to you is not going to disappear.",
    body: "Write it down in ninety seconds. Come back and finish it when you can.",
  },
  {
    eyebrow: "Preserve",
    headline: "Sealed the moment it arrives.",
    body: "Photos, video and audio are sealed on upload, so a later change would show.",
    proof: [
      "Every file is sealed and timestamped",
      "Only you and a moderator can open it",
    ],
  },
  {
    eyebrow: "Connect",
    headline: "Help that has already been checked.",
    body: "180 legal, health and crisis organisations, each one confirmed by a person.",
    proof: [
      "Every organisation is checked and dated",
      "Crisis lines work with no signal",
    ],
  },
];

/** A1's loader appears only after this delay. */
const LOADER_DELAY_MS = 600;
/** How long the splash holds before the carousel takes over. */
const SPLASH_MS = 1100;

export default function IntroScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get("window");
  const [phase, setPhase] = useState<"splash" | "slides">("splash");
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const finish = useCallback(() => router.replace("/(auth)/location"), []);

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
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        keyExtractor={(item) => item.eyebrow}
        renderItem={({ item }) => (
          <View style={{ width }}>
            <SlideArt />
            <View style={[styles.slideBody, { paddingBottom: 0 }]}>
              <Text variant="eyebrow" color={colors.acc}>
                {item.eyebrow}
              </Text>
              <Text variant="hero" color={colors.t0} style={styles.headline}>
                {item.headline}
              </Text>
              <Text variant="bodyLg" color={colors.t2} style={styles.slideText}>
                {item.body}
              </Text>
              {item.proof ? (
                <View style={styles.proof}>
                  {item.proof.map((line) => (
                    <View key={line} style={styles.proofRow}>
                      <ShieldTick />
                      <Text variant="label" color={colors.t1} style={{ flex: 1 }}>
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
        <Text variant="label" color={colors.t1} style={{ fontSize: 13.5 }}>
          Skip
        </Text>
      </Pressable>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 22 }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.eyebrow}
              style={[
                styles.dot,
                dotIndex === index
                  ? { width: 26, backgroundColor: colors.acc }
                  : { width: 8, backgroundColor: alpha(colors.t0, 0.22) },
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
        <Text variant="displayLg" color={colors.t0} center style={{ fontSize: 36, marginTop: 20 }}>
          BlackNexa
        </Text>
        <Text
          variant="eyebrow"
          color={colors.t3}
          center
          style={{ marginTop: 14, letterSpacing: 2.3 }}
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

/**
 * Stand-in for the full-bleed intro art.
 *
 * The design drops a photograph into an `image-slot` here. Until real art is
 * supplied, a token-derived gradient holds the space at the right height and
 * scrim so the type sits exactly where it will in the final build — rather than a
 * grey box that makes the layout look wrong.
 */
function SlideArt(): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ height: 330 + insets.top }}>
      <LinearGradient
        colors={[colors.s6, colors.s4, colors.bg]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[alpha(colors.deep, 0.12), "transparent", colors.bg]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
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

/** The small shield-and-tick used on A3's proof rows. */
function ShieldTick(): React.ReactElement {
  return (
    <View style={styles.proofMark}>
      <View style={styles.proofTickShort} />
      <View style={styles.proofTickLong} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  splashCentre: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 70 },
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

  slideBody: { paddingHorizontal: 26, paddingTop: 4 },
  headline: { marginTop: 14 },
  slideText: { marginTop: 14, maxWidth: 320 },
  proof: { marginTop: 22, gap: 12 },
  proofRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  proofMark: {
    width: 19,
    height: 19,
    borderRadius: 6,
    backgroundColor: alpha(colors.acc, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  proofTickShort: {
    position: "absolute",
    width: 4,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: colors.acc,
    transform: [{ rotate: "45deg" }, { translateX: -2.4 }, { translateY: 1.6 }],
  },
  proofTickLong: {
    position: "absolute",
    width: 8,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: colors.acc,
    transform: [{ rotate: "-45deg" }, { translateX: 1 }],
  },

  skip: { position: "absolute", right: 20, paddingHorizontal: 4, paddingVertical: 9 },
  footer: { paddingHorizontal: 26, paddingTop: 8 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { height: 4, borderRadius: 2 },
});

