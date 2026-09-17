import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronRight, Crosshair, Search } from "lucide-react-native";
import { alpha, colors, hairline, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useLocation, type UserLocation } from "@/providers/LocationProvider";

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

const RECENT_AREAS: AreaCandidate[] = [
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
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const currentLabel = location?.city && location.region
    ? `${location.city}, ${location.region}`
    : location?.label || "Not set";

  const recentAreas = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return RECENT_AREAS;

    return RECENT_AREAS.filter((area) =>
      [area.label, area.city, area.region].some((part) =>
        part.toLowerCase().includes(search),
      ),
    );
  }, [query]);

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
        label: `${area.city}, ${area.region}, ${area.country}`,
        capturedAt: new Date().toISOString(),
      };

      await setLocation(next);
      setQuery("");
    },
    [setLocation],
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
            {location
              ? "31 organisations · 14 local stories"
              : "Use current location or pick a recent area"}
          </Text>
        </View>
        {location ? <Check size={18} color={colors.acc} /> : null}
      </View>

      <Text variant="eyebrow" color={colors.t3} style={styles.sectionTitle}>
        RECENT
      </Text>
      <View style={styles.recentGroup}>
        {recentAreas.length > 0 ? (
          recentAreas.map((area, index) => {
            const selected =
              Boolean(location) &&
              location?.city === area.city &&
              location?.region === area.region;

            return (
              <Pressable
                key={area.label}
                onPress={() => chooseArea(area)}
                accessibilityRole="button"
                accessibilityLabel={`Set area to ${area.label}`}
                style={({ pressed }) => [
                  styles.recentRow,
                  { backgroundColor: colors.s0 },
                  index < recentAreas.length - 1
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
              No saved areas match that search.
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
