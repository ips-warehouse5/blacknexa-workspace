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

import React, { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import type { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors, controlHeight, screenPadding } from "@/constants/theme";
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
import authApi from "@/lib/api/auth";

const CODE_LENGTH = 6;

export default function ResetConfirmScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ email?: string; resendAfter?: string }>();
  const email = params.email ?? "";
  const { resetPassword, busy, error, clearError } = useAuth();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  /** Set when the server rejects the password as previously used. */
  const [reused, setReused] = useState(false);
  const otpRef = useRef<OtpInputHandle>(null);
  const passwordRef = useRef<TextInput>(null);
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
      // Only the server can know this, so it stays unmet until it accepts.
      { label: "Not a password you have used here before", met: !reused && password.length >= 10 },
    ],
    [password.length, reused, strength.rules],
  );

  const submit = useCallback(async () => {
    clearError();
    if (code.length !== CODE_LENGTH) {
      otpRef.current?.focus();
      return;
    }
    if (strength.score < strength.rules.length) {
      passwordRef.current?.focus();
      return;
    }
    const ok = await resetPassword(email, code, password);
    if (ok) {
      router.replace("/(auth)/reset/done");
      return;
    }
    setReused(true);
  }, [clearError, code, email, password, resetPassword, strength]);

  const resend = useCallback(async () => {
    const challenge = await authApi
      .resendCode(email, "reset_password")
      .catch(() => null);
    restart(challenge?.resendAfterSeconds ?? 30);
    setCode("");
    otpRef.current?.focus();
  }, [email, restart]);

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
        onChange={setCode}
        length={CODE_LENGTH}
        cellHeight={controlHeight.otpCellSm}
        // No auto-submit here: unlike A8, the code is only half the form.
        autoFocus
        style={{ marginTop: 20 }}
        testID="reset-otp"
      />

      <PasswordField
        ref={passwordRef}
        isNew
        label="NEW PASSWORD"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          // A rejection is about the old value, so a new one clears it.
          if (reused) setReused(false);
        }}
        error={error && reused ? error : null}
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
