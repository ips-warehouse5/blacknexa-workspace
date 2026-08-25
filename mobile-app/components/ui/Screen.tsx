/**
 * Screen containers.
 *
 * This is where the plan's device-handling rules are enforced once instead of on
 * every screen.
 *
 * ── Never ship the artboard's numbers literally ────────────────────────────
 * The design is drawn at a fixed 390 × 844 with a flat 46px status bar and flat
 * 30px footers. Those are positions in a frame, not measurements: the 30px footer
 * padding is `12 + 18` on an iPhone with a home indicator, and on a device
 * without one it should be 12. So every inset here comes from
 * `useSafeAreaInsets()` and the artboard values appear only as the *minimum*.
 *
 * ── Keyboard ───────────────────────────────────────────────────────────────
 * `KeyboardAvoidingView` cannot express "a sticky footer that rides the keyboard
 * while the content scrolls under it", which is what A6, A9, A14, C2 and D4 all
 * need. `react-native-keyboard-controller` interpolates against the real keyboard
 * transition on both platforms, so the footer tracks the keyboard rather than
 * jumping when it settles.
 */

import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { alpha, colors, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";

/** Minimum bottom padding when the device has no home indicator. */
const MIN_BOTTOM = 12;

export interface ScreenProps {
  children: React.ReactNode;
  /** Horizontal padding. Defaults to the 20px used by auth forms and detail bodies. */
  padding?: number;
  /** Pad for the status bar. Off when the screen paints its own full-bleed art. */
  topInset?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A plain, non-scrolling screen. */
export function Screen({
  children,
  padding = screenPadding.detail,
  topInset = true,
  background = colors.bg,
  style,
  testID,
}: ScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          backgroundColor: background,
          paddingTop: topInset ? insets.top : 0,
          paddingHorizontal: padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface ScrollScreenProps extends ScreenProps {
  /** Extra space under the content, on top of the safe-area inset. */
  bottomSpace?: number;
  /** Rendered outside the scroll view, pinned above the keyboard. */
  footer?: React.ReactNode;
  /** Draw a hairline above the footer, as C1–C7 and D1 do. */
  footerBorder?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  /** Ref for programmatic scrolling — used by scroll-to-first-error. */
  scrollRef?: React.Ref<React.ComponentRef<typeof KeyboardAwareScrollView>>;
}

/**
 * A scrolling screen with an optional keyboard-tracking footer.
 *
 * `keyboardShouldPersistTaps="handled"` by default, because on C2 tapping a
 * prompt row while the text field has focus should act on the row rather than
 * spend the tap dismissing the keyboard.
 */
export function ScrollScreen({
  children,
  padding = screenPadding.detail,
  topInset = true,
  background = colors.bg,
  bottomSpace = 24,
  footer,
  footerBorder = false,
  style,
  contentStyle,
  keyboardShouldPersistTaps = "handled",
  scrollRef,
  testID,
}: ScrollScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, MIN_BOTTOM);

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: background, paddingTop: topInset ? insets.top : 0 }, style]}
    >
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          { paddingHorizontal: padding, paddingBottom: bottomSpace },
          contentStyle,
        ]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={false}
        // Keeps a focused field clear of the keyboard rather than flush against it.
        bottomOffset={24}
      >
        {children}
      </KeyboardAwareScrollView>

      {footer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: padding,
                paddingBottom: bottomPad,
                borderTopWidth: footerBorder ? StyleSheet.hairlineWidth : 0,
                borderTopColor: alpha(colors.t0, 0.07),
              },
            ]}
          >
            {footer}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

/**
 * A footer pinned to the bottom of a non-scrolling screen.
 *
 * Used by A5, A11 and A15, where the content is centred or fixed and only the
 * action row needs safe-area treatment.
 */
export function StickyFooter({
  children,
  padding = screenPadding.detail,
  border = false,
  style,
}: {
  children: React.ReactNode;
  padding?: number;
  border?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: padding,
            paddingBottom: Math.max(insets.bottom, MIN_BOTTOM),
            borderTopWidth: border ? StyleSheet.hairlineWidth : 0,
            borderTopColor: alpha(colors.t0, 0.07),
          },
          style,
        ]}
      >
        {children}
      </View>
    </KeyboardStickyView>
  );
}

/**
 * The back-chevron header used across A6–A9, A13, A14 and D4.
 *
 * Drawn with views rather than SVG — at 22px a two-stroke chevron is
 * indistinguishable and needs no renderer.
 */
export function BackHeader({
  title,
  onBack,
  right,
  padding = screenPadding.detail,
  border = false,
}: {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  padding?: number;
  border?: boolean;
}): React.ReactElement {
  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: padding,
          borderBottomWidth: border ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: alpha(colors.t0, 0.07),
        },
      ]}
    >
      {onBack ? <BackButton onPress={onBack} /> : <View style={{ width: 22 }} />}
      {title ? <HeaderTitle title={title} /> : <View style={styles.flex} />}
      {right ?? <View style={{ width: 22 }} />}
    </View>
  );
}

function HeaderTitle({ title }: { title: string }): React.ReactElement {
  return (
    <View style={styles.headerTitle}>
      <Text variant="label" color={colors.t0} numberOfLines={1} style={{ fontSize: 16 }}>
        {title}
      </Text>
    </View>
  );
}

/** The 22px back chevron, with a 44px target. */
export function BackButton({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={11}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.chevronBox}
    >
      <View style={styles.chevronUpper} />
      <View style={styles.chevronLower} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  footer: { paddingTop: 12, backgroundColor: colors.s0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerTitle: { flex: 1 },

  chevronBox: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  chevronUpper: {
    position: "absolute",
    width: 11,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: colors.t1,
    transform: [{ rotate: "-45deg" }, { translateY: -3.9 }],
  },
  chevronLower: {
    position: "absolute",
    width: 11,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: colors.t1,
    transform: [{ rotate: "45deg" }, { translateY: 3.9 }],
  },
});
