/**
 * C4 · Step 4 of 7 — Location.
 *
 * From the caption: "The map preview changes variant with the choice — pin, soft
 * radius with no pin, or blurred with a lock. Your default is labelled but never
 * pre-ticked."
 *
 * Two things follow that are easy to get wrong:
 *
 *   • **The preview is the answer to "what will people see".** Its caption says
 *     exactly that, so the three variants are not decoration — they are the only
 *     honest way to show what Hidden actually means before someone commits.
 *
 *   • **The default is labelled, not selected.** A9 sets a default precision and
 *     C4 shows it with a `YOUR DEFAULT` tag, but leaves the choice open. Publishing
 *     a location is consequential enough that it should be a fresh decision each
 *     time, and the tag is there to make the usual answer quick rather than automatic.
 *
 * ── What Hidden publishes ─────────────────────────────────────────────────
 * The server keeps the area name for a Hidden report and drops the coordinates
 * ("Hidden publishes an area label and nothing else", `report.service.ts`), so
 * the label is still sent and the copy says the name is shown. It used to promise
 * "no location is published" while the typed name went out word for word.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import * as Location from "expo-location";
import { alpha, colors, radius, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { SegmentedControl } from "@/components/ui/Controls";
import { WizardShell, SectionLabel, useStepNavigation } from "@/components/report/WizardShell";
import { MapPreview } from "@/components/report/MapPreview";
import { useReportDraft } from "@/providers/ReportDraftProvider";
import { useWizardExit } from "@/components/report/useWizardExit";
import { useAuth } from "@/providers/AuthProvider";
import type { LocationPrecision } from "@/lib/api/reports";

/** What each precision publishes, in the words C4 prints. */
const PRECISION_COPY: Record<LocationPrecision, { label: string; detail: string }> = {
  exact: { label: "Exact", detail: "Exact — the spot you picked" },
  approximate: { label: "Approximate", detail: "Approximate — about 500 m" },
  hidden: { label: "Hidden", detail: "Hidden — no location is published" },
};

/** The summary line. Hidden with an area name shows the name only — see the file header. */
function precisionDetail(precision: LocationPrecision, label: string): string {
  if (precision === "hidden" && label.trim()) return "Hidden — only the area name is shown";
  return PRECISION_COPY[precision].detail;
}

/** Typing pauses this long before the address is geocoded. */
const GEOCODE_DEBOUNCE_MS = 600;

/**
 * The server's cap on the area name (`reports.saveDraft`, 160 characters). A
 * longer one makes every draft save fail, which would only surface at filing.
 */
const LOCATION_LABEL_MAX = 160;

/**
 * Above this radius, in metres, a fix is too coarse to honestly call "Exact".
 *
 * `Accuracy.Balanced` asks for roughly 100 m and a real GPS fix in a city lands
 * well inside that. The number that matters is what iOS returns when the person
 * granted location with **Precise Location off**: a deliberately fuzzed fix,
 * typically 1–5 km. 200 m sits clearly between the two, so this flags the fuzzed
 * case without nagging anyone whose fix is merely indoors-and-imperfect.
 *
 * This exists because "Exact" is an evidentiary claim. Without the check the app
 * would label a report Exact while carrying a point kilometres from where the
 * incident happened, and neither the person filing nor a moderator reading it
 * later would have any way to tell.
 */
const EXACT_ACCURACY_LIMIT_M = 200;

/** "1.2 km" / "450 m" — a radius in the units someone actually reads. */
function formatRadius(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`
    : `${Math.round(metres)} m`;
}

export default function WhereStep(): React.ReactElement {
  useThemeSync();
  const { payload, patch, savedAt } = useReportDraft();
  const { user } = useAuth();
  const exit = useWizardExit();
  const { back, advance } = useStepNavigation(4);

  const [mode, setMode] = useState<"locate" | "type">(
    payload.lat !== undefined ? "locate" : "type",
  );
  const [precision, setPrecision] = useState<LocationPrecision | null>(
    payload.locationPrecision ?? null,
  );
  const [label, setLabel] = useState(payload.locationLabel ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    payload.lat !== undefined && payload.lng !== undefined
      ? { lat: payload.lat, lng: payload.lng }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Once denied permanently, requestForegroundPermissionsAsync() just
  // resolves to denied again with no OS prompt — the only way to recover is
  // sending the user to the OS settings screen.
  const [locationDeniedForever, setLocationDeniedForever] = useState(false);
  /**
   * Radius of the last device fix, in metres, or null when the coordinates did
   * not come from the device — a typed address is geocoded and carries no
   * accuracy, and there is nothing to warn about in that case.
   */
  const [fixRadiusM, setFixRadiusM] = useState<number | null>(null);

  const userDefault = user?.preferences.defaultPrecision ?? "approximate";

  /** The pending geocode, so each keystroke replaces the last rather than adding one. */
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Bumped by every keystroke and every device fix. A geocode answers for the
   * text it was asked about, and a slow answer for an older string — or one that
   * lands after "Use my location" — must not overwrite newer coordinates.
   */
  const geocodeSeq = useRef(0);

  const cancelGeocode = useCallback(() => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = null;
    geocodeSeq.current += 1;
  }, []);

  useEffect(() => cancelGeocode, [cancelGeocode]);

  // Debounced geocoding when typing an address/area
  const onAddressChange = useCallback(
    (text: string) => {
      setLabel(text);
      setProblem(null);
      cancelGeocode();
      const query = text.trim();
      if (query.length < 3) return;

      const seq = geocodeSeq.current;
      geocodeTimer.current = setTimeout(() => {
        geocodeTimer.current = null;
        void Location.geocodeAsync(query)
          .then((results) => {
            if (seq !== geocodeSeq.current) return;
            const first = results?.[0];
            if (!first) return;
            setCoords({ lat: first.latitude, lng: first.longitude });
            // A geocoded address is not a device fix, so the previous fix's radius
            // no longer describes these coordinates and must not be judged against.
            setFixRadiusM(null);
          })
          .catch(() => {
            // Geocode failure is non-blocking
          });
      }, GEOCODE_DEBOUNCE_MS);
    },
    [cancelGeocode],
  );

  const useMyLocation = useCallback(async () => {
    if (locationDeniedForever) {
      await Linking.openSettings();
      return;
    }
    // A device fix outranks a geocode still in flight for typed text.
    cancelGeocode();
    setLocating(true);
    setNotice(null);
    setProblem(null);
    try {
      // C4: "We ask you here first. The system prompt only appears after you tap."
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationDeniedForever(!permission.canAskAgain);
        setNotice(
          permission.canAskAgain
            ? "Location is off. Type an address instead, or choose Hidden."
            : "Location was denied. Open Settings to enable it, type an address instead, or choose Hidden.",
        );
        setMode("type");
        return;
      }
      setLocationDeniedForever(false);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCoords(next);
      // Null on platforms that do not report it; treated as "unknown", not "good".
      setFixRadiusM(position.coords.accuracy ?? null);
      setMode("locate");

      // Reverse-geocode for the area label the feed and D1 print. Failure here is
      // cosmetic: the report still carries coordinates.
      const [place] = await Location.reverseGeocodeAsync({
        latitude: next.lat,
        longitude: next.lng,
      }).catch(() => [null]);
      if (place) {
        const parts = [place.district ?? place.subregion, place.city ?? place.region].filter(
          Boolean,
        );
        if (parts.length > 0) setLabel(parts.join(", ").slice(0, LOCATION_LABEL_MAX));
      }
    } catch {
      setNotice("We could not read your location. Type an address instead.");
      setMode("type");
    } finally {
      setLocating(false);
    }
  }, [cancelGeocode, locationDeniedForever]);

  const next = useCallback(() => {
    if (!precision) {
      setProblem("Choose how precisely this appears to other people.");
      return;
    }
    if (precision !== "hidden" && !coords && !label.trim()) {
      setProblem("Add a location, or choose Hidden to publish none.");
      return;
    }

    patch({
      locationPrecision: precision,
      // Kept for Hidden too: the server publishes the area name alone (header).
      locationLabel: label.trim().slice(0, LOCATION_LABEL_MAX) || undefined,
      // Hidden publishes no coordinates, so none are sent — the server cannot
      // leak a coordinate it was never given.
      lat: precision === "hidden" ? undefined : coords?.lat,
      lng: precision === "hidden" ? undefined : coords?.lng,
    });
    advance();
  }, [advance, coords, label, patch, precision]);

  return (
    <WizardShell
      step={4}
      stepName="Location"
      savedAt={savedAt}
      onClose={exit}
      onBack={back}
      onNext={next}
      problem={problem}
      testID="wizard-where"
    >
      <View style={{ flexDirection: "row", gap: 9 }}>
        <Button
          label={locationDeniedForever ? "Open Settings" : "Use my location"}
          variant={mode === "locate" ? "secondary" : "quiet"}
          height={48}
          loading={locating}
          onPress={useMyLocation}
          style={{ flex: 1, borderRadius: radius.md }}
          testID="use-my-location"
        />
        <Button
          label="Type an address"
          variant={mode === "type" ? "secondary" : "quiet"}
          height={48}
          onPress={() => setMode("type")}
          style={{ flex: 1, borderRadius: radius.md }}
          testID="type-address"
        />
      </View>
      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 9, lineHeight: 17 }}>
        We ask you here first. The system prompt only appears after you tap.
      </Text>

      {notice ? (
        <Text variant="bodyXs" color={colors.warn} style={{ marginTop: 10 }}>
          {notice}
        </Text>
      ) : null}

      {mode === "type" ? (
        <TextField
          label="AREA"
          value={label}
          onChangeText={onAddressChange}
          maxLength={LOCATION_LABEL_MAX}
          placeholder="Brownsville, Brooklyn"
          autoCapitalize="words"
          containerStyle={{ marginTop: 16 }}
          hint="A neighbourhood is enough. This name is shown with the report, so leave out street addresses."
          testID="area-label"
        />
      ) : null}

      <SectionLabel style={{ marginTop: 20 }}>HOW PRECISE</SectionLabel>
      <SegmentedControl<LocationPrecision>
        options={[
          { value: "exact", label: "Exact" },
          { value: "approximate", label: "Approximate" },
          { value: "hidden", label: "Hidden" },
        ]}
        // Nothing pre-ticked: an unset precision renders no segment as active.
        value={(precision ?? "__none__") as LocationPrecision}
        onChange={(value) => {
          setPrecision(value);
          setProblem(null);
        }}
        style={{ marginTop: 9 }}
      />

      {/*
        Exact was chosen, but the device did not give an exact fix.

        Stated rather than blocked: A4's rule is that either answer moves forward,
        and refusing the choice would stop someone filing over a phone setting.
        What it must not do is let "Exact" stand unqualified when it is not true.
      */}
      {precision === "exact" && fixRadiusM !== null && fixRadiusM > EXACT_ACCURACY_LIMIT_M ? (
        <View style={styles.accuracyNote} testID="where-accuracy-warning">
          <Text variant="label" color={colors.t0} style={{ fontSize: 13 }}>
            Your device gave a rough position — about {formatRadius(fixRadiusM)} across.
          </Text>
          <Text variant="metaSm" color={colors.t2} style={{ marginTop: 3, lineHeight: 16 }}>
            Filing this as Exact would publish a point that is not where you are. Turn on
            Precise Location for BlackNexa in Settings and tap Use my location again, or
            choose Approximate instead.
          </Text>
        </View>
      ) : null}

      {/* The preview is the answer to "what will people see". */}
      <MapPreview
        precision={precision ?? "approximate"}
        lat={coords?.lat ?? null}
        lng={coords?.lng ?? null}
        caption="This is what other people will see."
        style={{ marginTop: 14 }}
      />

      <View style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text variant="label" color={colors.t0} style={{ fontSize: 13.5 }}>
            {precision ? precisionDetail(precision, label) : "Choose a precision"}
          </Text>
          <Text variant="metaSm" color={colors.t4} style={{ marginTop: 2 }}>
            {label.trim() || "No area named yet"}
          </Text>
        </View>
        {/* Labelled, never pre-ticked. */}
        {precision === userDefault ? (
          <View style={styles.defaultTag}>
            <Text variant="eyebrow" color={colors.t3} style={{ fontSize: 10 }}>
              Your default
            </Text>
          </View>
        ) : null}
      </View>
    </WizardShell>
  );
}

const styles = {
  /**
   * Warn-toned, not error-toned: nothing has gone wrong and nothing is blocked —
   * the app is correcting a claim the person is about to make.
   */
  accuracyNote: {
    backgroundColor: alpha(colors.warn, 0.09),
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warn,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: 10,
  },
  summary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginTop: 12,
  },
  defaultTag: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.s6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};

/** Kept referenced so the alpha helper stays available for the map overlay. */
void alpha;
