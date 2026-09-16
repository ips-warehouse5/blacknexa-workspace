/** A6 · Create account, step 1 of 2 — Account. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { TextInput } from "react-native";
import type { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField, { PasswordField } from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Checkbox } from "@/components/ui/Controls";
import { StepHeader, StrengthMeter, RequirementList, evaluatePassword } from "@/components/ui/Progress";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { safeLoginErrorMessage } from "@/lib/auth/login-validation";
import { validateSignUpAccount } from "@/lib/auth/signup-validation";

export default function SignUpAccountScreen(): React.ReactElement {
  const { register, busy, error, clearError, signUpDraft } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [email, setEmail] = useState(signUpDraft?.email ?? "");
  const [password, setPassword] = useState(signUpDraft?.password ?? "");
  const [agreedToTerms, setAgreedToTerms] = useState(signUpDraft?.agreedToTerms ?? false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const offsets = useRef({ email: 0, password: 0, consent: 0 });
  const submittingRef = useRef(false);
  const shownErrorRef = useRef<string | null>(null);
  const strength = evaluatePassword(password);

  useFocusEffect(useCallback(() => {
    clearError();
    return clearError;
  }, [clearError]));

  useEffect(() => {
    if (!error) {
      shownErrorRef.current = null;
      return;
    }
    if (shownErrorRef.current === error) return;
    shownErrorRef.current = error;
    showSnackbar({ message: safeLoginErrorMessage(error), type: "error" });
    clearError();
  }, [clearError, error, showSnackbar]);

  const scrollTo = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, []);

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value);
    if (emailTouched) setEmailError(validateSignUpAccount(value, password, agreedToTerms).email);
  }, [agreedToTerms, emailTouched, password]);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    if (passwordTouched) setPasswordError(validateSignUpAccount(email, value, agreedToTerms).password);
  }, [agreedToTerms, email, passwordTouched]);

  const toggleConsent = useCallback(() => {
    const next = !agreedToTerms;
    setAgreedToTerms(next);
    setConsentError(validateSignUpAccount(email, password, next).consent);
  }, [agreedToTerms, email, password]);

  const submit = useCallback(async () => {
    if (busy || submittingRef.current) return;
    clearError();
    const validation = validateSignUpAccount(email, password, agreedToTerms);
    setEmailError(validation.email);
    setPasswordError(validation.password);
    setConsentError(validation.consent);

    if (validation.email) {
      scrollTo(offsets.current.email);
      emailRef.current?.focus();
      return;
    }
    if (validation.password) {
      scrollTo(offsets.current.password);
      passwordRef.current?.focus();
      return;
    }
    if (validation.consent) {
      scrollTo(offsets.current.consent);
      return;
    }

    submittingRef.current = true;
    try {
      const result = await register(validation.emailForSubmission!, password, agreedToTerms);
      if (result) {
        router.push({
          pathname: "/(auth)/sign-up/verify",
          params: { resendAfter: String(result.resendAfterSeconds) },
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }, [agreedToTerms, busy, clearError, email, password, register, scrollTo]);

  return (
    <ScrollScreen
      padding={screenPadding.detail}
      scrollRef={scrollRef}
      contentStyle={{ flexGrow: 1 }}
      // The screen container already tracks the sticky footer. Keep the standard
      // clearance so the consent row sits directly above the actions.
      bottomSpace={24}
      testID="signup-account"
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Back" variant="quiet" block={false} height={52} style={{ width: 96 }} onPress={() => router.back()} />
          <Button label="Continue" onPress={submit} loading={busy} style={{ flex: 1 }} testID="signup-account-continue" />
        </View>
      }
    >
      <View style={{ flex: 1 }}>
        <BackHeader title="Create account" onBack={() => router.back()} padding={0} />
        <StepHeader step={1} total={2} name="Account" />
        <Text variant="displayXs" color={colors.t0} style={{ marginTop: 26 }}>Set up your login</Text>

        <TextField
        ref={emailRef}
        label="EMAIL"
        value={email}
        onChangeText={handleEmailChange}
        onBlur={() => {
          setEmailTouched(true);
          setEmailError(validateSignUpAccount(email, password, agreedToTerms).email);
        }}
        error={emailError}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        onLayoutY={(y) => { offsets.current.email = y; }}
        containerStyle={{ marginTop: 24 }}
        testID="signup-email"
        />

        <PasswordField
        ref={passwordRef}
        isNew
        label="PASSWORD"
        value={password}
        onChangeText={handlePasswordChange}
        onBlur={() => {
          setPasswordTouched(true);
          setPasswordError(validateSignUpAccount(email, password, agreedToTerms).password);
        }}
        error={passwordError}
        placeholder="Create a password"
        returnKeyType="go"
        onSubmitEditing={submit}
        onLayoutY={(y) => { offsets.current.password = y; }}
        containerStyle={{ marginTop: 18 }}
        testID="signup-password"
        />

        {password.length > 0 ? <StrengthMeter score={strength.score} label={strength.label} color={strength.color} style={{ marginTop: 11 }} /> : null}
        <RequirementList rules={strength.rules} style={{ marginTop: 18 }} testID="signup-requirements" />

        <View style={{ marginTop: "auto", paddingTop: 22 }}>
          <View onLayout={(event) => { offsets.current.consent = event.nativeEvent.layout.y; }} style={{ flexDirection: "row", alignItems: "flex-start", gap: 11, paddingBottom: 8 }}>
            <Checkbox checked={agreedToTerms} onToggle={toggleConsent} accessibilityLabel="Agree to the Terms of Service and Privacy Policy" testID="signup-consent" />
            <Text variant="bodyXs" color={colors.t2} style={{ flex: 1 }}>
              I agree to the {" "}
              <Text variant="bodyXs" color={colors.acc} onPress={() => router.push("/legal/terms")}>Terms of Service</Text>
              {" "}and {" "}
              <Text variant="bodyXs" color={colors.acc} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>
              {", and I understand how my evidence is stored."}
            </Text>
          </View>
          {consentError ? <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 6 }}>{consentError}</Text> : null}
        </View>
      </View>
    </ScrollScreen>
  );
}
