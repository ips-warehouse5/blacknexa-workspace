/**
 * A5 · Welcome.
 *
 * From the caption: "Four equal-weight routes. **No accent primary here** — none
 * of these four is the app's recommendation."
 *
 * That is a deliberate exception to the one-accent-per-screen rule and it must be
 * preserved. Making "Continue with email" the accent button would be a small,
 * reasonable-looking change that quietly turns a neutral choice into a
 * recommendation — so all four buttons are non-accent, and Apple's is dark only
 * because that is Apple's own required treatment.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, controlHeight, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { useAuth } from "@/providers/AuthProvider";

export default function WelcomeScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { signInWithApple, signInWithGoogleToken, busy, error, clearError } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);

  const googleIosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    "47943475561-ddp7kapksdsdov6c81bqttohhupgm3qm.apps.googleusercontent.com";
  const googleAndroidClientId =
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    "47943475561-gliss3g4ak20npfl72s3kieid2gph481.apps.googleusercontent.com";

  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (googleResponse?.type !== "success") return;
    const idToken = googleResponse.params?.id_token;
    if (idToken) void signInWithGoogleToken(idToken);
  }, [googleResponse, signInWithGoogleToken]);

  const onGoogle = useCallback(async () => {
    clearError();
    if (!googleRequest) {
      await promptGoogle().catch(() => {});
      return;
    }
    await promptGoogle();
  }, [clearError, googleRequest, promptGoogle]);

  const onApple = useCallback(async () => {
    clearError();
    await signInWithApple();
  }, [clearError, signInWithApple]);

  return (
    <View style={styles.root}>
      {/* The 330px brand band, with the artboard's scrim resolving into the page. */}
      <View style={[styles.band, { height: 330 }]}>
        <LinearGradient colors={[colors.s6, colors.s4]} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[alpha(colors.deep, 0.18), alpha(colors.deep, 0.06), colors.bg]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* The artboard's flat 150px top padding is a position in an 844px frame,
            so it becomes inset-relative here. */}
        <View style={{ paddingHorizontal: 26, paddingTop: 120 }}>
          <Text variant="displayLg" color={colors.t0}>
            Welcome to BlackNexa
          </Text>
          <Text variant="bodyLg" color={colors.t2} style={{ marginTop: 12, maxWidth: 320 }}>
            Document what happened, keep it safe, and find people who can help.
          </Text>
        </View>

        {error ? (
          <Text
            variant="bodySm"
            color={colors.bad2}
            style={{ marginTop: 16, paddingHorizontal: screenPadding.hero }}
          >
            {error}
          </Text>
        ) : null}

        <View style={styles.routes}>
          {appleAvailable ? (
            <Button
              label="Continue with Apple"
              onPress={onApple}
              loading={busy}
              variant="primary"
              style={{ backgroundColor: colors.t0 }}
              icon={<AppleMark />}
              testID="welcome-apple"
            />
          ) : null}

          <Button
            label="Continue with Google"
            variant="secondary"
            height={controlHeight.button}
            style={{ borderRadius: radius.lg }}
            icon={<GoogleMark />}
            onPress={onGoogle}
            testID="welcome-google"
          />

          <Button
            label="Continue with email"
            variant="secondary"
            height={controlHeight.button}
            style={{ borderRadius: radius.lg }}
            icon={<MailMark />}
            onPress={() => router.push("/(auth)/sign-up/account")}
            testID="welcome-email"
          />

          <Button
            label="Log in"
            variant="quiet"
            height={controlHeight.button}
            style={{ borderRadius: radius.lg }}
            onPress={() => router.push("/(auth)/log-in")}
            testID="welcome-login"
          />
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
  );
}

function AppleMark(): React.ReactElement {
  return (
    <View style={{ width: 17, height: 20, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 12,
          height: 13,
          borderRadius: 6,
          backgroundColor: colors.bg,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 4,
          width: 4,
          height: 5,
          borderRadius: 2,
          backgroundColor: colors.bg,
          transform: [{ rotate: "20deg" }],
        }}
      />
    </View>
  );
}

/** Google's four-colour mark, quartered — a monochrome fallback is off-brand. */
function GoogleMark(): React.ReactElement {
  return (
    <View style={styles.googleMark}>
      <View style={[styles.googleQuad, { backgroundColor: "#4285F4", top: 0, right: 0 }]} />
      <View style={[styles.googleQuad, { backgroundColor: "#34A853", bottom: 0, right: 0 }]} />
      <View style={[styles.googleQuad, { backgroundColor: "#FBBC05", bottom: 0, left: 0 }]} />
      <View style={[styles.googleQuad, { backgroundColor: "#EA4335", top: 0, left: 0 }]} />
      <View style={styles.googleHole} />
    </View>
  );
}

function MailMark(): React.ReactElement {
  return (
    <View
      style={{
        width: 18,
        height: 13,
        borderRadius: 3,
        borderWidth: 1.6,
        borderColor: colors.t0,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: -4,
          left: 1,
          width: 12,
          height: 12,
          borderRightWidth: 1.6,
          borderBottomWidth: 1.6,
          borderColor: colors.t0,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  band: { position: "absolute", top: 0, left: 0, right: 0 },
  routes: { paddingHorizontal: screenPadding.hero, paddingTop: 34, gap: 10 },

  googleMark: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  googleQuad: { position: "absolute", width: 8.5, height: 8.5 },
  googleHole: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.s6,
  },
});
