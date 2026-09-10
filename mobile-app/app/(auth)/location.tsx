/**
 * A4 · Location priming.
 *
 * Shown **before** the OS prompt, which is the point: "Nothing asks for
 * permission before it has explained why."
 *
 * On denial the cards stay and the headline swaps to "Location is off — that's
 * fine." — the screen does not nag, re-prompt, or dead-end. Either answer moves
 * forward, because A4's own footnote is "You can file a report without it."
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Camera, Newspaper, Scale, type LucideIcon } from "lucide-react-native";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button, { TextButton } from "@/components/ui/Button";
import { Screen, StickyFooter } from "@/components/ui/Screen";

export const INTRO_SEEN_KEY = "bn.intro_seen";

/**
 * One icon per benefit.
 *
 * These were a single hand-drawn empty square repeated three times, which read as
 * an unfinished placeholder rather than an icon — three identical blank boxes say
 * nothing about the three different things being promised. `lucide-react-native`
 * is what the other 28 icon sites in the app already use, so this screen no
 * longer draws its own primitives.
 */
const BENEFITS: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "Evidence capture",
    body: "A report carries where it happened, at the precision you choose.",
    Icon: Camera,
  },
  {
    title: "Local news",
    body: "Stories from your city instead of the whole country.",
    Icon: Newspaper,
  },
  {
    title: "Regional help",
    body: "Lawyers and clinics that actually serve where you are.",
    Icon: Scale,
  },
];

export default function LocationPrimingScreen(): React.ReactElement {
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const next = useCallback(() => {
    void AsyncStorage.setItem(INTRO_SEEN_KEY, "true").catch(() => {});
    router.replace("/(auth)/welcome");
  }, []);

  const allow = useCallback(async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        next();
        return;
      }
      // Denied: stay here and change what the screen says, rather than pushing on
      // as if nothing happened or re-asking.
      setDenied(true);
    } catch {
      setDenied(true);
    } finally {
      setBusy(false);
    }
  }, [next]);

  return (
    <Screen padding={0} testID="location-priming">
      <View style={{ flex: 1, paddingHorizontal: screenPadding.hero, paddingTop: 26 }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: radius.lg,
            backgroundColor: colors.s5,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PinGlyph />
        </View>

        <Text variant="displayMd" color={colors.t0} style={{ marginTop: 22, fontSize: 31 }}>
          {denied
            ? "Location is off — that's fine."
            : "Three things work better when we know your area"}
        </Text>

        <View style={{ gap: 10, marginTop: 24 }}>
          {BENEFITS.map((benefit) => (
            <View
              key={benefit.title}
              style={{
                flexDirection: "row",
                gap: 13,
                backgroundColor: colors.s3,
                borderRadius: radius.xl,
                padding: 15,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  backgroundColor: colors.s6,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <benefit.Icon size={17} color={colors.acc} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="labelLg" color={colors.t0}>
                  {benefit.title}
                </Text>
                <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 3 }}>
                  {benefit.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <StickyFooter padding={screenPadding.hero}>
        {denied ? (
          <Button label="Continue" onPress={next} testID="location-continue" />
        ) : (
          <>
            <Button
              label="Allow location"
              onPress={allow}
              loading={busy}
              testID="location-allow"
            />
            <TextButton label="Not now" onPress={next} testID="location-skip" />
            <Text variant="metaSm" color={colors.t4} center>
              You can file a report without it.
            </Text>
          </>
        )}
      </StickyFooter>
    </Screen>
  );
}

/** The 22px map pin from the artboard. */
function PinGlyph(): React.ReactElement {
  return (
    <View style={{ width: 22, height: 22, alignItems: "center" }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 1.7,
          borderColor: colors.acc,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 1,
          width: 2,
          height: 7,
          backgroundColor: colors.acc,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 5.5,
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: colors.acc,
        }}
      />
    </View>
  );
}
