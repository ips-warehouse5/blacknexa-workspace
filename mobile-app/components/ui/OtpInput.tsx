/**
 * The six-cell code entry on screens A8 and A14.
 *
 * The artboards specify: six cells, flex 1, h 58–60, r 13, `s3` fill; the focused
 * cell gets `s2` plus a 1.5px accent border and a 2px caret. A8's caption adds
 * three behaviours that are the whole point of the component:
 *
 *   "Paste or autofill works. It submits itself on the sixth digit."
 *   "A wrong code shakes the row and clears it."
 *
 * ── Why one hidden input, not six ──────────────────────────────────────────
 * Six separate inputs are the obvious build and the wrong one: paste puts the
 * whole code in one cell, iOS autofill only fills the first, and backspace across
 * a boundary needs manual focus juggling that never quite feels right. So there
 * is a single full-width transparent input over painted cells — paste, SMS
 * autofill, keyboard dismissal and selection all then work because they are the
 * platform's own behaviour rather than a reimplementation of it.
 */

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, controlHeight, radius } from "@/constants/theme";
import { type as T } from "@/constants/typography";
import Text from "@/components/ui/Text";

export interface OtpInputHandle {
  focus: () => void;
  clear: () => void;
  /** Shake the row and clear it — A8's response to a wrong code. */
  shake: () => void;
}

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the last cell is filled. A8: "It submits itself on the sixth digit." */
  onComplete?: (value: string) => void;
  length?: number;
  cellHeight?: number;
  autoFocus?: boolean;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const OtpInput = React.forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  {
    value,
    onChange,
    onComplete,
    length = 6,
    cellHeight = controlHeight.otpCell,
    autoFocus = true,
    editable = true,
    style,
    testID,
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shakeX = useRef(new Animated.Value(0)).current;
  const caret = useRef(new Animated.Value(1)).current;
  /** Guards against firing `onComplete` twice for the same value. */
  const completedFor = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => onChange(""),
    shake: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      // Four decreasing swings: enough to read as a rejection, short enough not
      // to delay the retry.
      Animated.sequence([
        Animated.timing(shakeX, { toValue: 9, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -9, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 5, duration: 45, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
      ]).start(() => {
        onChange("");
        completedFor.current = null;
        inputRef.current?.focus();
      });
    },
  }));

  /** Blink the caret in the active cell. */
  useEffect(() => {
    if (!focused) {
      caret.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 480, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [caret, focused]);

  const handleChange = useCallback(
    (raw: string) => {
      // Keep digits only, so a pasted "417-926" or "417 926" still lands cleanly.
      const digits = raw.replace(/\D/g, "").slice(0, length);
      onChange(digits);

      if (digits.length === length) {
        if (completedFor.current !== digits) {
          completedFor.current = digits;
          if (Platform.OS !== "web") {
            Haptics.selectionAsync().catch(() => {});
          }
          onComplete?.(digits);
        }
      } else {
        completedFor.current = null;
      }
    },
    [length, onChange, onComplete],
  );

  const cells = Array.from({ length }, (_, index) => index);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      testID={testID}
    >
      <Animated.View style={[styles.row, { transform: [{ translateX: shakeX }] }, style]}>
        {cells.map((index) => {
          const char = value[index] ?? "";
          const isActive = focused && index === activeIndex && value.length < length;

          return (
            <View
              key={index}
              style={[
                styles.cell,
                { height: cellHeight },
                isActive && styles.cellActive,
              ]}
            >
              {char ? (
                <Text style={[T.otp, { color: colors.t0 }]} maxFontSizeMultiplier={1.2}>
                  {char}
                </Text>
              ) : isActive ? (
                <Animated.View style={[styles.caret, { opacity: caret }]} />
              ) : null}
            </View>
          );
        })}
      </Animated.View>

      {/*
        One transparent input covering the whole row. `caretHidden` because the
        painted caret above is the one the design draws, and the real one would
        sit in the wrong place.
      */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        // The two attributes that make OS autofill offer the emailed code.
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        maxLength={length}
        caretHidden
        accessibilityLabel={`Verification code, ${length} digits`}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 9 },
  cell: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.s3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    // Transparent at rest so the focused border does not change the cell size.
    borderColor: "transparent",
  },
  cellActive: {
    backgroundColor: colors.s2,
    borderColor: colors.acc,
  },
  caret: { width: 2, height: 28, backgroundColor: colors.acc, borderRadius: 1 },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Fully transparent rather than zero-sized: a zero-sized input is skipped by
    // autofill on both platforms.
    opacity: 0,
    color: "transparent",
    backgroundColor: "transparent",
  },
});

/**
 * "Resend code in 0:24" — the countdown under the cells on A8 and A14.
 *
 * Ticks off a target timestamp rather than decrementing a counter, so it stays
 * accurate when the app is backgrounded mid-countdown and the interval stops
 * firing.
 */
export function ResendTimer({
  secondsRemaining,
  onResend,
  testID,
}: {
  secondsRemaining: number;
  onResend: () => void;
  testID?: string;
}): React.ReactElement {
  if (secondsRemaining > 0) {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    return (
      <Text variant="labelSm" color={colors.t3} center testID={testID}>
        {`Resend code in ${minutes}:${String(seconds).padStart(2, "0")}`}
      </Text>
    );
  }

  return (
    <Pressable
      onPress={onResend}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Resend code"
      testID={testID}
    >
      <Text variant="labelSm" color={colors.acc} center>
        Resend code
      </Text>
    </Pressable>
  );
}

/** Countdown hook driven by a wall-clock deadline. */
export function useCountdown(initialSeconds: number): {
  secondsRemaining: number;
  restart: (seconds: number) => void;
} {
  const [deadline, setDeadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadline]);

  const restart = useCallback((seconds: number) => {
    setDeadline(Date.now() + seconds * 1000);
  }, []);

  return { secondsRemaining, restart };
}

export default OtpInput;
