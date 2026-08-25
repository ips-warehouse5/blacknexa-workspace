/**
 * A6 · Create account, step 1 of 4 — "Set up your login".
 *
 * Two behaviours from the artboard's caption drive this screen, and both are easy
 * to get wrong:
 *
 *   "Requirements stay neutral grey until met — never red while typing."
 *   "Continue is always enabled; tapping it early scrolls to what is missing."
 *
 * So `Continue` never disables. Tapping it with something missing measures the
 * offending field, scrolls to it, and prints the rule underneath — which is the
 * opposite of the usual pattern where the button greys out and says nothing.
 */

import React, { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { TextInput } from "react-native";
import type { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField, { PasswordField } from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import {
  StepHeader,
  StrengthMeter,
  RequirementList,
  evaluatePassword,
} from "@/components/ui/Progress";
import { useAuth } from "@/providers/AuthProvider";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpAccountScreen(): React.ReactElement {
  const { register, busy, error, clearError, signUpDraft } = useAuth();

  const [email, setEmail] = useState(signUpDraft?.email ?? "");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const passwordRef = useRef<TextInput>(null);
  /** Field offsets, captured at layout so the scroll is instant on tap. */
  const offsets = useRef<{ email: number; password: number }>({ email: 0, password: 0 });

  const strength = evaluatePassword(password);

  /** Scroll a field into view with room above it for its label. */
  const scrollTo = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, []);

  const submit = useCallback(async () => {
    clearError();
    setEmailError(null);
    setPasswordError(null);

    // Ordered top-to-bottom, so "the first problem" means the first one on screen.
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError(
        email.trim().length === 0
          ? "Enter your email address."
          : "That does not look like an email address.",
      );
      scrollTo(offsets.current.email);
      return;
    }
    if (strength.score < strength.rules.length) {
      const missing = strength.rules.filter((rule) => !rule.met).map((rule) => rule.label);
      // The rule in words, not a generic "invalid password".
      setPasswordError(`Still needed: ${missing.join(", ").toLowerCase()}.`);
      scrollTo(offsets.current.password);
      passwordRef.current?.focus();
      return;
    }

    const result = await register(email, password);
    if (result) {
      router.push({
        pathname: "/(auth)/sign-up/terms",
        params: { resendAfter: String(result.resendAfterSeconds) },
      });
    }
  }, [clearError, email, password, register, scrollTo, strength]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      scrollRef={scrollRef}
      footerBorder={false}
      testID="signup-account"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="Back"
            variant="quiet"
            block={false}
            height={52}
            style={{ width: 96 }}
            onPress={() => router.back()}
          />
          {/* Never disabled — see the file header. */}
          <Button
            label="Continue"
            onPress={submit}
            loading={busy}
            style={{ flex: 1 }}
            testID="signup-account-continue"
          />
        </View>
      }
    >
      <BackHeader title="Create account" onBack={() => router.back()} padding={0} />
      <StepHeader step={1} total={4} name="Account" />

      <Text variant="displayXs" color={colors.t0} style={{ marginTop: 26 }}>
        Set up your login
      </Text>

      {error ? (
        <Text variant="bodySm" color={colors.bad2} style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      <TextField
        label="EMAIL"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        blurOnSubmit={false}
        onLayoutY={(y) => {
          offsets.current.email = y;
        }}
        containerStyle={{ marginTop: 24 }}
        testID="signup-email"
      />

      <PasswordField
        ref={passwordRef}
        isNew
        label="PASSWORD"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        returnKeyType="go"
        onSubmitEditing={submit}
        onLayoutY={(y) => {
          offsets.current.password = y;
        }}
        containerStyle={{ marginTop: 18 }}
        testID="signup-password"
      />

      {password.length > 0 ? (
        <StrengthMeter
          score={strength.score}
          label={strength.label}
          color={strength.color}
          style={{ marginTop: 11 }}
        />
      ) : null}

      <RequirementList
        rules={strength.rules}
        style={{ marginTop: 18 }}
        testID="signup-requirements"
      />
    </ScrollScreen>
  );
}
