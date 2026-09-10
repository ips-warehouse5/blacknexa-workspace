/**
 * A10 · Log in.
 *
 * From the caption: "A wrong password and an unknown email share one identical
 * message, so the screen never confirms whether an account exists."
 *
 * The server enforces that (identical body, equalised timing), and this screen
 * must not undo it — so the error banner prints whatever the API returned and
 * never adds a hint of its own such as "no account found for that address".
 *
 * The banner also carries both recoveries the artboard shows, because a person
 * who cannot get in needs a way out, not just a diagnosis.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import type { TextInput } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { alpha, colors, controlHeight, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField, { PasswordField } from "@/components/ui/TextField";
import { ScrollScreen } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import { ShieldMark } from "@/app/(auth)/intro";

export default function LogInScreen(): React.ReactElement {
  const { login, busy, error, clearError, biometricsAvailable, unlockWithBiometrics } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passwordRef = useRef<TextInput>(null);

  // Clear any existing auth error when navigating to or focusing the login screen
  useFocusEffect(
    useCallback(() => {
      clearError();
      return () => {
        clearError();
      };
    }, [clearError]),
  );

  const handleEmailChange = useCallback(
    (text: string) => {
      if (error) clearError();
      setEmail(text);
    },
    [clearError, error],
  );

  const handlePasswordChange = useCallback(
    (text: string) => {
      if (error) clearError();
      setPassword(text);
    },
    [clearError, error],
  );

  const submit = useCallback(async () => {
    clearError();
    if (!email.trim() || !password) {
      // Handled inline rather than by disabling the button, per the design's rule.
      return;
    }
    await login(email, password);
    // The gate swaps the stack on success; nothing to route here.
  }, [clearError, email, login, password]);

  return (
    <ScrollScreen
      padding={screenPadding.hero}
      testID="log-in"
      footer={
        <Text variant="label" color={colors.t3} center>
          New here?{" "}
          <Text
            variant="label"
            color={colors.acc}
            onPress={() => router.replace("/(auth)/sign-up/account")}
          >
            Create an account
          </Text>
        </Text>
      }
    >
      <View style={{ alignItems: "center", marginTop: 56 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 17,
            backgroundColor: colors.s3,
            borderWidth: 1,
            borderColor: alpha(colors.acc, 0.3),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShieldMark size={23} />
        </View>
      </View>

      <Text variant="displaySm" color={colors.t0} center style={{ marginTop: 22 }}>
        Welcome back
      </Text>

      {error ? (
        <View style={styles.banner}>
          <View style={styles.bannerMark}>
            <Text variant="label" color={colors.bad2}>
              !
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {/* Whatever the server said, verbatim. No added hint. */}
            <Text variant="label" color={colors.bad2} style={{ fontSize: 13.5, lineHeight: 19 }}>
              {error}
            </Text>
            <Text variant="bodyXs" color={colors.t2} style={{ marginTop: 4 }}>
              Check both, then try again.{" "}
              <Text
                variant="bodyXs"
                color={colors.acc}
                onPress={() => router.push("/(auth)/reset/request")}
              >
                Reset your password
              </Text>{" "}
              or{" "}
              <Text
                variant="bodyXs"
                color={colors.acc}
                onPress={() => router.replace("/(auth)/sign-up/account")}
              >
                create an account
              </Text>
              .
            </Text>
          </View>
        </View>
      ) : null}

      <TextField
        value={email}
        onChangeText={handleEmailChange}
        placeholder="you@example.com"
        label="EMAIL"
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        containerStyle={{ marginTop: error ? 14 : 26 }}
        testID="log-in-email"
      />

      <PasswordField
        ref={passwordRef}
        value={password}
        onChangeText={handlePasswordChange}
        label="PASSWORD"
        returnKeyType="done"
        onSubmitEditing={submit}
        containerStyle={{ marginTop: 10 }}
        testID="log-in-password"
      />

      <Button
        label="Log in"
        onPress={submit}
        loading={busy}
        style={{ marginTop: 16 }}
        testID="login-submit"
      />

      {biometricsAvailable ? (
        <Button
          label="Use Face ID"
          variant="quiet"
          height={controlHeight.button}
          style={{ marginTop: 10, borderRadius: radius.lg }}
          onPress={() => void unlockWithBiometrics()}
          testID="login-biometric"
        />
      ) : null}

      <Pressable
        onPress={() => router.push("/(auth)/reset/request")}
        hitSlop={10}
        style={{ marginTop: 18, alignSelf: "center", paddingVertical: 8 }}
      >
        <Text variant="label" color={colors.t3}>
          Forgot your password?
        </Text>
      </Pressable>
    </ScrollScreen>
  );
}

const styles = {
  banner: {
    flexDirection: "row" as const,
    gap: 11,
    backgroundColor: alpha(colors.bad, 0.1),
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 26,
  },
  bannerMark: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.6,
    borderColor: colors.bad2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
};
