import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { GeoLegalProvider } from "@/providers/GeoLegalProvider";
import { IncidentsProvider } from "@/providers/IncidentsProvider";
import { LocationProvider } from "@/providers/LocationProvider";
import { NewsProvider } from "@/providers/NewsProvider";
import { SettingsProvider, useSettings } from "@/providers/SettingsProvider";
import { LEGAL_VERSION } from "@/constants/legal";
import Colors from "@/constants/colors";

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
      settings.consentTos &&
      settings.consentPrivacy &&
      settings.consentVersion >= LEGAL_VERSION;
    const first = segments[0] as string | undefined;
    const isOnboarding = first === "onboarding";
    const isLegal = first === "legal";
    if (!consented && !isOnboarding && !isLegal) {
      console.log("[BlackNexa] Routing to onboarding (no consent)");
      router.replace("/onboarding");
    }
  }, [isLoading, settings, segments, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.bg },
        headerTintColor: Colors.text,
        headerTitleStyle: { color: Colors.text, fontWeight: "700" },
        contentStyle: { backgroundColor: Colors.bg },
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
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <IncidentsProvider>
            <LocationProvider>
              <NewsProvider>
                <GeoLegalProvider>
                  <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
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
