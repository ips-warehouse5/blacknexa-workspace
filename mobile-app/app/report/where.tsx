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
 */

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { SegmentedControl } from "@/components/ui/Controls";
import { WizardShell, SectionLabel } from "@/components/report/WizardShell";
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

export default function WhereStep(): React.ReactElement {
  const { payload, patch, setStep, savedAt } = useReportDraft();
  const { user } = useAuth();
  const exit = useWizardExit();

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

  const userDefault = user?.preferences.defaultPrecision ?? "approximate";

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    setNotice(null);
    setProblem(null);
    try {
      // C4: "We ask you here first. The system prompt only appears after you tap."
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setNotice("Location is off. Type an address instead, or choose Hidden.");
        setMode("type");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCoords(next);
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
        if (parts.length > 0) setLabel(parts.join(", "));
      }
    } catch {
      setNotice("We could not read your location. Type an address instead.");
      setMode("type");
    } finally {
      setLocating(false);
    }
  }, []);

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
      locationLabel: label.trim() || undefined,
      // Hidden publishes nothing, so nothing is sent — the server cannot leak a
      // coordinate it was never given.
      lat: precision === "hidden" ? undefined : coords?.lat,
      lng: precision === "hidden" ? undefined : coords?.lng,
    });
    setStep(5);
    router.push("/report/evidence");
  }, [coords, label, patch, precision, setStep]);

  return (
    <WizardShell
      step={4}
      stepName="Location"
      savedAt={savedAt}
      onClose={exit}
      onBack={() => router.back()}
      onNext={next}
      problem={problem}
      testID="wizard-where"
    >
      <View style={{ flexDirection: "row", gap: 9 }}>
        <Button
          label="Use my location"
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
          onChangeText={setLabel}
          placeholder="Brownsville, Brooklyn"
          autoCapitalize="words"
          containerStyle={{ marginTop: 16 }}
          hint="A neighbourhood is enough. A street address is never published."
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
            {precision ? PRECISION_COPY[precision].detail : "Choose a precision"}
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
