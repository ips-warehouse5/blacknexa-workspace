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
 * ── Theme bridge ───────────────────────────────────────────────────────────
 * Settings owns the selected client-approved theme. The bridge below applies it
 * to shared tokens and system bars before the signed-in stacks render.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Platform, Pressable, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import * as LocalAuthentication from "expo-local-authentication";
import { INTRO_SEEN_KEY } from "@/app/(auth)/intro";
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
  WorkSans_400Regular_Italic,
} from "@expo-google-fonts/work-sans";

import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { GeoLegalProvider } from "@/providers/GeoLegalProvider";
import { IncidentsProvider } from "@/providers/IncidentsProvider";
import { LocationProvider } from "@/providers/LocationProvider";
import { NewsProvider } from "@/providers/NewsProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";
import { SnackbarProvider, SnackbarHost } from "@/providers/SnackbarProvider";
import { colors, setActiveTheme } from "@/constants/theme";
import Text from "@/components/ui/Text";

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
  const { status, biometricsAvailability } = useAuth();
  const { settings, isLoading: settingsLoading } = useSettings();
  const segments = useSegments();
  const router = useRouter();
  const [routeSettled, setRouteSettled] = useState(false);
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [biometricPrompting, setBiometricPrompting] = useState(false);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === "active",
  );
  const promptInFlight = useRef(false);
  const previousStatus = useRef(status);
  const firstSegment = segments[0] as string | undefined;
  const inAuthGroup = firstSegment === "(auth)";
  const inOnboardingGroup = firstSegment === "(onboarding)";
  const inOAuthRedirect = firstSegment === "oauthredirect";
  const isPublicRoute =
    inOAuthRedirect ||
    firstSegment === "legal" ||
    firstSegment === "news" ||
    firstSegment === "incident" ||
    firstSegment === "r" ||
    firstSegment === "modal";
  const routeNeedsRedirect =
    (status === "signedOut" && !inAuthGroup && !isPublicRoute) ||
    (status === "onboarding" && !inOnboardingGroup && !isPublicRoute) ||
    (status === "signedIn" && (inAuthGroup || inOnboardingGroup || inOAuthRedirect));
  const canShowCurrentRoute = routeSettled && !routeNeedsRedirect;
  const biometricLockEnabled =
    status === "signedIn" &&
    !settingsLoading &&
    settings.biometrics &&
    biometricsAvailability.available;

  const promptForBiometricUnlock = useCallback(async () => {
    if (!biometricLockEnabled || promptInFlight.current) return;
    promptInFlight.current = true;
    setBiometricPrompting(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock BlackNexa",
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
      });
      if (result.success) setBiometricUnlocked(true);
    } finally {
      promptInFlight.current = false;
      setBiometricPrompting(false);
    }
  }, [biometricLockEnabled]);

  useEffect(() => {
    if (!biometricLockEnabled) {
      setBiometricUnlocked(true);
      previousStatus.current = status;
      return;
    }

    // Ask on cold launch/session restore, not during a fresh login from Welcome.
    if (previousStatus.current === "restoring") {
      setBiometricUnlocked(false);
    } else {
      setBiometricUnlocked(true);
    }
    previousStatus.current = status;
  }, [biometricLockEnabled, status]);

  useEffect(() => {
    if (!appIsActive || !biometricLockEnabled || biometricUnlocked) return;
    void promptForBiometricUnlock();
  }, [
    appIsActive,
    biometricLockEnabled,
    biometricUnlocked,
    promptForBiometricUnlock,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppIsActive(active);
      if (!biometricLockEnabled) return;
      if (!active) {
        setBiometricUnlocked(false);
      }
    });
    return () => sub.remove();
  }, [biometricLockEnabled]);

  useEffect(() => {
    if (status === "restoring") {
      setRouteSettled(false);
      return;
    }

    if (status === "signedOut" && !inAuthGroup && !isPublicRoute) {
      setRouteSettled(false);
      AsyncStorage.getItem(INTRO_SEEN_KEY)
        .then((seen) => {
          if (seen === "true") {
            router.replace("/(auth)/welcome");
          } else {
            router.replace("/(auth)/intro");
          }
        })
        .catch(() => {
          router.replace("/(auth)/intro");
        });
    } else if (
      status === "onboarding" &&
      !inOnboardingGroup &&
      !isPublicRoute
    ) {
      setRouteSettled(false);
      router.replace("/(onboarding)/notifications");
    } else if (
      status === "signedIn" &&
      (inAuthGroup || inOnboardingGroup || inOAuthRedirect)
    ) {
      setRouteSettled(false);
      router.replace("/(tabs)");
    } else {
      setRouteSettled(true);
    }
  }, [
    inAuthGroup,
    inOAuthRedirect,
    inOnboardingGroup,
    isPublicRoute,
    router,
    status,
  ]);

  useEffect(() => {
    // Only release the splash screen once auth status AND initial target route are ready,
    // so no intermediate screen or tab bar ever flashes.
    if (status !== "restoring" && canShowCurrentRoute) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [status, canShowCurrentRoute]);

  if (status === "restoring") return null;

  if (biometricLockEnabled && !biometricUnlocked) {
    return (
      <BiometricLockScreen
        busy={biometricPrompting}
        onUnlock={promptForBiometricUnlock}
      />
    );
  }

  return (
    <View style={{ flex: 1, opacity: canShowCurrentRoute ? 1 : 0 }}>
      <Stack
        initialRouteName={status === "signedIn" ? "(tabs)" : "(auth)"}
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
        <Stack.Screen name="oauthredirect" options={{ animation: "fade" }} />

      {/* Reachable from the signed-in stack. */}
      <Stack.Screen name="search" options={{ animation: "fade" }} />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/settings" />
      <Stack.Screen name="profile/identity" />
      <Stack.Screen name="profile/defaults" />
      <Stack.Screen name="profile/notifications" />
      <Stack.Screen name="profile/security" />
      <Stack.Screen name="profile/account" />
      <Stack.Screen name="profile/account-info" />
      <Stack.Screen name="profile/change-password" />
      <Stack.Screen name="profile/area" />
      <Stack.Screen name="profile/help" />
      <Stack.Screen name="profile/contact" />
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
      <Stack.Screen
        name="legal/evidence-protection"
        options={{ headerShown: false }}
      />
      <Stack.Screen name="news/[id]" />
      <Stack.Screen name="incident/[id]" />
      <Stack.Screen
        name="report"
        options={{ presentation: "fullScreenModal", gestureEnabled: false }}
      />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}

function BiometricLockScreen({
  busy,
  onUnlock,
}: {
  busy: boolean;
  onUnlock: () => void;
}): React.ReactElement {
  return (
    <View style={styles.lockRoot}>
      <Image
        source={require("@/assets/images/splash-icon.png")}
        resizeMode="contain"
        style={styles.splashIcon}
      />
      {!busy ? (
        <Pressable
          accessibilityRole="button"
          onPress={onUnlock}
          style={styles.unlockFallback}
          testID="biometric-unlock-button"
        >
          <Text variant="buttonSm" color={colors.t3}>
            Unlock
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ThemedAppShell(): React.ReactElement {
  const { settings } = useSettings();
  const { status } = useAuth();
  const themeName = status === "signedIn" ? settings.theme : "signal";
  const isDark = themeName === "gold";

  setActiveTheme(themeName);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark").catch(
      () => {},
    );
  }, [isDark]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      {Platform.OS === "android" ? (
        <StatusBar
          style={isDark ? "light" : "dark"}
          backgroundColor={colors.bg}
          translucent={false}
        />
      ) : null}
      <LocationProvider>
        <IncidentsProvider>
          <NewsProvider>
            <GeoLegalProvider>
              {/*
                `colors` (constants/theme.ts) is a mutated shared object, not
                reactive state — screens that read `colors.xxx` opt into being
                told to re-render when it changes via `useThemeSync()` (called
                once per screen). See that hook's doc comment for why: the
                short version is that expo-router keeps prior screens mounted
                underneath the active one, so a screen visited before a theme
                toggle would otherwise stay stale until something else
                happened to re-render it. An earlier version of this fix keyed
                <AuthGate> by themeName to force a full remount instead — that
                broke navigation state (a theme toggle would reset the whole
                app back to its initial route), so it was replaced with the
                per-screen subscription instead.
              */}
              <AuthGate />
            </GeoLegalProvider>
          </NewsProvider>
        </IncidentsProvider>
      </LocationProvider>
    </GestureHandlerRootView>
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
    WorkSans_400Regular_Italic,
  });

  // A font that fails to load must not brick the app — better the system face
  // than a permanent splash screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <SnackbarProvider>
            <AuthProvider>
              <SettingsProvider>
                <ThemedAppShell />
              </SettingsProvider>
            </AuthProvider>
            <SnackbarHost />
          </SnackbarProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  lockRoot: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  splashIcon: {
    height: 200,
    width: 200,
  },
  unlockFallback: {
    bottom: 42,
    minHeight: 44,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  },
});
