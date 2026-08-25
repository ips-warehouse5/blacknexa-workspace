/**
 * Text and password fields.
 *
 * From the artboards: h 50–52, r 13, `s3` fill, no border at rest, and a
 * 1px accent-40% border when focused (A6's password field, A13's email field).
 *
 * ── Errors never appear while someone is typing ─────────────────────────────
 * A6's caption is explicit: "Requirements stay neutral grey until met — never red
 * while typing", and "tapping Continue early scrolls to what is missing and
 * prints the rule in words under that field". So `error` is set by the *submit*
 * path, and this component clears it as soon as the field changes — a person
 * fixing a problem should not be shouted at mid-correction.
 *
 * ── Scroll-to-error ────────────────────────────────────────────────────────
 * `onLayoutY` reports the field's offset inside its scroll container so the form
 * can scroll to the first problem. Measuring at layout, rather than with a ref
 * measure at submit time, keeps that instant.
 */

import React, { forwardRef, useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { alpha, colors, controlHeight, radius } from "@/constants/theme";
import { fonts } from "@/constants/typography";
import Text from "@/components/ui/Text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  /** Uppercase eyebrow above the field — "EMAIL", "DISPLAY NAME". */
  label?: string;
  /** Set by submit validation, not by keystroke. */
  error?: string | null;
  /** Quiet helper under the field. Hidden while an error is showing. */
  hint?: string;
  /** Right-aligned counter, e.g. C2's "44/70". */
  counter?: string;
  /** Trailing control — the eye toggle, a clear button. */
  accessory?: React.ReactNode;
  /** Reports the field's y-offset so a form can scroll to the first problem. */
  onLayoutY?: (y: number) => void;
  containerStyle?: StyleProp<ViewStyle>;
  height?: number;
  /** Grow with content — C2's "what happened" box. */
  multilineHeight?: number;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    hint,
    counter,
    accessory,
    onLayoutY,
    containerStyle,
    height = controlHeight.field,
    multilineHeight,
    onFocus,
    onBlur,
    onChangeText,
    multiline,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  /**
   * The error is suppressed locally the moment the field changes, so the caller
   * can keep its own validation state without having to clear it on every
   * keystroke.
   */
  const [dirtySinceError, setDirtySinceError] = useState(false);
  const visibleError = error && !dirtySinceError ? error : null;

  const handleChange = useCallback(
    (value: string) => {
      if (error) setDirtySinceError(true);
      onChangeText?.(value);
    },
    [error, onChangeText],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayoutY?.(event.nativeEvent.layout.y);
    },
    [onLayoutY],
  );

  const resolvedHeight = multiline ? (multilineHeight ?? 120) : height;

  return (
    <View onLayout={handleLayout} style={containerStyle}>
      {label ? (
        <Text variant="fieldLabel" color={colors.t3} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            height: resolvedHeight,
            alignItems: multiline ? "flex-start" : "center",
            paddingVertical: multiline ? 13 : 0,
          },
          focused && styles.fieldFocused,
          // An error outranks focus: it is the thing the person needs to see.
          visibleError ? styles.fieldError : null,
        ]}
      >
        <TextInput
          ref={ref}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onChangeText={handleChange}
          placeholderTextColor={colors.t5}
          selectionColor={colors.acc}
          // A field's own text must scale with accessibility settings, but not so
          // far that it outgrows a fixed-height row.
          maxFontSizeMultiplier={multiline ? undefined : 1.3}
          style={[styles.input, multiline && styles.inputMultiline]}
          {...rest}
        />
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>

      {(visibleError || hint || counter) && (
        <View style={styles.footer}>
          <View style={styles.footerText}>
            {visibleError ? (
              <Text variant="metaSm" color={colors.bad2}>
                {visibleError}
              </Text>
            ) : hint ? (
              <Text variant="metaSm" color={colors.t4}>
                {hint}
              </Text>
            ) : null}
          </View>
          {counter ? (
            <Text variant="metaSm" color={colors.t4}>
              {counter}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
});

/**
 * A6 / A10 / A14's password field, with the eye toggle drawn in the artboards.
 *
 * `textContentType` matters more than it looks: without `newPassword` iOS offers
 * the wrong autofill and will not suggest a strong password, and without
 * `oneTimeCode` on the OTP field the SMS/mail suggestion never appears at all.
 */
export const PasswordField = forwardRef<TextInput, TextFieldProps & { isNew?: boolean }>(
  function PasswordField({ isNew = false, ...rest }, ref) {
    const [revealed, setRevealed] = useState(false);

    return (
      <TextField
        ref={ref}
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textContentType={isNew ? "newPassword" : "password"}
        autoComplete={isNew ? "new-password" : "current-password"}
        // Mirrors the four requirement rows on A6 so iOS suggests a password that
        // actually passes them.
        passwordRules={
          isNew
            ? "minlength: 10; required: upper; required: digit; required: [-().&@?'#,/&quot;+];"
            : undefined
        }
        accessory={
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            <EyeIcon open={!revealed} />
          </Pressable>
        }
        {...rest}
      />
    );
  },
);

/** The eye glyph from the A6 / A14 artboards, at 20×20. */
function EyeIcon({ open }: { open: boolean }): React.ReactElement {
  // Drawn with views rather than SVG: two rounded shapes at this size read
  // identically and cost nothing to render.
  return (
    <View style={styles.eye}>
      <View style={styles.eyeOuter} />
      <View style={styles.eyePupil} />
      {!open ? <View style={styles.eyeSlash} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  field: {
    flexDirection: "row",
    backgroundColor: colors.s3,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    borderWidth: 1,
    // A transparent border at rest keeps the height identical when focus adds
    // one — without this the field shifts by 2px on focus.
    borderColor: "transparent",
  },
  fieldFocused: { borderColor: alpha(colors.acc, 0.4) },
  fieldError: { borderColor: alpha(colors.bad, 0.5) },
  input: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    color: colors.t0,
    // Android adds vertical padding that breaks a fixed-height row.
    paddingVertical: 0,
    ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : null),
  },
  inputMultiline: {
    fontSize: 14,
    lineHeight: 22,
    ...(Platform.OS === "android" ? { textAlignVertical: "top" as const } : null),
  },
  accessory: { marginLeft: 10, alignItems: "center", justifyContent: "center" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
    gap: 12,
  },
  footerText: { flex: 1 },

  eye: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  eyeOuter: {
    width: 19,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.t3,
  },
  eyePupil: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.5,
    borderColor: colors.t3,
  },
  eyeSlash: {
    position: "absolute",
    width: 22,
    height: 1.5,
    backgroundColor: colors.t3,
    transform: [{ rotate: "-45deg" }],
  },
});

export default TextField;
