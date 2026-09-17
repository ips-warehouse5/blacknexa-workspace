/**
 * A14 · Enter the code, then pick a new password.
 *
 * From the caption: "One screen, not two — the code has nothing to do once
 * entered. Requirements stay grey until met, as on A6."
 *
 * A14 adds a third requirement A6 does not have: "Not a password you have used
 * here before." That one cannot be checked on the device — only the server knows
 * the history — so it is rendered as unmet until the server accepts the reset, and
 * a rejection surfaces on that row rather than as a generic error.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import type { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors, controlHeight, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import {
  RequirementList,
  StrengthMeter,
  evaluatePassword,
  type PasswordRule,
} from "@/components/ui/Progress";
import OtpInput, {
  ResendTimer,
  useCountdown,
  type OtpInputHandle,
} from "@/components/ui/OtpInput";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import authApi from "@/lib/api/auth";
import {
  safeResetErrorMessage,
  validateResetConfirmation,
} from "@/lib/auth/reset-validation";

const CODE_LENGTH = 6;

export default function ResetConfirmScreen(): React.ReactElement {
  useThemeSync();
  const params = useLocalSearchParams<{ email?: string; resendAfter?: string }>();
  const email = params.email ?? "";
  const { resetPassword, busy, error, clearError } = useAuth();
  const { showSnackbar } = useSnackbar();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordApiError, setPasswordApiError] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRef = useRef<OtpInputHandle>(null);
  const passwordRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const shownErrorRef = useRef<string | null>(null);
  const { secondsRemaining, restart } = useCountdown(Number(params.resendAfter ?? 30));

  const strength = evaluatePassword(password);

  /** A6's four rules plus A14's history rule. */
  const rules = useMemo<PasswordRule[]>(
    () => [
      { label: "At least 10 characters", met: strength.rules[0].met },
      {
        label: "One capital letter, one number, one symbol",
        met: strength.rules[1].met && strength.rules[2].met && strength.rules[3].met,
      },
      // Only the server can know this, so it remains neutral until submission.
      { label: "Not a password you have used here before", met: false },
    ],
    [strength.rules],
  );

  useEffect(() => {
    if (!email) router.replace("/(auth)/reset/request");
  }, [email]);

  useEffect(() => {
    if (!error) {
      shownErrorRef.current = null;
      return;
    }
    if (shownErrorRef.current === error) return;

    shownErrorRef.current = error;
    const message = safeResetErrorMessage(error);
    if (/password.+(?:used|before)|choose a password/i.test(error)) {
      // Inline placement points at the exact field to fix; the snackbar
      // guarantees the user actually sees it even if they've scrolled past
      // the password field by the time the response comes back.
      setPasswordApiError(message);
    }
    showSnackbar({ message, type: "error" });
    clearError();
  }, [clearError, error, showSnackbar]);

  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      if (codeTouched) setCodeError(validateResetConfirmation(value, password).code);
    },
    [codeTouched, password],
  );

  const handlePasswordChange = useCallback(
    (value: string) => {
      setPassword(value);
      setPasswordApiError(null);
      if (passwordTouched) setPasswordError(validateResetConfirmation(code, value).password);
    },
    [code, passwordTouched],
  );

  const submit = useCallback(async () => {
    if (busy || submittingRef.current) return;

    clearError();
    setCodeTouched(true);
    setPasswordTouched(true);
    const validation = validateResetConfirmation(code, password);
    setCodeError(validation.code);
    setPasswordError(validation.password);

    if (validation.code) {
      otpRef.current?.focus();
      return;
    }
    if (validation.password) {
      passwordRef.current?.focus();
      return;
    }

    Keyboard.dismiss();
    submittingRef.current = true;
    try {
      const ok = await resetPassword(email, code, password);
      if (ok) router.replace("/(auth)/reset/done");
    } finally {
      submittingRef.current = false;
    }
  }, [busy, clearError, code, email, password, resetPassword]);

  const resend = useCallback(async () => {
    if (resending || !email) return;
    setResending(true);
    try {
      const challenge = await authApi.resendCode(email, "reset_password");
      restart(challenge.resendAfterSeconds);
      setCode("");
      setCodeError(null);
      setCodeTouched(false);
      otpRef.current?.focus();
    } catch (err) {
      showSnackbar({
        message: safeResetErrorMessage(err instanceof Error ? err.message : ""),
        type: "error",
      });
    } finally {
      setResending(false);
    }
  }, [email, resending, restart, showSnackbar]);

  if (!email) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="reset-confirm"
      footer={
        <Button
          label="Save new password"
          onPress={submit}
          loading={busy}
          testID="reset-save"
        />
      }
    >
      <BackHeader title="Reset password" onBack={() => router.back()} padding={0} />

      <Text variant="displayXs" color={colors.t0} style={{ marginTop: 14 }}>
        Enter the code, then pick a new password
      </Text>
      <Text variant="bodySm" color={colors.t2} style={{ marginTop: 9 }}>
        {`Sent to ${email}`}
      </Text>

      <OtpInput
        ref={otpRef}
        value={code}
        onChange={handleCodeChange}
        length={CODE_LENGTH}
        cellHeight={controlHeight.otpCellSm}
        // No auto-submit here: unlike A8, the code is only half the form.
        autoFocus
        style={{ marginTop: 20 }}
        testID="reset-otp"
      />

      {codeError ? (
        <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 6 }}>
          {codeError}
        </Text>
      ) : null}

      <PasswordField
        ref={passwordRef}
        isNew
        label="NEW PASSWORD"
        value={password}
        onChangeText={handlePasswordChange}
        onBlur={() => {
          setPasswordTouched(true);
          setPasswordError(validateResetConfirmation(code, password).password);
        }}
        error={passwordError ?? passwordApiError}
        containerStyle={{ marginTop: 22 }}
        testID="reset-password"
      />

      {password.length > 0 ? (
        <StrengthMeter
          score={strength.score}
          label={strength.label}
          color={strength.color}
          style={{ marginTop: 11 }}
        />
      ) : null}

      <RequirementList rules={rules} style={{ marginTop: 16 }} />

      <View style={{ marginTop: 22 }}>
        <ResendTimer secondsRemaining={secondsRemaining} onResend={resend} />
      </View>
    </ScrollScreen>
  );
}
