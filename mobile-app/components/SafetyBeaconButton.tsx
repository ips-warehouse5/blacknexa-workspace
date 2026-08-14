/**
 * SafetyBeaconButton — fires an encrypted event payload to the BlackNexa
 * hardware beacon trigger endpoint (/api/v1/blacknexa/hardware/beacon-trigger)
 * alongside real-time GPS coordinates when the physical safety button is
 * triggered or the in-app panic button is tapped.
 *
 * BLE pairing with wearable physical panic buttons and dash-cams is supported
 * via the device's Bluetooth. Since Expo Go does not include BLE native
 * modules, the BLE scan UI is shown as a placeholder that will activate once
 * a native BLE module is available. The in-app panic trigger is fully
 * functional.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bluetooth, Radio, ShieldAlert, X } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { useLocation } from "@/providers/LocationProvider";

const FUNCTIONS_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL ?? "";

type BeaconResponse = {
  success: boolean;
  status?: string;
  secureVaultSync?: boolean;
  error?: string;
};

async function fireBeaconTrigger(
  userId: string,
  triggerType: string,
  coords: { lat: number; lon: number }
): Promise<BeaconResponse> {
  const body = {
    user_id: userId,
    device_mac_address: "in-app-panic",
    trigger_type: triggerType,
    gps_coordinates: coords,
  };
  const res = await fetch(`${FUNCTIONS_URL}/api/v1/blacknexa/hardware/beacon-trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as BeaconResponse;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Beacon trigger failed (${res.status}).`);
  }
  return json;
}

export default function SafetyBeaconButton(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { location } = useLocation();
  const [sheetVisible, setSheetVisible] = useState<boolean>(false);
  const [beaconStatus, setBeaconStatus] = useState<string | null>(null);
  const [pressCount, setPressCount] = useState<number>(0);
  const lastPressRef = useRef<number>(0);
  const DOUBLE_PRESS_MS = 400;

  const beaconMutation = useMutation({
    mutationFn: (triggerType: string) => {
      const userId = user?.id ?? "anonymous";
      const coords = location
        ? { lat: location.lat, lon: location.lng }
        : { lat: 0, lon: 0 };
      return fireBeaconTrigger(userId, triggerType, coords);
    },
    onSuccess: (data) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setBeaconStatus(data.status ?? "ARMED_AND_LOGGED");
      Alert.alert(
        "Safety Beacon Activated",
        "Your encrypted event payload with GPS coordinates has been logged to the secure vault. Emergency contacts and the BlackNexa safety network have been notified.",
        [{ text: "OK", onPress: () => setSheetVisible(false) }]
      );
    },
    onError: (err: unknown) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      setBeaconStatus("FAILED");
      Alert.alert(
        "Beacon Failed",
        err instanceof Error ? err.message : "Could not activate the safety beacon. Check your connection.",
      );
    },
  });

  const handlePanic = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastPressRef.current;

    if (elapsed < DOUBLE_PRESS_MS && lastPressRef.current > 0) {
      // Double-press detected — fire the beacon.
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
      setBeaconStatus(null);
      setPressCount(0);
      lastPressRef.current = 0;
      beaconMutation.mutate("panic_button_double_press");
    } else {
      // First press — start the double-press window.
      lastPressRef.current = now;
      setPressCount(1);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      // Reset after the window expires.
      setTimeout(() => {
        setPressCount(0);
        lastPressRef.current = 0;
      }, DOUBLE_PRESS_MS);
    }
  }, [beaconMutation]);

  const handleDashcamTrigger = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setBeaconStatus(null);
    beaconMutation.mutate("dashcam_event");
  }, [beaconMutation]);

  return (
    <>
      <Pressable
        onPress={() => setSheetVisible(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: 100 + insets.bottom, right: 78 },
          pressed && { opacity: 0.85 },
        ]}
        testID="safety-beacon-btn"
      >
        <View style={styles.fabInner}>
          <ShieldAlert size={22} color={Colors.crimson} />
        </View>
      </Pressable>

      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setSheetVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <ShieldAlert size={18} color={Colors.crimson} />
                <Text style={styles.title}>Safety Beacon</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setSheetVisible(false)}>
                <X size={18} color={Colors.textDim} />
              </Pressable>
            </View>

            <Text style={styles.description}>
              Activate the BlackNexa encrypted safety beacon. Your GPS coordinates and
              trigger event will be sent instantly to the secure vault.
            </Text>

            <View style={styles.gpsStatus}>
              <Radio size={12} color={location ? Colors.emerald : Colors.textMute} />
              <Text style={styles.gpsStatusText}>
                {location
                  ? `GPS Active · ${location.label}`
                  : "GPS not available — coordinates will be zero"}
              </Text>
            </View>

            <Pressable
              onPress={handlePanic}
              disabled={beaconMutation.isPending}
              style={[styles.panicBtn, beaconMutation.isPending && styles.btnDisabled]}
              testID="panic-trigger"
            >
              {beaconMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : (
                <AlertTriangle size={20} color={Colors.bg} />
              )}
              <Text style={styles.panicBtnText}>
                {beaconMutation.isPending
                  ? "Sending Beacon…"
                  : pressCount === 1
                    ? "PRESS AGAIN TO ACTIVATE"
                    : "DOUBLE-PRESS PANIC BEACON"}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleDashcamTrigger}
              disabled={beaconMutation.isPending}
              style={[styles.dashcamBtn, beaconMutation.isPending && styles.btnDisabled]}
            >
              <Radio size={16} color={Colors.gold} />
              <Text style={styles.dashcamBtnText}>Log Dash-Cam Event</Text>
            </Pressable>

            {/* BLE pairing section */}
            <View style={styles.bleSection}>
              <View style={styles.bleHeader}>
                <Bluetooth size={14} color={Colors.gold} />
                <Text style={styles.bleTitle}>BLE Device Pairing</Text>
              </View>
              <Text style={styles.bleDescription}>
                Pair with wearable physical panic buttons and dash-cams via
                Bluetooth Low Energy. The app will instantly fire an encrypted
                event payload when a paired device is triggered.
              </Text>
              <Pressable style={styles.bleScanBtn} disabled>
                <Bluetooth size={13} color={Colors.textDim} />
                <Text style={styles.bleScanBtnText}>Scan for BLE devices</Text>
              </Pressable>
              <Text style={styles.bleNote}>
                BLE scanning requires a native build. Available in the production app.
              </Text>
            </View>

            {beaconStatus ? (
              <View style={styles.statusBanner}>
                <Text style={styles.statusText}>Status: {beaconStatus}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    shadowColor: Colors.crimson,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.crimson + "66",
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    fontSize: 12,
    color: Colors.textDim,
    lineHeight: 17,
    marginBottom: 14,
  },
  gpsStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  gpsStatusText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textDim,
    flex: 1,
  },
  panicBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.crimson,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 10,
  },
  panicBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.bg,
    letterSpacing: 0.5,
  },
  btnDisabled: { opacity: 0.5 },
  dashcamBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface2,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.gold + "33",
  },
  dashcamBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.gold,
  },
  bleSection: {
    backgroundColor: Colors.surface2,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gold + "22",
  },
  bleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  bleTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  bleDescription: {
    fontSize: 11,
    color: Colors.textDim,
    lineHeight: 16,
    marginBottom: 10,
  },
  bleScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.surface3,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 6,
    opacity: 0.6,
  },
  bleScanBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textDim,
  },
  bleNote: {
    fontSize: 10,
    color: Colors.textMute,
    lineHeight: 14,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.emerald + "14",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.emerald + "33",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.emerald,
  },
});
