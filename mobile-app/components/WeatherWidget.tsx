/**
 * WeatherWidget — fetches and displays real-time atmospheric data for the
 * user's GPS location using the BlackNexa weather intelligence endpoint.
 * Automatically refreshes when the location changes.
 */
import { useQuery } from "@tanstack/react-query";
import { Cloud, Droplets, Loader2, MapPin, RefreshCw, Wind } from "lucide-react-native";
import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import Colors from "@/constants/colors";
import { useLocation } from "@/providers/LocationProvider";

const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? "";

type WeatherData = {
  coordinates: { lat: number; lon: number };
  currentWeather: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    time?: string;
  };
};

/** WMO weather code → human-readable label + icon name. */
const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "sun" },
  1: { label: "Mainly clear", icon: "sun" },
  2: { label: "Partly cloudy", icon: "cloud" },
  3: { label: "Overcast", icon: "cloud" },
  45: { label: "Fog", icon: "cloud-fog" },
  48: { label: "Rime fog", icon: "cloud-fog" },
  51: { label: "Light drizzle", icon: "cloud-drizzle" },
  53: { label: "Drizzle", icon: "cloud-drizzle" },
  55: { label: "Heavy drizzle", icon: "cloud-drizzle" },
  61: { label: "Light rain", icon: "cloud-rain" },
  63: { label: "Rain", icon: "cloud-rain" },
  65: { label: "Heavy rain", icon: "cloud-rain" },
  71: { label: "Light snow", icon: "cloud-snow" },
  73: { label: "Snow", icon: "cloud-snow" },
  75: { label: "Heavy snow", icon: "cloud-snow" },
  80: { label: "Rain showers", icon: "cloud-rain" },
  81: { label: "Showers", icon: "cloud-rain" },
  82: { label: "Violent showers", icon: "cloud-rain" },
  95: { label: "Thunderstorm", icon: "cloud-lightning" },
  96: { label: "Storm + hail", icon: "cloud-lightning" },
  99: { label: "Severe storm", icon: "cloud-lightning" },
};

import { apiClient } from "@/utils/apiClient";

function weatherInfo(code: number): { label: string; icon: string } {
  return WEATHER_CODES[code] ?? { label: "—", icon: "cloud" };
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const json = await apiClient<{ success: boolean; data?: WeatherData; error?: string }>(
    "/api/v1/blacknexa/weather",
    {
      params: { lat, lon },
    }
  );
  if (!json.success || !json.data) throw new Error(json.error ?? "Weather data unavailable.");
  return json.data;
}

export default function WeatherWidget(): React.ReactElement | null {
  const { location, status } = useLocation();

  const weatherQuery = useQuery<WeatherData, Error>({
    queryKey: ["weather", location?.lat, location?.lng],
    queryFn: () => fetchWeather(location!.lat, location!.lng),
    enabled: Boolean(location && FUNCTIONS_URL),
    staleTime: 5 * 60_000,
    refetchOnMount: true,
    retry: 1,
  });

  const handleRefresh = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    void weatherQuery.refetch();
  }, [weatherQuery]);

  if (!location || status !== "granted") return null;

  const cw = weatherQuery.data?.currentWeather;
  const info = cw ? weatherInfo(cw.weather_code) : { label: "—", icon: "cloud" };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Cloud size={14} color={Colors.sky} />
          <Text style={styles.title}>ATMOSPHERIC INTELLIGENCE</Text>
        </View>
        <Pressable onPress={handleRefresh} style={styles.refreshBtn}>
          {weatherQuery.isFetching ? (
            <ActivityIndicator size="small" color={Colors.sky} />
          ) : (
            <RefreshCw size={11} color={Colors.textDim} />
          )}
        </Pressable>
      </View>

      <View style={styles.locationRow}>
        <MapPin size={10} color={Colors.sky} />
        <Text style={styles.locationText} numberOfLines={1}>
          {location.label}
        </Text>
      </View>

      {weatherQuery.isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.sky} />
          <Text style={styles.loadingText}>Reading atmospheric conditions…</Text>
        </View>
      ) : weatherQuery.error ? (
        <Text style={styles.errorText}>Weather stream unavailable.</Text>
      ) : cw ? (
        <View style={styles.dataGrid}>
          <View style={styles.dataCell}>
            <Text style={styles.tempValue}>{Math.round(cw.temperature_2m)}°</Text>
            <Text style={styles.dataLabel}>{info.label}</Text>
          </View>
          <View style={styles.dataCell}>
            <View style={styles.metricRow}>
              <Droplets size={11} color={Colors.sky} />
              <Text style={styles.metricValue}>{cw.relative_humidity_2m}%</Text>
            </View>
            <Text style={styles.dataLabel}>Humidity</Text>
          </View>
          <View style={styles.dataCell}>
            <View style={styles.metricRow}>
              <Wind size={11} color={Colors.sky} />
              <Text style={styles.metricValue}>{Math.round(cw.wind_speed_10m)}</Text>
            </View>
            <Text style={styles.dataLabel}>km/h wind</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.sky + "33",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.sky,
    letterSpacing: 0.6,
  },
  refreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textDim,
    flex: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.textMute,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 12,
    color: Colors.crimson,
    fontWeight: "600",
    paddingVertical: 8,
  },
  dataGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dataCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  tempValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text,
    letterSpacing: -1,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  dataLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textMute,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
