/**
 * H11 · Your area.
 *
 * The board specifies a searchable city/ZIP field with a "recent areas"
 * list, all persisted server-side. No such field or endpoint exists in the
 * backend today — `AppUser` has no home-area column, and there is no
 * search/geocoding route for it. Rather than build a search box that looks
 * functional but silently goes nowhere, this screen shows the one thing
 * that *is* real: the area already detected from the device's location
 * (`LocationProvider`, the same source the News tab's local feed uses),
 * plus a manual "request location" affordance reusing the same provider
 * method every other screen already calls. When a real "set my area"
 * endpoint exists, replace the search section below rather than build
 * around it.
 */

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { MapPin } from "lucide-react-native";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useLocation } from "@/providers/LocationProvider";

export default function AreaScreen(): React.ReactElement {
  const { location, status, requestLocation } = useLocation();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await requestLocation();
    } finally {
      setBusy(false);
    }
  }, [requestLocation]);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="profile-area">
      <BackHeader title="Your area" onBack={() => router.back()} padding={0} />

      <View
        style={{
          marginTop: 18,
          backgroundColor: colors.s3,
          borderRadius: radius.xl,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <MapPin size={20} color={colors.acc} />
        <View style={{ flex: 1 }}>
          <Text variant="eyebrowSm" color={colors.t4}>
            CURRENT AREA
          </Text>
          <Text variant="labelLg" color={colors.t0} style={{ marginTop: 3 }}>
            {location?.label || (status === "requesting" ? "Locating…" : "Not set")}
          </Text>
        </View>
      </View>

      <Text variant="bodySm" color={colors.t3} style={{ marginTop: 14 }}>
        Your area comes from this device&rsquo;s location and drives the News
        tab&rsquo;s local feed. Changing it doesn&rsquo;t retroactively change reports
        you&rsquo;ve already filed.
      </Text>

      <Button
        label="Refresh from device location"
        variant="secondary"
        onPress={refresh}
        loading={busy}
        style={{ marginTop: 20 }}
        testID="area-refresh"
      />

      <Text variant="metaSm" color={colors.t4} style={{ marginTop: 14 }}>
        Searching for a different city or ZIP code isn&rsquo;t available yet.
      </Text>
    </ScrollScreen>
  );
}
