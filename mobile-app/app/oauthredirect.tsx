/**
 * Landing spot for Google's OAuth redirect.
 *
 * Google's sign-in flow (see app/(auth)/welcome.tsx) opens a browser tab that
 * redirects back into the app at this path. `WebBrowser.maybeCompleteAuthSession()`
 * is what actually resolves the auth-session promise from that URL — this
 * screen exists because expo-router's own linking listener sees the same URL and
 * navigates here too.
 *
 * On some devices that intermediate route is visible long enough to feel broken
 * before AuthGate swaps to Dashboard. Keep the user anchored on a dimmed Welcome
 * surface with a loader instead of showing a blank or invalid frame.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { Mail } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  alpha,
  colors,
  controlHeight,
  radius,
  screenPadding,
  useThemeSync,
} from "@/constants/theme";
import Text from "@/components/ui/Text";

export default function OAuthRedirectScreen(): React.ReactElement {
  useThemeSync();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.welcome} pointerEvents="none">
        <View style={styles.band}>
          <LinearGradient colors={[colors.s6, colors.s4]} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[alpha(colors.deep, 0.18), alpha(colors.deep, 0.06), colors.bg]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={styles.heroCopy}>
            <Text variant="displayLg" color={colors.t0}>
              Welcome to BlackNexa™
            </Text>
            <Text variant="bodyLg" color={colors.t2} style={styles.subtitle}>
              Document what happened, keep it safe, and find people who can help.
            </Text>
          </View>

          <View style={styles.routes}>
            <RouteButton label="Continue with Google" icon={<GoogleMark />} />
            <RouteButton label="Continue with email" icon={<Mail size={18} color={colors.t0} strokeWidth={2} />} />
            <RouteButton label="Log in" quiet />
          </View>

          <View style={{ flex: 1 }} />

          <Text
            variant="metaSm"
            color={colors.t4}
            center
            style={{
              paddingHorizontal: 30,
              paddingBottom: Math.max(insets.bottom, 12) + 18,
              lineHeight: 18,
            }}
          >
            By continuing you agree to the Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>

      <View style={styles.loaderWrap}>
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={colors.t0} size="large" />
          <Text variant="buttonSm" color={colors.t1} style={styles.loadingText}>
            Signing you in
          </Text>
        </View>
      </View>
    </View>
  );
}

function RouteButton({
  label,
  icon,
  quiet = false,
}: {
  label: string;
  icon?: React.ReactNode;
  quiet?: boolean;
}): React.ReactElement {
  return (
    <View
      style={[
        styles.routeButton,
        quiet ? styles.quietButton : { backgroundColor: colors.s6 },
      ]}
    >
      <View style={styles.routeContent}>
        {icon ? <View style={styles.routeIcon}>{icon}</View> : null}
        <Text variant={quiet ? "button" : "buttonSm"} color={quiet ? colors.t1 : colors.t0}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function GoogleMark(): React.ReactElement {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <Path fill="none" d="M0 0h48v48H0z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  welcome: { flex: 1, opacity: 0.36 },
  band: { position: "absolute", top: 0, left: 0, right: 0, height: 330 },
  heroCopy: { paddingHorizontal: 26, paddingTop: 120 },
  subtitle: { marginTop: 12, maxWidth: 320 },
  routes: { paddingHorizontal: screenPadding.hero, paddingTop: 34, gap: 10 },
  routeButton: {
    alignItems: "center",
    justifyContent: "center",
    height: controlHeight.buttonSecondary,
    borderRadius: radius.lg,
  },
  quietButton: {
    backgroundColor: "transparent",
    borderColor: alpha(colors.t0, 0.16),
    borderWidth: 1,
  },
  routeContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
  },
  routeIcon: { alignItems: "center", justifyContent: "center" },
  loaderWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: screenPadding.hero,
  },
  loadingPanel: {
    alignItems: "center",
    backgroundColor: alpha(colors.bg, 0.86),
    borderColor: alpha(colors.t0, 0.08),
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
    justifyContent: "center",
    minHeight: 112,
    minWidth: 150,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  loadingText: { lineHeight: 18 },
});
