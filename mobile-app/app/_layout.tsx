import {
  useFonts,
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
} from "@expo-google-fonts/work-sans";
import {
  Spectral_400Regular,
  Spectral_400Regular_Italic,
  Spectral_500Medium,
  Spectral_600SemiBold,
  Spectral_700Bold,
} from "@expo-google-fonts/spectral";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { GeoLegalProvider } from "@/providers/GeoLegalProvider";
import { IncidentsProvider } from "@/providers/IncidentsProvider";
import { LocationProvider } from "@/providers/LocationProvider";
import { NewsProvider } from "@/providers/NewsProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";
import { LEGAL_VERSION } from "@/constants/legal";
import Colors from "@/constants/colors";
import { fontFamily } from "@/constants/theme";
import { installNetworkLogger } from "@/utils/networkLogger";
import "@/utils/apiClient";

// Safety net: any Text/TextInput that doesn't explicitly set a fontFamily
// (e.g. missed spots, third-party components) still renders in Work Sans
// rather than silently falling back to the OS system font.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [
  { fontFamily: fontFamily.regular },
  (Text as any).defaultProps.style,
];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [
  { fontFamily: fontFamily.regular },
  (TextInput as any).defaultProps.style,
];

// Installed before any provider mounts so the very first API calls are captured.
// No-op outside development.
installNetworkLogger();

SplashScreen.preventAutoHideAsync().catch(() => {});

console.log("[BlackNexa] Root layout mounted");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function ConsentGate({ children }: { children: React.ReactNode }) {
  const { settings, isLoading } = useSettings();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const consented =
      Boolean(settings.consentTos) &&
      Boolean(settings.consentPrivacy) &&
      Number(settings.consentVersion) >= LEGAL_VERSION;

    const first = segments[0] as string | undefined;
    const isOnboarding = first === "onboarding";
    const isLegal = first === "legal";

    if (!consented && !isOnboarding && !isLegal) {
      console.log("[BlackNexa] Routing to onboarding (no consent)");
      router.replace("/onboarding");
    } else if (consented && isOnboarding) {
      console.log("[BlackNexa] User consented, routing to tabs");
      router.replace("/(tabs)");
    }
  }, [isLoading, settings.consentTos, settings.consentPrivacy, settings.consentVersion, segments, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          color: Colors.text,
          fontWeight: "700",
          fontFamily: fontFamily.bold,
        },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="onboarding"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="report"
        options={{
          presentation: "modal",
          title: "Report an Incident",
          headerStyle: { backgroundColor: Colors.surface },
        }}
      />
      <Stack.Screen
        name="incident/[id]"
        options={{ title: "Incident", headerBackTitle: "Feed" }}
      />
      <Stack.Screen
        name="news/[id]"
        options={{ headerShown: false, title: "Briefing" }}
      />
      <Stack.Screen name="legal/terms" options={{ title: "Terms of Service" }} />
      <Stack.Screen
        name="legal/privacy"
        options={{ title: "Privacy Policy" }}
      />
      <Stack.Screen
        name="legal/lookup"
        options={{ title: "Legal Resources" }}
      />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
    Spectral_400Regular,
    Spectral_400Regular_Italic,
    Spectral_500Medium,
    Spectral_600SemiBold,
    Spectral_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <IncidentsProvider>
            <LocationProvider>
              <NewsProvider>
                <GeoLegalProvider>
                  <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
                    <StatusBar style="light" />
                    <ConsentGate>
                      <RootLayoutNav />
                    </ConsentGate>
                  </GestureHandlerRootView>
                </GeoLegalProvider>
              </NewsProvider>
            </LocationProvider>
          </IncidentsProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
