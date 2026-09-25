/** A6 · Create account, step 1 of 2 — Account. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { TextInput } from "react-native";
import type { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { colors, screenPadding, useThemeSync } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField, { PasswordField } from "@/components/ui/TextField";
import { ScrollScreen, BackHeader } from "@/components/ui/Screen";
import { Checkbox } from "@/components/ui/Controls";
import {
  StepHeader,
  StrengthMeter,
  RequirementList,
  evaluatePassword,
} from "@/components/ui/Progress";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { useScreenFocused } from "@/lib/ui/use-screen-focused";
import { safeLoginErrorMessage } from "@/lib/auth/login-validation";
import { validateSignUpAccount } from "@/lib/auth/signup-validation";

export default function SignUpAccountScreen(): React.ReactElement {
  useThemeSync();
  const { register, busy, error, clearError, signUpDraft } = useAuth();
  const isFocused = useScreenFocused();
  const { showSnackbar } = useSnackbar();
  const [firstName, setFirstName] = useState(signUpDraft?.firstName ?? "");
  const [lastName, setLastName] = useState(signUpDraft?.lastName ?? "");
  const [email, setEmail] = useState(signUpDraft?.email ?? "");
  const [password, setPassword] = useState(signUpDraft?.password ?? "");
  const [agreedToTerms, setAgreedToTerms] = useState(
    signUpDraft?.agreedToTerms ?? false,
  );
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const scrollRef =
    useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const offsets = useRef({ firstName: 0, email: 0, password: 0, consent: 0 });
  const submittingRef = useRef(false);
  const shownErrorRef = useRef<string | null>(null);
  const strength = evaluatePassword(password);

  useFocusEffect(
    useCallback(() => {
      clearError();
      return clearError;
    }, [clearError]),
  );

  useEffect(() => {
    if (!error) {
      shownErrorRef.current = null;
      return;
    }
    // Every screen in the stack watches the same auth error; only the one
    // on top shows it, or the message repeats once per mounted screen.
    if (!isFocused) return;
    if (shownErrorRef.current === error) return;
    shownErrorRef.current = error;
    showSnackbar({ message: safeLoginErrorMessage(error), type: "error" });
    clearError();
  }, [clearError, error, showSnackbar, isFocused]);

  const scrollTo = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 100000, animated: true });
  }, []);

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value);
      // Mirrors the password field: once the field has been left at least
      // once (`emailTouched`), keep re-checking on every keystroke so a fix
      // clears the error immediately rather than leaving it stuck until the
      // next blur or a submit attempt.
      if (emailTouched) {
        setEmailError(
          validateSignUpAccount(value, password, agreedToTerms, firstName, lastName).email,
        );
      } else if (emailError) {
        setEmailError(null);
      }
    },
    [agreedToTerms, emailError, emailTouched, firstName, lastName, password],
  );

  const handleFirstNameChange = useCallback(
    (value: string) => {
      setFirstName(value);
      // Same rule as email: clear a shown error while it is being corrected,
      // rather than re-validating on every keystroke.
      if (firstNameError) setFirstNameError(null);
    },
    [firstNameError],
  );

  const handlePasswordChange = useCallback(
    (value: string) => {
      setPassword(value);
      if (passwordTouched)
        setPasswordError(
          validateSignUpAccount(
            email,
            value,
            agreedToTerms,
            firstName,
            lastName,
          ).password,
        );
    },
    [agreedToTerms, email, passwordTouched],
  );

  const toggleConsent = useCallback(() => {
    const next = !agreedToTerms;
    setAgreedToTerms(next);
    setConsentError(
      validateSignUpAccount(email, password, next, firstName, lastName).consent,
    );
  }, [agreedToTerms, email, password]);

  const submit = useCallback(async () => {
    if (busy || submittingRef.current) return;
    clearError();
    const validation = validateSignUpAccount(
      email,
      password,
      agreedToTerms,
      firstName,
      lastName,
    );
    setFirstNameError(validation.firstName);
    setEmailError(validation.email);
    setPasswordError(validation.password);
    setConsentError(validation.consent);

    // First, because it is now the first field on the screen — A6's rule is to
    // scroll to the *first* problem, not to whichever one is checked first.
    if (validation.firstName) {
      scrollTo(offsets.current.firstName);
      firstNameRef.current?.focus();
      return;
    }
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
      Keyboard.dismiss();
      scrollToBottom();
      return;
    }

    submittingRef.current = true;
    try {
      const result = await register(
        validation.emailForSubmission!,
        password,
        validation.firstNameForSubmission!,
        validation.lastNameForSubmission,
        agreedToTerms,
      );
      if (result) {
        router.push({
          pathname: "/(auth)/sign-up/verify",
          params: { resendAfter: String(result.resendAfterSeconds) },
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }, [
    agreedToTerms,
    busy,
    clearError,
    email,
    firstName,
    lastName,
    password,
    register,
    scrollTo,
    scrollToBottom,
  ]);

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
            onPress={submit}
            loading={busy}
            style={{ flex: 1 }}
            testID="signup-account-continue"
          />
        </View>
      }
    >
      <View style={{ flex: 1 }}>
        <BackHeader
          title="Create account"
          onBack={() => router.back()}
          padding={0}
        />
        <StepHeader step={1} total={2} name="Account" />
        <Text variant="displayXs" color={colors.t0} style={{ marginTop: 26 }}>
          Set up your login
        </Text>

        <TextField
          ref={firstNameRef}
          label="FIRST NAME"
          value={firstName}
          onChangeText={handleFirstNameChange}
          error={firstNameError}
          placeholder="Your first name"
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => lastNameRef.current?.focus()}
          onLayoutY={(y) => {
            offsets.current.firstName = y;
          }}
          containerStyle={{ marginTop: 24 }}
          testID="signup-first-name"
        />

        {/* Optional — plenty of people have one name, and the server agrees. */}
        <TextField
          ref={lastNameRef}
          label="LAST NAME"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Your last name"
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => emailRef.current?.focus()}
          containerStyle={{ marginTop: 18 }}
          testID="signup-last-name"
        />

        <TextField
          ref={emailRef}
          label="EMAIL"
          value={email}
          onChangeText={handleEmailChange}
          onBlur={() => {
            setEmailTouched(true);
            setEmailError(
              validateSignUpAccount(email, password, agreedToTerms, firstName, lastName).email,
            );
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
          onLayoutY={(y) => {
            offsets.current.email = y;
          }}
          containerStyle={{ marginTop: 18 }}
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
            setPasswordError(
              validateSignUpAccount(
                email,
                password,
                agreedToTerms,
                firstName,
                lastName,
              ).password,
            );
          }}
          error={passwordError}
          placeholder="Create a password"
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

        <View style={{ marginTop: "auto", paddingTop: 22 }}>
          <View
            onLayout={(event) => {
              offsets.current.consent = event.nativeEvent.layout.y;
            }}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 11,
              paddingBottom: 8,
            }}
          >
            <Checkbox
              checked={agreedToTerms}
              onToggle={toggleConsent}
              accessibilityLabel="Agree to the Terms of Service and Privacy Policy"
              testID="signup-consent"
            />
            <Text variant="bodyXs" color={colors.t2} style={{ flex: 1 }}>
              I agree to the{" "}
              <Text
                variant="bodyXs"
                color={colors.acc}
                onPress={() => router.push("/legal/terms")}
              >
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text
                variant="bodyXs"
                color={colors.acc}
                onPress={() => router.push("/legal/privacy")}
              >
                Privacy Policy
              </Text>
              {", and I understand how my evidence is stored."}
            </Text>
          </View>
          {consentError ? (
            <Text variant="metaSm" color={colors.bad2} style={{ marginTop: 6 }}>
              {consentError}
            </Text>
          ) : null}
        </View>
      </View>
    </ScrollScreen>
  );
}
