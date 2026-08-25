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

import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { colors, radius, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { useAuth } from "@/providers/AuthProvider";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ResetRequestScreen(): React.ReactElement {
  const { forgotPassword, busy, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = useCallback(async () => {
    clearError();
    setProblem(null);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setProblem(
        email.trim().length === 0
          ? "Enter your email address."
          : "That does not look like an email address.",
      );
      return;
    }
    const result = await forgotPassword(email);
    if (!result) return;
    router.push({
      pathname: "/(auth)/reset/confirm",
      params: { email: email.trim().toLowerCase(), resendAfter: String(result.resendAfterSeconds) },
    });
  }, [clearError, email, forgotPassword]);

  return (
    <ScrollScreen padding={screenPadding.detail} testID="reset-request">
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
        onChangeText={setEmail}
        error={problem ?? error}
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

      <Text variant="label" color={colors.t3} center style={{ marginTop: 28 }}>
        Remembered it?{" "}
        <Text variant="label" color={colors.acc} onPress={() => router.back()}>
          Back to log in
        </Text>
      </Text>
    </ScrollScreen>
  );
}
