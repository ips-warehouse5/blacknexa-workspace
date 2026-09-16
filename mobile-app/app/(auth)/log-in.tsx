/** A10 · Log in. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import type { TextInput } from "react-native";
import type { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, useFocusEffect } from "expo-router";
import { alpha, colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";
import Button from "@/components/ui/Button";
import TextField, { PasswordField } from "@/components/ui/TextField";
import { ScrollScreen } from "@/components/ui/Screen";
import { ShieldMark } from "@/app/(auth)/intro";
import { useAuth } from "@/providers/AuthProvider";
import { useSnackbar } from "@/providers/SnackbarProvider";
import { safeLoginErrorMessage, validateLoginForm } from "@/lib/auth/login-validation";

export default function LogInScreen(): React.ReactElement {
  const { login, busy, error, clearError } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  const offsets = useRef({ email: 0, password: 0 });
  const submittingRef = useRef(false);
  const shownErrorRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      clearError();
      return clearError;
    }, [clearError]),
  );

  // Auth errors are general failures, not proof that either individual field is
  // wrong, so they live in the app-wide Snackbar instead of beneath an input.
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

  const handleEmailChange = useCallback(
    (text: string) => {
      if (error) clearError();
      setEmail(text);
      if (emailTouched) setEmailError(validateLoginForm(text, password).email);
    },
    [clearError, emailTouched, error, password],
  );

  const handlePasswordChange = useCallback(
    (text: string) => {
      if (error) clearError();
      setPassword(text);
      if (passwordTouched) setPasswordError(validateLoginForm(email, text).password);
    },
    [clearError, email, error, passwordTouched],
  );

  const handleEmailBlur = useCallback(() => {
    setEmailTouched(true);
    setEmailError(validateLoginForm(email, password).email);
  }, [email, password]);

  const handlePasswordBlur = useCallback(() => {
    setPasswordTouched(true);
    setPasswordError(validateLoginForm(email, password).password);
  }, [email, password]);

  const submit = useCallback(async () => {
    if (busy || submittingRef.current) return;

    clearError();
    setEmailTouched(true);
    setPasswordTouched(true);
    const validation = validateLoginForm(email, password);
    setEmailError(validation.email);
    setPasswordError(validation.password);

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

    submittingRef.current = true;
    Keyboard.dismiss();
    try {
      // Passwords are opaque credentials: only email is normalized for transport.
      await login(validation.emailForSubmission!, password);
    } finally {
      submittingRef.current = false;
    }
  }, [busy, clearError, email, login, password, scrollTo]);

  return (
    <ScrollScreen
      padding={screenPadding.hero}
      scrollRef={scrollRef}
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
      <Pressable onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ alignItems: "center", marginTop: 56 }}>
          <View style={styles.mark}>
            <ShieldMark size={23} />
          </View>
        </View>

        <Text variant="displaySm" color={colors.t0} center style={{ marginTop: 22 }}>
          Welcome back
        </Text>

        <TextField
          ref={emailRef}
          label="EMAIL"
          value={email}
          onChangeText={handleEmailChange}
          onBlur={handleEmailBlur}
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
          containerStyle={{ marginTop: 26 }}
          testID="log-in-email"
        />

        <PasswordField
          ref={passwordRef}
          label="PASSWORD"
          value={password}
          onChangeText={handlePasswordChange}
          onBlur={handlePasswordBlur}
          error={passwordError}
          placeholder="Password"
          returnKeyType="go"
          onSubmitEditing={submit}
          onLayoutY={(y) => {
            offsets.current.password = y;
          }}
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

        <Pressable
          onPress={() => router.push("/(auth)/reset/request")}
          hitSlop={10}
          style={{ marginTop: 16, alignSelf: "center", paddingVertical: 8 }}
        >
          <Text variant="label" color={colors.acc}>
            Forgot your password?
          </Text>
        </Pressable>
      </Pressable>
    </ScrollScreen>
  );
}

const styles = {
  mark: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: colors.s3,
    borderWidth: 1,
    borderColor: alpha(colors.acc, 0.3),
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
