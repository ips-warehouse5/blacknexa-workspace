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
import * as WebBrowser from "expo-web-browser";
import Svg, { Path } from "react-native-svg";
import { Mail } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { alpha, colors, controlHeight, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { useAuth } from "@/providers/AuthProvider";

// Required so the browser tab used for Google's OAuth prompt closes itself and
// hands the result back to the app; without this the flow can hang after login.
WebBrowser.maybeCompleteAuthSession();

/**
 * Google's OAuth client ids.
 *
 * Not secrets — an OAuth client id is public by design, and on native it is
 * useless without the signing fingerprint or bundle id it is bound to. The
 * literals are the fallback for a checkout without `.env`, which matters here
 * because `.env`, `firebase/*.json` and `firebase/*.plist` are all gitignored:
 * a fresh clone has no other source for these values.
 */
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  "47943475561-ddp7kapksdsdov6c81bqttohhupgm3qm.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  "47943475561-gliss3g4ak20npfl72s3kieid2gph481.apps.googleusercontent.com";
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  "47943475561-flfnufkktbim5kdiqe06f53ts0gkbo4f.apps.googleusercontent.com";

export default function WelcomeScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { signInWithApple, signInWithGoogleToken, busy, error, clearError } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  /**
   * Covers the window the provider's own `busy` cannot: the browser prompt and
   * the code-for-token exchange, both of which happen before `signInWithGoogleToken`
   * is ever called. Without it the button looks inert for several seconds.
   */
  const [googleBusy, setGoogleBusy] = useState(false);

  // `useIdTokenAuthRequest`, not `useAuthRequest`: on web it asks Google for the
  // id token directly, and on native it falls through to the PKCE code flow and
  // exchanges the code itself, surfacing the id token on `params.id_token`. Plain
  // `useAuthRequest` would hand back only an access token on web, which the
  // backend cannot verify — it checks an RS256 identity token's signature and
  // audience.
  //
  // `redirectUri` is deliberately not set: the library default,
  // `<applicationId>:/oauthredirect`, is accepted by both the iOS and the Android
  // OAuth client. That was checked against Google's authorize endpoint rather
  // than assumed — a deliberately bogus scheme returns `redirect_uri_mismatch`
  // there, and `com.blacknexa.app:/oauthredirect` does not.
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (!googleResponse) return;
    // A cancelled prompt is not an error worth showing, matching Apple's flow.
    if (googleResponse.type === "dismiss" || googleResponse.type === "cancel") {
      setGoogleBusy(false);
      return;
    }
    if (googleResponse.type === "error") {
      // Google's own `error_description` names the actual cause — a redirect
      // mismatch, a disabled client — where the generic sentence hides it.
      setGoogleError(
        googleResponse.params?.error_description ??
          googleResponse.error?.message ??
          "That sign-in did not complete. Please try again.",
      );
      setGoogleBusy(false);
      return;
    }
    if (googleResponse.type !== "success") {
      setGoogleBusy(false);
      return;
    }
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      // On native the token exchange runs asynchronously after the browser
      // closes, so the first success carries only `code`. Stay busy and wait for
      // the provider to re-emit with the exchanged token rather than declaring
      // failure on a result that is merely not ready yet.
      if (googleResponse.params?.code) return;
      setGoogleError("That sign-in did not complete. Please try again.");
      setGoogleBusy(false);
      return;
    }
    void signInWithGoogleToken(idToken).finally(() => setGoogleBusy(false));
  }, [googleResponse, signInWithGoogleToken]);

  const onGoogle = useCallback(async () => {
    clearError();
    setGoogleError(null);
    setGoogleBusy(true);
    try {
      await promptGoogle();
    } catch {
      setGoogleError("That sign-in did not complete. Please try again.");
      setGoogleBusy(false);
    }
  }, [clearError, promptGoogle]);

  const onApple = useCallback(async () => {
    clearError();
    setGoogleError(null);
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

        {error || googleError ? (
          <Text
            variant="bodySm"
            color={colors.bad2}
            style={{ marginTop: 16, paddingHorizontal: screenPadding.hero }}
          >
            {error || googleError}
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
            loading={googleBusy}
            // The request loads asynchronously (it generates the PKCE verifier);
            // prompting before it exists silently does nothing.
            disabled={!googleRequest}
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
    <Svg width={17} height={20} viewBox="0 0 384 512" fill={colors.bg}>
      <Path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </Svg>
  );
}

/** Google's official 4-color "G" mark via SVG. */
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

function MailMark(): React.ReactElement {
  return <Mail size={18} color={colors.t0} strokeWidth={2} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  band: { position: "absolute", top: 0, left: 0, right: 0 },
  routes: { paddingHorizontal: screenPadding.hero, paddingTop: 34, gap: 10 },
});
