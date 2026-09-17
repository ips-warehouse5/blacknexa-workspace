/**
 * H7 · Change password.
 *
 * The backend has no "current password + new password" endpoint — the only
 * real password-change mechanism is the email-OTP reset flow already built
 * for A13/A14 (`forgotPassword` → `resetPassword`). Rather than invent a
 * second, fake-looking "current password" field with nothing behind it,
 * this screen reuses that exact real flow: it fires the OTP email itself
 * on mount (the user is already authenticated, so their email is already
 * known — no need to ask them to type it), then reuses the same OTP +
 * new-password UI and validation as `app/(auth)/reset/confirm.tsx` — same
 * components, same rules, not a parallel reimplementation.
 *
 * `resetPassword` ends every other session but not this one (server
 * behavior, unchanged) and re-adopts fresh tokens for this device, so
 * staying on this screen afterward is safe.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import type { TextInput } from "react-native";
import { router } from "expo-router";
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

export default function ChangePasswordScreen(): React.ReactElement {
  useThemeSync();
  const { user, forgotPassword, resetPassword, busy, error, clearError } = useAuth();
  const { showSnackbar } = useSnackbar();
  const email = user?.email ?? "";

  const [requesting, setRequesting] = useState(true);
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
  const requestedRef = useRef(false);
  const shownErrorRef = useRef<string | null>(null);
  const { secondsRemaining, restart } = useCountdown(0);

  // Fire the OTP email once, on mount — the same request A13 makes, just
  // for the already-known account email instead of a typed-in one.
  useEffect(() => {
    if (requestedRef.current || !email) return;
    requestedRef.current = true;
    (async () => {
      try {
        const challenge = await forgotPassword(email);
        restart(challenge?.resendAfterSeconds ?? 30);
      } catch {
        showSnackbar({
          message: "Couldn't send a verification code. Please try again.",
          type: "error",
        });
      } finally {
        setRequesting(false);
      }
    })();
  }, [email, forgotPassword, restart, showSnackbar]);

  const strength = evaluatePassword(password);

  const rules = useMemo<PasswordRule[]>(
    () => [
      { label: "At least 10 characters", met: strength.rules[0].met },
      {
        label: "One capital letter, one number, one symbol",
        met: strength.rules[1].met && strength.rules[2].met && strength.rules[3].met,
      },
      { label: "Not a password you have used here before", met: false },
    ],
    [strength.rules],
  );

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
    if (busy || submittingRef.current || !email) return;

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
      if (ok) {
        showSnackbar({ message: "Password changed.", type: "success" });
        router.back();
      }
    } finally {
      submittingRef.current = false;
    }
  }, [busy, clearError, code, email, password, resetPassword, showSnackbar]);

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
      testID="change-password"
      footer={
        <Button
          label="Save password"
          onPress={submit}
          loading={busy || requesting}
          disabled={requesting}
          testID="change-password-save"
        />
      }
    >
      <BackHeader title="Change password" onBack={() => router.back()} padding={0} />

      <Text variant="displayXs" color={colors.t0} style={{ marginTop: 14 }}>
        Confirm it&rsquo;s you, then pick a new password
      </Text>
      <Text variant="bodySm" color={colors.t2} style={{ marginTop: 9 }}>
        {requesting ? `Sending a code to ${email}…` : `Sent to ${email}`}
      </Text>

      <View
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 14,
          backgroundColor: colors.s3,
        }}
      >
        <Text variant="bodyXs" color={colors.t3}>
          Saving signs your other devices out. This one stays signed in.
        </Text>
      </View>

      <OtpInput
        ref={otpRef}
        value={code}
        onChange={handleCodeChange}
        length={CODE_LENGTH}
        cellHeight={controlHeight.otpCellSm}
        autoFocus
        style={{ marginTop: 20 }}
        testID="change-password-otp"
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
        testID="change-password-field"
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
