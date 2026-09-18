/**
 * Profile → Your area.
 *
 * The screen used to offer live GPS and two hardcoded "recent" cities, with a
 * search box that filtered those two and nothing else. It now searches real
 * places through `GET /locations/search` and saves the choice to the account
 * via `PATCH /users/me/area`, so the area survives a reinstall and follows the
 * member to a second device instead of living only in device state.
 *
 * Both writes still happen: `setLocation` keeps the device provider in step for
 * everything already reading it, and `saveArea` is what makes the choice
 * durable. If the network write fails the local one stands — the screen stays
 * usable and the next successful save reconciles it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronRight, Crosshair, Search } from "lucide-react-native";
import { alpha, colors, hairline, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useLocation, type UserLocation } from "@/providers/LocationProvider";
import { useAuth } from "@/providers/AuthProvider";
import locationsApi, { type LocationSearchResult } from "@/lib/api/locations";

/**
 * How long the field stays quiet before a search goes out.
 *
 * Long enough that typing "Atlanta" is one request rather than seven, short
 * enough that the list still feels like it is following along.
 */
const SEARCH_DEBOUNCE_MS = 320;

type AreaCandidate = {
  label: string;
  detail: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
};

/**
 * Shown when the field is empty and the member has no saved area yet.
 *
 * Kept as a starting point rather than a real "recents" list — the app stores no
 * search history, and inventing one would mean persisting what people looked up.
 */
const SUGGESTED_AREAS: AreaCandidate[] = [
  {
    label: "Brooklyn, NY",
    detail: "48 organisations",
    city: "Brooklyn",
    region: "NY",
    country: "United States",
    countryCode: "US",
    lat: 40.6782,
    lng: -73.9442,
  },
  {
    label: "Houston, TX",
    detail: "36 organisations",
    city: "Houston",
    region: "TX",
    country: "United States",
    countryCode: "US",
    lat: 29.7604,
    lng: -95.3698,
  },
];

export default function AreaScreen(): React.ReactElement {
  useThemeSync();
  const { location, status, canAskAgain, requestLocation, openSettings, setLocation } = useLocation();
  const { user, saveArea } = useAuth();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<LocationSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  /**
   * Guards against an out-of-order response overwriting a newer one.
   *
   * Typing "Atlanta" then "Austin" can land Atlanta's slower reply last, which
   * would leave the list showing results for a query the field no longer holds.
   */
  const latestQuery = useRef("");

  /**
   * The saved area wins over the device's position.
   *
   * Someone who deliberately set their area to Atlanta while travelling should
   * keep seeing Atlanta, not wherever the phone woke up.
   */
  const currentLabel =
    user?.area?.label ||
    (location?.city && location.region
      ? `${location.city}, ${location.region}`
      : location?.label) ||
    "Not set";

  const trimmedQuery = query.trim();
  const searchMode = trimmedQuery.length >= 2;

  useEffect(() => {
    if (!searchMode) {
      setResults(null);
      setSearching(false);
      return;
    }
    latestQuery.current = trimmedQuery;
    setSearching(true);
    const timer = setTimeout(async () => {
      const hits = await locationsApi.search(trimmedQuery);
      // Ignore a reply for a query the field has already moved past.
      if (latestQuery.current !== trimmedQuery) return;
      setResults(hits);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchMode, trimmedQuery]);

  /** What the list renders: live hits while searching, suggestions otherwise. */
  const rows = useMemo<AreaCandidate[]>(() => {
    if (!searchMode) return SUGGESTED_AREAS;
    return (results ?? []).map((hit) => {
      // The server sends one composed label; split it back into the parts
      // `UserLocation` wants rather than asking the API for a second shape.
      const [city, region = "", country = ""] = hit.label.split(",").map((p) => p.trim());
      return {
        label: hit.label,
        detail: "Tap to set as your area",
        city,
        region,
        country,
        countryCode: "",
        lat: hit.lat,
        lng: hit.lng,
      };
    });
  }, [results, searchMode]);

  // Once denied permanently, re-requesting just silently resolves to denied
  // again — the only way to recover is the OS settings screen.
  const deniedForever = status === "denied" && !canAskAgain;

  const refresh = useCallback(async () => {
    if (deniedForever) {
      await openSettings();
      return;
    }
    setBusy(true);
    try {
      await requestLocation();
    } finally {
      setBusy(false);
    }
  }, [deniedForever, openSettings, requestLocation]);

  const chooseArea = useCallback(
    async (area: AreaCandidate) => {
      const next: UserLocation = {
        lat: area.lat,
        lng: area.lng,
        city: area.city,
        region: area.region,
        country: area.country,
        countryCode: area.countryCode,
        label: [area.city, area.region, area.country].filter(Boolean).join(", "),
        capturedAt: new Date().toISOString(),
      };

      // Local first, so the screen updates even if the round trip is slow or
      // fails; the account write is what makes the choice outlive this install.
      await setLocation(next);
      await saveArea({ label: area.label, lat: area.lat, lng: area.lng });
      setQuery("");
      setResults(null);
    },
    [saveArea, setLocation],
  );

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-area">
      <BackHeader title="Your area" onBack={() => router.back()} padding={0} />

      <View style={[styles.searchBox, { backgroundColor: colors.s3 }]}>
        <Search size={16} color={colors.t4} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="City or ZIP code"
          placeholderTextColor={colors.t4}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.t0 }]}
          accessibilityLabel="Search city or ZIP code"
        />
      </View>

      <Text variant="bodySm" color={colors.t2} style={styles.intro}>
        Sets what Local means for news, which organisations you see first, and
        the area shown on your reports.
      </Text>

      <Pressable
        onPress={refresh}
        accessibilityRole="button"
        accessibilityLabel={deniedForever ? "Open Settings to enable location" : "Use my current location"}
        style={({ pressed }) => [
          styles.locationAction,
          { backgroundColor: colors.s3 },
          pressed ? styles.pressed : null,
        ]}
      >
        <Crosshair size={20} color={colors.acc} />
        <View style={styles.rowCopy}>
          <Text variant="labelLg" color={colors.t0}>
            {deniedForever ? "Open Settings to enable location" : "Use my current location"}
          </Text>
          <Text variant="bodySm" color={colors.t3} style={styles.rowDetail}>
            {busy || status === "requesting"
              ? "Locating this device..."
              : status === "granted"
                ? "Location is on for this app"
                : deniedForever
                  ? "Location was denied — enable it in Settings"
                  : "Location is off for this app"}
          </Text>
        </View>
      </Pressable>

      <Text variant="eyebrow" color={colors.t3} style={styles.sectionTitle}>
        CURRENT
      </Text>
      <View style={[styles.currentCard, { backgroundColor: colors.s4 }]}>
        <View style={styles.rowCopy}>
          <Text variant="labelLg" color={colors.t0}>
            {currentLabel}
          </Text>
          <Text variant="bodySm" color={colors.t3} style={styles.rowDetail}>
            {user?.area
              ? "Saved to your account"
              : location
                ? "From this device — search to save one to your account"
                : "Use current location or search for a city"}
          </Text>
        </View>
        {user?.area || location ? <Check size={18} color={colors.acc} /> : null}
      </View>

      <View style={styles.listHeader}>
        <Text variant="eyebrow" color={colors.t3}>
          {searchMode ? "RESULTS" : "SUGGESTED"}
        </Text>
        {searching ? <ActivityIndicator size="small" color={colors.t3} /> : null}
      </View>
      <View style={styles.recentGroup}>
        {rows.length > 0 ? (
          rows.map((area, index) => {
            const selected = user?.area
              ? user.area.label === area.label
              : Boolean(location) &&
                location?.city === area.city &&
                location?.region === area.region;

            return (
              <Pressable
                key={`${area.label}-${area.lat},${area.lng}`}
                onPress={() => chooseArea(area)}
                accessibilityRole="button"
                accessibilityLabel={`Set area to ${area.label}`}
                style={({ pressed }) => [
                  styles.recentRow,
                  { backgroundColor: colors.s0 },
                  index < rows.length - 1
                    ? {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: alpha(colors.t0, hairline.row),
                      }
                    : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.rowCopy}>
                  <Text variant="labelLg" color={colors.t0}>
                    {area.label}
                  </Text>
                  <Text variant="bodySm" color={colors.t3} style={styles.rowDetail}>
                    {area.detail}
                  </Text>
                </View>
                {selected ? (
                  <Check size={18} color={colors.acc} />
                ) : (
                  <ChevronRight size={17} color={colors.t3} />
                )}
              </Pressable>
            );
          })
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.s3 }]}>
            <Text variant="bodySm" color={colors.t3}>
              {searching
                ? "Searching…"
                : "No places match that search. Check the spelling, or try the city without the state."}
            </Text>
          </View>
        )}
      </View>

      <Text variant="metaSm" color={colors.t4} style={styles.footnote}>
        Changing your area does not change the area saved on reports you already
        filed.
      </Text>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    minHeight: 46,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  intro: {
    marginTop: 12,
    lineHeight: 20,
  },
  locationAction: {
    minHeight: 58,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 9,
  },
  listHeader: {
    marginTop: 18,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  currentCard: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recentGroup: {
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  recentRow: {
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowCopy: {
    flex: 1,
  },
  rowDetail: {
    marginTop: 3,
  },
  emptyCard: {
    padding: 16,
    borderRadius: radius.xl,
  },
  footnote: {
    marginTop: 16,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.82,
  },
});
