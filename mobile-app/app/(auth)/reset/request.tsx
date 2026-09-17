/**
 * A13 · Reset request.
 *
 * The artboard prints the promise: "If an account exists for this address, a code
 * is on its way. We don't say whether one does."
 *
 * So this screen always advances to A14 on a successful call, regardless of
 * whether the address is registered — the server returns the same 202 either way,
 * and branching here would leak exactly what the copy says it will not.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { colors, radius, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { safeResetErrorMessage, validateResetRequest } from "@/lib/auth/reset-validation";

export default function ResetRequestScreen(): React.ReactElement {
  useThemeSync();
  const { forgotPassword, busy, error, clearError } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const shownErrorRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      clearError();
      return () => {
        clearError();
      };
    }, [clearError]),
  );

  useEffect(() => {
    if (!error) {
      shownErrorRef.current = null;
      return;
    }
    if (shownErrorRef.current === error) return;

    shownErrorRef.current = error;
    showSnackbar({ message: safeResetErrorMessage(error), type: "error" });
    clearError();
  }, [clearError, error, showSnackbar]);

  const handleEmailChange = useCallback(
    (text: string) => {
      if (error) clearError();
      setEmail(text);
      // Email format is only checked on submit — clear a shown error as soon
      // as the user starts correcting the field, but don't re-validate live.
      if (problem) setProblem(null);
    },
    [clearError, error, problem],
  );

  const submit = useCallback(async () => {
    if (busy || submittingRef.current) return;

    clearError();
    const validation = validateResetRequest(email);
    setProblem(validation.email);
    if (validation.email) {
      return;
    }

    submittingRef.current = true;
    try {
      const result = await forgotPassword(validation.emailForSubmission!);
      if (!result) return;
      router.push({
        pathname: "/(auth)/reset/confirm",
        params: { email: validation.emailForSubmission!, resendAfter: String(result.resendAfterSeconds) },
      });
    } finally {
      submittingRef.current = false;
    }
  }, [busy, clearError, email, forgotPassword]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      contentStyle={{ flexGrow: 1 }}
      testID="reset-request"
    >
      <BackHeader title="Reset password" onBack={() => router.back()} padding={0} />

      <Text variant="displaySm" color={colors.t0} style={{ marginTop: 14, fontSize: 27 }}>
        We&rsquo;ll send you a code
      </Text>
      <Text variant="body" color={colors.t2} style={{ marginTop: 10 }}>
        Enter the email you signed up with. The code is good for fifteen minutes.
      </Text>

      <TextField
        label="EMAIL"
        value={email}
        onChangeText={handleEmailChange}
        error={problem}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={submit}
        autoFocus
        containerStyle={{ marginTop: 26 }}
        testID="reset-email"
      />

      <Button
        label="Send code"
        onPress={submit}
        loading={busy}
        style={{ marginTop: 18 }}
        testID="reset-send"
      />

      {/* The disclosure promise, stated to the user rather than left implicit. */}
      <View
        style={{
          flexDirection: "row",
          gap: 11,
          backgroundColor: colors.s1,
          borderRadius: radius.md,
          paddingVertical: 13,
          paddingHorizontal: 14,
          marginTop: 16,
        }}
      >
        <View
          style={{
            width: 17,
            height: 17,
            borderRadius: 9,
            borderWidth: 1.6,
            borderColor: colors.t3,
            marginTop: 1,
          }}
        />
        <Text variant="bodyXs" color={colors.t2} style={{ flex: 1 }}>
          If an account exists for this address, a code is on its way. We don&rsquo;t say
          whether one does.
        </Text>
      </View>

      <Text
        variant="label"
        color={colors.t3}
        center
        style={{ marginTop: "auto", paddingVertical: 28 }}
      >
        Remembered it?{" "}
        <Text variant="label" color={colors.acc} onPress={() => router.back()}>
          Back to log in
        </Text>
      </Text>
    </ScrollScreen>
  );
}
