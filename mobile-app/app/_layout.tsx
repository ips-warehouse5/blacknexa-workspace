/**
 * Root layout: fonts, providers, and the auth gate.
 *
 * ── Why the splash is held ─────────────────────────────────────────────────
 * Spectral and Work Sans carry the entire visual identity. Rendering before they
 * resolve shows a frame of system-font fallback, which reads as a broken app and
 * then reflows. So the native splash stays up until fonts are loaded *and* the
 * stored session has been checked — screen A1's caption makes the same point from
 * the other side: "The bar appears only after a delay, so a fast launch never
 * flashes a loader."
 *
 * ── Locked to light ──────────────────────────────────────────────────────
 * `app.json` sets `userInterfaceStyle: "light"` because the design has no dark
 * variant of the signal theme. The status bar is therefore dark-on-light, and the
 * Android navigation bar is painted to match the app surface rather than left
 * black behind the design's translucent footers.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";
import {
  Spectral_400Regular,
  Spectral_500Medium,
  Spectral_600SemiBold,
  Spectral_700Bold,
  Spectral_400Regular_Italic,
} from "@expo-google-fonts/spectral";
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
} from "@expo-google-fonts/work-sans";

import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { GeoLegalProvider } from "@/providers/GeoLegalProvider";
import { IncidentsProvider } from "@/providers/IncidentsProvider";
import { LocationProvider } from "@/providers/LocationProvider";
import { NewsProvider } from "@/providers/NewsProvider";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { colors } from "@/constants/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/**
 * Routes on auth status.
 *
 * Deliberately declarative: instead of imperatively pushing routes from screens,
 * the gate renders one of three stacks. A screen can never leave someone in a
 * state the gate disagrees with, and an involuntary sign-out mid-session swaps the
 * stack rather than leaving a dead screen mounted.
 */
function AuthGate(): React.ReactElement | null {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [splashHidden, setSplashHidden] = useState(false);

  const hideSplash = useCallback(async () => {
    if (splashHidden) return;
    setSplashHidden(true);
    await SplashScreen.hideAsync().catch(() => {});
  }, [splashHidden]);

  useEffect(() => {
    // Held until the session check settles, so a returning member never sees
    // Welcome flash before their feed.
    if (status !== "restoring") void hideSplash();
  }, [hideSplash, status]);

  useEffect(() => {
    if (status === "restoring") return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === "(auth)";
    const inOnboardingGroup = firstSegment === "(onboarding)";
    const isPublicRoute =
      firstSegment === "legal" ||
      firstSegment === "news" ||
      firstSegment === "incident" ||
      firstSegment === "r" ||
      firstSegment === "modal";

    if (status === "signedOut" && !inAuthGroup && !isPublicRoute) {
      router.replace("/(auth)/intro");
    } else if (status === "onboarding" && !inOnboardingGroup && !isPublicRoute) {
      router.replace("/(onboarding)/notifications");
    } else if (status === "signedIn" && (inAuthGroup || inOnboardingGroup)) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  if (status === "restoring") return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // The design's own transition: screens in a flow slide, nothing fades.
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
      <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />

      {/* Reachable from the signed-in stack. */}
      <Stack.Screen name="search" options={{ animation: "fade" }} />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/identity" />
      <Stack.Screen name="profile/defaults" />
      <Stack.Screen name="profile/notifications" />
      <Stack.Screen name="profile/security" />
      <Stack.Screen name="profile/account" />
      <Stack.Screen name="r/[ref]/index" />
      <Stack.Screen name="r/[ref]/owner" />
      <Stack.Screen name="r/[ref]/comments" />
      <Stack.Screen name="r/[ref]/edit" />
      <Stack.Screen
        name="r/[ref]/evidence/[index]"
        options={{ presentation: "fullScreenModal", animation: "fade" }}
      />

      {/* Reachable from every state. */}
      <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
      <Stack.Screen name="legal/lookup" options={{ headerShown: false }} />
      <Stack.Screen name="news/[id]" />
      <Stack.Screen name="incident/[id]" />
      <Stack.Screen
        name="report"
        options={{ presentation: "fullScreenModal", gestureEnabled: false }}
      />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout(): React.ReactElement | null {
  const [fontsLoaded, fontError] = useFonts({
    Spectral_400Regular,
    Spectral_500Medium,
    Spectral_600SemiBold,
    Spectral_700Bold,
    Spectral_400Regular_Italic,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
  });

  /**
   * Dark icons in the Android navigation bar.
   *
   * Expo 54 is edge-to-edge by default, so the bar is transparent and the app
   * paints behind it. Without this the system keeps light icons, which vanish
   * against the design's near-white `.97` footers.
   *
   * Only the button style is set: `setBackgroundColorAsync` is unsupported under
   * edge-to-edge, and the transparency is what we want anyway.
   */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setButtonStyleAsync("dark").catch(() => {});
  }, []);

  // A font that fails to load must not brick the app — better the system face
  // than a permanent splash screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style="dark" />
            <AuthProvider>
              <SettingsProvider>
                <IncidentsProvider>
                  <LocationProvider>
                    <NewsProvider>
                      <GeoLegalProvider>
                        <AuthGate />
                      </GeoLegalProvider>
                    </NewsProvider>
                  </LocationProvider>
                </IncidentsProvider>
              </SettingsProvider>
            </AuthProvider>
          </GestureHandlerRootView>
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
