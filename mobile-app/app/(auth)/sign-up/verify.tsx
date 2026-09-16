/**
 * A8 · Create account, step 3 of 4 — "Enter the six-digit code".
 *
 * From the artboard's caption: "Six boxes, paste and autofill, auto-submit on the
 * sixth digit. A wrong code shakes the row and clears it."
 *
 * The auto-submit is the reason this screen has no primary button in practice —
 * `Continue` exists for the case where autofill filled the row while the person
 * was looking away, but the normal path never touches it.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { StepHeader } from "@/components/ui/Progress";
import OtpInput, {
  ResendTimer,
  useCountdown,
  type OtpInputHandle,
} from "@/components/ui/OtpInput";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { safeLoginErrorMessage } from "@/lib/auth/login-validation";
import { validateVerificationCode } from "@/lib/auth/signup-validation";

const CODE_LENGTH = 6;

export default function VerifyCodeScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ resendAfter?: string }>();
  const { signUpDraft, verifyEmail, resendVerification, busy, error, clearError } = useAuth();
  const { showSnackbar } = useSnackbar();

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const otpRef = useRef<OtpInputHandle>(null);
  const lastOutcomeRef = useRef<"verified" | "verification_failed" | "consent_failed" | null>(null);
  const { secondsRemaining, restart } = useCountdown(Number(params.resendAfter ?? 30));

  /**
   * A wrong code shakes and clears only the OTP row. Consent persistence can
   * fail after a valid code, so that error is shown without discarding the code.
   */
  useEffect(() => {
    if (!error) return;
    showSnackbar({ message: safeLoginErrorMessage(error), type: "error" });
    if (lastOutcomeRef.current === "verification_failed" && code.length === CODE_LENGTH) {
      otpRef.current?.shake();
    }
    clearError();
  }, [clearError, code.length, error, showSnackbar]);

  const submit = useCallback(
    async (value: string) => {
      const validationError = validateVerificationCode(value);
      setCodeError(validationError);
      if (validationError || busy) return;
      const outcome = await verifyEmail(value);
      lastOutcomeRef.current = outcome;
      if (outcome === "verified") router.replace("/(onboarding)/notifications");
    },
    [busy, verifyEmail],
  );

  const handleCodeChange = useCallback((value: string) => {
    setCode(value);
    if (codeError) setCodeError(validateVerificationCode(value));
  }, [codeError]);

  const resend = useCallback(async () => {
    const wait = await resendVerification();
    // Restart from the server's own cooldown, so the countdown cannot promise a
    // resend the API will refuse.
    restart(wait ?? 30);
    setCode("");
    otpRef.current?.focus();
  }, [resendVerification, restart]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      testID="signup-verify"
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
          <Button
            label="Continue"
            onPress={() => submit(code)}
            loading={busy}
            style={{ flex: 1 }}
            testID="verify-continue"
          />
        </View>
      }
    >
      <BackHeader title="Create account" onBack={() => router.back()} padding={0} />
      <StepHeader step={2} total={2} name="Verify" />

      <Text variant="displaySm" color={colors.t0} style={{ marginTop: 34, fontSize: 27 }}>
        Enter the six-digit code
      </Text>
      <Text variant="body" color={colors.t2} style={{ marginTop: 10 }}>
        {`Sent to ${signUpDraft?.email ?? "your email"}`}
      </Text>

      <OtpInput
        ref={otpRef}
        value={code}
        onChange={handleCodeChange}
        onComplete={submit}
        length={CODE_LENGTH}
        style={{ marginTop: 30 }}
        testID="verify-otp"
      />
      {codeError ? (
        <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 6 }}>
          {codeError}
        </Text>
      ) : null}

      {/* The artboard states the affordance rather than leaving it to be discovered. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 20,
          backgroundColor: colors.s3,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <Text variant="bodyXs" color={colors.t2} style={{ flex: 1 }}>
          Paste or autofill works. It submits itself on the sixth digit.
        </Text>
      </View>

      <ResendTimer
        secondsRemaining={secondsRemaining}
        onResend={resend}
        testID="verify-resend"
      />
    </ScrollScreen>
  );
}
