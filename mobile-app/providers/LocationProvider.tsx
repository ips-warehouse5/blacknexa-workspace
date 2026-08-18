import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import type { NewsArticle } from "@/mocks/news";
import { useSettings } from "@/providers/SettingsProvider";
import { LEGAL_VERSION } from "@/constants/legal";

/**
 * UserLocation — a one-shot geographical fix plus reverse-geocoded place
 * names. Cached in AsyncStorage so repeat launches don't re-prompt for
 * permission or burn battery on a fresh GPS lookup.
 */
export type UserLocation = {
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  /** Human-readable label, e.g. "Atlanta, GA, United States". */
  label: string;
  /** ISO timestamp of the last successful fix. */
  capturedAt: string;
};

const LOCATION_KEY = "blacknexa.location.v1";
const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL;

type LocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";

type LocalFeedResponse = {
  success: boolean;
  total?: number;
  /** Number of results sourced from adjacent/nearby cities. */
  nearby?: number;
  /** True when the feed expanded beyond the home city. */
  expandedNearby?: boolean;
  location?: { city?: string; region?: string; country?: string; countryCode?: string };
  data?: NewsArticle[];
  error?: string;
};

async function loadCachedLocation(): Promise<UserLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserLocation;
  } catch {
    return null;
  }
}

async function persistLocation(loc: UserLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  } catch {
    /* non-fatal */
  }
}

/**
 * Request foreground location permission and capture a one-shot fix with
 * reverse geocoding. Returns null if the user denies or the device can't
 * provide a fix. Accuracy is set to ~1km so it's battery-friendly and
 * privacy-safe — we only need city/region-level granularity for news.
 */
async function captureLocation(): Promise<UserLocation | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });
  const { latitude, longitude } = pos.coords;

  let city = "";
  let region = "";
  let country = "";
  let countryCode = "";
  let label = "";

  try {
    const geo = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    const g = geo[0];
    if (g) {
      city = g.city ?? g.subregion ?? g.district ?? "";
      region = g.region ?? "";
      country = g.country ?? "";
      countryCode = g.isoCountryCode ?? "";
      label = [city, region, country].filter(Boolean).join(", ");
    }
  } catch {
    /* reverse geocoding can fail — we still have lat/lng */
  }

  if (!label) {
    label = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  }

  const loc: UserLocation = {
    lat: latitude,
    lng: longitude,
    city,
    region,
    country,
    countryCode,
    label,
    capturedAt: new Date().toISOString(),
  };
  await persistLocation(loc);
  return loc;
}

/**
 * Fetch the location-aware local feed from the Worker. The Worker ranks
 * existing articles by relevance to the reader's geography and triggers a
 * background local briefing when coverage is thin.
 */
async function fetchLocalFeed(
  loc: UserLocation,
  nearby: boolean,
  signal?: AbortSignal
): Promise<NewsArticle[]> {
  if (!FUNCTIONS_URL) return [];
  const params = new URLSearchParams({
    lat: String(loc.lat),
    lng: String(loc.lng),
    city: loc.city,
    region: loc.region,
    country: loc.country,
    countryCode: loc.countryCode,
    limit: "8",
    nearby: nearby ? "true" : "false",
  });
  const url = `${FUNCTIONS_URL}/api/v1/news/local?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Local feed failed (${res.status}).`);
  const json = (await res.json()) as LocalFeedResponse;
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(json.error ?? "Malformed local feed response.");
  }
  return json.data;
}

export const [LocationProvider, useLocation] = createContextHook(() => {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nearbyEnabled, setNearbyEnabled] = useState<boolean>(false);

  // Hydrate from AsyncStorage on mount so we have a location immediately.
  const cacheQuery = useQuery<UserLocation | null, Error>({
    queryKey: ["location_cached"],
    queryFn: loadCachedLocation,
    staleTime: Infinity,
  });

  const location = useMemo<UserLocation | null>(
    () => cacheQuery.data ?? null,
    [cacheQuery.data]
  );

  // Mark granted when a cached location is present.
  useEffect(() => {
    if (location) setStatus("granted");
  }, [location]);

  /**
   * Request permission and capture a fresh fix. Safe to call repeatedly —
   * if permission is already granted, expo-location returns it without
   * re-prompting.
   */
  const requestLocation = useCallback(async (): Promise<void> => {
    setStatus("requesting");
    setError(null);
    try {
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      if (existing === "denied") {
        setStatus("denied");
        setError("Location permission was denied.");
        return;
      }
      const loc = await captureLocation();
      if (loc) {
        await cacheQuery.refetch();
        setStatus("granted");
      } else {
        setStatus("denied");
        setError("Location permission was denied.");
      }
    } catch (e) {
      setStatus("unavailable");
      setError(e instanceof Error ? e.message : "Could not capture location.");
    }
  }, [cacheQuery]);

  const { settings } = useSettings();
  const isConsented = Boolean(
    settings.consentTos &&
    settings.consentPrivacy &&
    settings.consentVersion >= LEGAL_VERSION
  );

  // Auto-stamp location on first app load when no cached fix exists and user is consented.
  const autoRequestedRef = useRef(false);
  useEffect(() => {
    if (!isConsented) return;
    if (autoRequestedRef.current) return;
    if (cacheQuery.isLoading) return;
    autoRequestedRef.current = true;
    if (location) return; // already have a fix
    // Fire-and-forget — the user can deny and still use the app.
    void requestLocation();
  }, [isConsented, cacheQuery.isLoading, location, requestLocation]);

  /**
   * Open the device's app settings so the user can grant location permission.
   */
  const openSettings = useCallback(async (): Promise<void> => {
    try {
      await Linking.openSettings();
    } catch {
      /* non-fatal */
    }
  }, []);

  /**
   * Location-aware local feed. Refetches when the location or the Nearby
   * toggle changes. Stale after 60s so pull-to-refresh surfaces newly
   * generated local briefings.
   */
  const localFeedQuery = useQuery<NewsArticle[], Error>({
    queryKey: ["news_local", location?.lat, location?.lng, nearbyEnabled],
    queryFn: ({ signal }) => fetchLocalFeed(location!, nearbyEnabled, signal),
    enabled: Boolean(isConsented && location),
    staleTime: 60_000,
    refetchOnMount: true,
    retry: 1,
  });

  const localFeed = useMemo<NewsArticle[]>(() => localFeedQuery.data ?? [], [localFeedQuery.data]);

  const refetchLocal = useCallback(() => {
    void localFeedQuery.refetch();
  }, [localFeedQuery]);

  const toggleNearby = useCallback(() => {
    setNearbyEnabled((prev) => !prev);
  }, []);

  return {
    location,
    status,
    error,
    requestLocation,
    openSettings,
    localFeed,
    nearbyEnabled,
    toggleNearby,
    isLocalLoading: localFeedQuery.isLoading,
    isLocalRefetching: localFeedQuery.isFetching && !localFeedQuery.isLoading,
    localError: localFeedQuery.error,
    refetchLocal,
  };
});
