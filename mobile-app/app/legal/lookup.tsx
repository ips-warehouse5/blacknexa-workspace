/**
 * BlackNexa™ Geo-Legal Lookup Screen
 *
 * User enters or GPS-detects their location, sees their jurisdiction profile
 * with legal frameworks, oversight agencies, and press contacts — all
 * translated into their selected language.
 *
 * Trademark pending with the USPTO. BlackNexa™ — By the people, for the people.
 */

import { Stack } from "expo-router";
import * as Location from "expo-location";
import {
  ChevronRight,
  Globe,
  Loader,
  MapPin,
  Search,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import BrandMark from "@/components/BrandMark";
import LegalResourceCard from "@/components/LegalResourceCard";
import { useGeoLegal } from "@/providers/GeoLegalProvider";
import { useLocation } from "@/providers/LocationProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { fontFamily } from "@/constants/theme";
import {
  COMMON_COUNTRIES,
  GLOBAL_RESOURCE_REGIONS,
  type GlobalResourceRegion,
  type JurisdictionProfile,
} from "@/constants/geo-legal";

export default function LegalLookupScreen(): React.ReactElement {
  const { lookupJurisdiction, currentProfile } = useGeoLegal();
  const { location, requestLocation } = useLocation();
  const { settings } = useSettings();

  const [countryInput, setCountryInput] = useState<string>("US");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<JurisdictionProfile | null>(null);

  const handleLookup = useCallback(
    async (country: string) => {
      if (!country.trim()) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await lookupJurisdiction({
          country: country.trim().toUpperCase(),
          lang: settings.preferredLanguage || "en",
        });
        if (!result) {
          setError("Could not resolve jurisdiction. Check your connection and try again.");
          setProfile(null);
        } else {
          setProfile(result);
        }
      } catch (e) {
        setError("Lookup failed. Please try again.");
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    },
    [lookupJurisdiction, settings.preferredLanguage],
  );

  const handleGpsLookup = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await requestLocation();
      const loc = location;
      if (loc) {
        const result = await lookupJurisdiction({
          country: loc.countryCode || "US",
          lat: loc.lat,
          lng: loc.lng,
          lang: settings.preferredLanguage || "en",
        });
        if (result) {
          setProfile(result);
          setCountryInput(loc.countryCode || "US");
        } else {
          setError("Could not resolve jurisdiction from GPS.");
        }
      } else {
        setError("Location permission needed to detect your jurisdiction.");
      }
    } catch {
      setError("GPS lookup failed. Enter your country code manually.");
    } finally {
      setIsLoading(false);
    }
  }, [lookupJurisdiction, requestLocation, location, settings.preferredLanguage]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Legal Resources",
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <BrandMark variant="chip" style={styles.brandChip} testID="legal-brand" />

          {/* Intro */}
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Globe size={18} color={Colors.gold} />
            </View>
            <Text style={styles.introTitle}>Geo-Legal Resource Center</Text>
            <Text style={styles.introText}>
              Discover the legal frameworks, oversight agencies, and press
              contacts for your jurisdiction — translated into your language.
            </Text>
          </View>

          {/* Lookup controls */}
          <View style={styles.lookupBox}>
            <View style={styles.inputRow}>
              <Globe size={16} color={Colors.textSecondary} />
              <TextInput
                value={countryInput}
                onChangeText={(t) => setCountryInput(t.toUpperCase().slice(0, 2))}
                placeholder="Country code (e.g. US, GB, DE)"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                autoCapitalize="characters"
                testID="legal-country-input"
              />
              <Pressable
                onPress={() => handleLookup(countryInput)}
                disabled={isLoading || !countryInput.trim()}
                style={[styles.searchBtn, (isLoading || !countryInput.trim()) && styles.searchBtnDisabled]}
                testID="legal-search-btn"
              >
                {isLoading ? (
                  <Loader size={15} color={Colors.gold} />
                ) : (
                  <Search size={15} color={Colors.gold} />
                )}
                <Text style={styles.searchBtnText}>Look up</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleGpsLookup}
              disabled={isLoading}
              style={styles.gpsBtn}
              testID="legal-gps-btn"
            >
              <MapPin size={14} color={Colors.gold} />
              <Text style={styles.gpsBtnText}>Use my location</Text>
            </Pressable>
          </View>

          {/* Quick country chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {COMMON_COUNTRIES.map((c) => (
              <Pressable
                key={c.code}
                onPress={() => {
                  setCountryInput(c.code);
                  handleLookup(c.code);
                }}
                style={[
                  styles.countryChip,
                  countryInput === c.code && styles.countryChipActive,
                ]}
              >
                <Text style={styles.countryChipFlag}>{c.flag}</Text>
                <Text
                  style={[
                    styles.countryChipText,
                    countryInput === c.code && styles.countryChipTextActive,
                  ]}
                >
                  {c.code}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {error && (
            <View style={styles.errorBox}>
              <X size={14} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Results */}
          {profile && (
            <View style={styles.resultsContainer}>
              <LegalResourceCard profile={profile} testID="legal-resource-card" />
            </View>
          )}

          {!profile && !isLoading && (
            <View style={styles.regionsSection}>
              <View style={styles.regionsHeader}>
                <Text style={styles.regionsTitle}>Global Resource Regions</Text>
                <Text style={styles.regionsSubtitle}>
                  Uniform anti-discrimination resource centers across{" "}
                  {GLOBAL_RESOURCE_REGIONS.length} supported regions. Tap a
                  country to load its full legal profile.
                </Text>
              </View>
              {GLOBAL_RESOURCE_REGIONS.map((region: GlobalResourceRegion) => (
                <View key={region.id} style={styles.regionCard} testID={`region-${region.id}`}>
                  <View style={styles.regionTitleRow}>
                    <Text style={styles.regionFlag}>{region.flag}</Text>
                    <Text style={styles.regionName}>{region.displayName}</Text>
                  </View>
                  <Text style={styles.regionFocus}>{region.primaryFocus}</Text>
                  <Text style={styles.regionMetaLabel}>ROUTING AUTHORITIES</Text>
                  <Text style={styles.regionMetaText}>
                    {region.authorities.join(" \u2022 ")}
                  </Text>
                  <Text style={styles.regionMetaLabel}>PRESS ROUTING</Text>
                  <Text style={styles.regionMetaText}>
                    {region.pressRouting.join(" \u2022 ")}
                  </Text>
                  <View style={styles.regionCodesRow}>
                    {region.countryCodes.map((code) => (
                      <Pressable
                        key={code}
                        onPress={() => {
                          setCountryInput(code);
                          handleLookup(code);
                        }}
                        style={styles.regionCodeChip}
                        testID={`region-code-${code}`}
                      >
                        <Text style={styles.regionCodeText}>{code}</Text>
                        <ChevronRight size={12} color={Colors.gold} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 60 },
  brandChip: { marginBottom: 14 },
  intro: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  introIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.gold + "1A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  introTitle: { fontSize: 15, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text, marginBottom: 4 },
  introText: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17 },
  lookupBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700", fontFamily: fontFamily.bold,
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.gold + "18",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  searchBtnDisabled: { opacity: 0.5 },
  searchBtnText: { fontSize: 12, color: Colors.gold, fontWeight: "700", fontFamily: fontFamily.bold },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSecondary,
  },
  gpsBtnText: { fontSize: 12, color: Colors.gold, fontWeight: "700", fontFamily: fontFamily.bold },
  chipsRow: { gap: 8, paddingBottom: 14, marginBottom: 6 },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countryChipActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + "14" },
  countryChipFlag: { fontSize: 16 },
  countryChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "700", fontFamily: fontFamily.bold },
  countryChipTextActive: { color: Colors.gold },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: Colors.error + "0D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.error + "33",
    marginBottom: 14,
  },
  errorText: { fontSize: 12, color: Colors.error, flex: 1 },
  resultsContainer: {
    flex: 1,
    minHeight: 400,
    backgroundColor: Colors.background,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.textSecondary },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 30,
  },
  regionsSection: { gap: 12 },
  regionsHeader: { marginBottom: 2 },
  regionsTitle: { fontSize: 15, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text, marginBottom: 4 },
  regionsSubtitle: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  regionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  regionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  regionFlag: { fontSize: 18 },
  regionName: { fontSize: 14, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.text, flex: 1 },
  regionFocus: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  regionMetaLabel: {
    fontSize: 9.5,
    fontWeight: "700", fontFamily: fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 3,
  },
  regionMetaText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16, marginBottom: 8 },
  regionCodesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  regionCodeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.gold + "14",
    borderWidth: 1,
    borderColor: Colors.gold + "44",
  },
  regionCodeText: { fontSize: 12, fontWeight: "700", fontFamily: fontFamily.bold, color: Colors.gold },
});
