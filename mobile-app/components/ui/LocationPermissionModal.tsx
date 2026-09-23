/**
 * A4 · Location permission — as a modal over the Welcome screen, not a screen
 * of its own.
 *
 * Per the artboard: "The priming screen is gone. The system prompt is fired
 * at the moment location is first needed — with the reason stated in the
 * sentence above it — so nobody reads two screens to answer one question."
 * Styled to look like the OS permission sheet itself (pin mark, one-line
 * question, the 500 m precision promise, "Don't allow" / "Allow once"),
 * shown over whatever screen is already on-screen — Welcome stays mounted
 * and visible underneath, which is the point: this is an overlay, not a
 * navigation.
 *
 * "Allow once" is the only control that fires the real native prompt;
 * "Don't allow" skips it entirely and never touches the location API.
 * Either answer resolves the modal — there is no separate "denied" state to
 * nag or re-prompt with, because A4's own footnote is "you can file a
 * report without it."
 */

import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { alpha, colors, radius } from "@/constants/theme";
import Text from "@/components/ui/Text";
import { markLocationPromptSeen } from "@/lib/location-permission-memory";

import { MapPin } from "lucide-react-native";

export interface LocationPermissionModalProps {
  visible: boolean;
  /** Called after the native prompt resolves, with whether it was granted. */
  onAllow: (granted: boolean) => void;
  /** Called when the user declines without ever touching the native API. */
  onDeny: () => void;
}

export function LocationPermissionModal({
  visible,
  onAllow,
  onDeny,
}: LocationPermissionModalProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  // Guards against a double-tap firing two overlapping permission requests —
  // there must be exactly one native prompt per appearance of this modal.
  const requestedRef = useRef(false);

  /** "Allow once" — the only control that triggers the real OS prompt. */
  const allowOnce = useCallback(async () => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setBusy(true);
    let granted = false;
    try {
      await markLocationPromptSeen();
      const result = await Location.requestForegroundPermissionsAsync();
      granted = result.status === "granted";
    } catch {
      granted = false;
    } finally {
      setBusy(false);
      requestedRef.current = false;
      onAllow(granted);
    }
  }, [onAllow]);

  /** "Don't allow" — resolves immediately, never touching the native API. */
  const dontAllow = useCallback(() => {
    if (busy) return;
    void markLocationPromptSeen();
    onDeny();
  }, [busy, onDeny]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dontAllow}>
      <View style={styles.root}>
        <View style={styles.scrim} pointerEvents="none" />

        <View style={styles.dialogWrap} pointerEvents="box-none">
          <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
            <View style={styles.markContainer}>
              <View style={styles.radarOuterRing} />
              <View style={styles.radarMiddleRing} />
              <View style={styles.mark}>
                <MapPin size={24} color={colors.acc} strokeWidth={2.2} />
                <View style={styles.pinGlowDot} />
              </View>
            </View>

            <Text variant="sectionTitle" color={colors.t0} center style={styles.title}>
              Allow BlackNexa to use your location?
            </Text>
            <Text variant="bodySm" color={colors.t2} center style={styles.body}>
              Reports are placed to about 500 m, never your exact address. You
              can file without it, and change this any time in Settings.
            </Text>

            <View style={styles.divider} />

            <View style={styles.actions}>
              <Pressable
                onPress={dontAllow}
                disabled={busy}
                style={styles.actionHalf}
                testID="location-modal-deny"
                accessibilityRole="button"
                accessibilityLabel="Don't allow location access"
              >
                <Text variant="label" color={colors.t2} style={styles.actionLabel}>
                  Don&rsquo;t allow
                </Text>
              </Pressable>
              <View style={styles.vDivider} />
              <Pressable
                onPress={allowOnce}
                disabled={busy}
                style={styles.actionHalf}
                testID="location-modal-allow"
                accessibilityRole="button"
                accessibilityLabel="Allow location access once"
              >
                {busy ? (
                  <ActivityIndicator color={colors.acc} />
                ) : (
                  <Text
                    variant="label"
                    color={colors.acc}
                    style={[styles.actionLabel, styles.actionLabelStrong]}
                  >
                    Allow once
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha(colors.deep, 0.62),
  },

  dialogWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 34,
  },
  dialog: {
    backgroundColor: colors.s2,
    borderRadius: radius.dialog,
    paddingTop: 26,
    paddingHorizontal: 22,
  },
  markContainer: {
    alignSelf: "center",
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  radarOuterRing: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: alpha(colors.acc, 0.05),
    borderWidth: 1,
    borderColor: alpha(colors.acc, 0.12),
  },
  radarMiddleRing: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: alpha(colors.acc, 0.08),
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: alpha(colors.acc, 0.16),
    borderWidth: 1,
    borderColor: alpha(colors.acc, 0.28),
    alignItems: "center",
    justifyContent: "center",
  },
  pinGlowDot: {
    position: "absolute",
    top: 13,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.acc,
  },
  title: { marginTop: 14 },
  body: { marginTop: 8, lineHeight: 20 },

  divider: {
    height: 1,
    backgroundColor: alpha(colors.t0, 0.08),
    marginTop: 18,
    marginHorizontal: -22,
  },
  actions: { flexDirection: "row" },
  actionHalf: {
    flex: 1,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 15 },
  actionLabelStrong: { fontWeight: "600" },
  vDivider: { width: 1, backgroundColor: alpha(colors.t0, 0.08) },
});

export default LocationPermissionModal;
