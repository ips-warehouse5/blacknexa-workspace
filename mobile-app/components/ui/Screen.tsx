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

import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { alpha, colors, layout, screenPadding } from "@/constants/theme";
import Text from "@/components/ui/Text";

/** Minimum bottom padding when the device has no home indicator. */
const MIN_BOTTOM = 12;

function resolveResponsiveFrame(
  width: number,
  padding: number,
  maxWidth?: number | "none",
): { horizontalPadding: number; contentMaxWidth: number | undefined } {
  const isTablet = width >= layout.tabletBreakpoint;
  return {
    horizontalPadding: isTablet ? Math.max(padding, screenPadding.tablet) : padding,
    contentMaxWidth:
      maxWidth === "none" ? undefined : maxWidth ?? (isTablet ? layout.readableMaxWidth : undefined),
  };
}

export interface ScreenProps {
  children: React.ReactNode;
  /** Horizontal padding. Defaults to the 20px used by auth forms and detail bodies. */
  padding?: number;
  /** Pad for the status bar. Off when the screen paints its own full-bleed art. */
  topInset?: boolean;
  background?: string;
  /** Use "none" for full-width tool surfaces; default constrains iPad content. */
  maxWidth?: number | "none";
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A plain, non-scrolling screen. */
export function Screen({
  children,
  padding = screenPadding.detail,
  topInset = true,
  background = colors.bg,
  maxWidth,
  style,
  contentStyle,
  testID,
}: ScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { horizontalPadding, contentMaxWidth } = resolveResponsiveFrame(width, padding, maxWidth);
  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          backgroundColor: background,
          paddingTop: topInset ? insets.top : 0,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.contentFrame,
          {
            maxWidth: contentMaxWidth,
            paddingHorizontal: horizontalPadding,
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
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
  maxWidth,
  style,
  contentStyle,
  keyboardShouldPersistTaps = "handled",
  scrollRef,
  testID,
}: ScrollScreenProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { horizontalPadding, contentMaxWidth } = resolveResponsiveFrame(width, padding, maxWidth);
  const bottomPad = Math.max(insets.bottom, MIN_BOTTOM);
  // `bottomOffset` only keeps a focused field clear of the keyboard itself —
  // it doesn't know about the footer, which the KeyboardStickyView below
  // renders on top of the keyboard with its own height. Without measuring
  // that height and adding it in, a focused field near the bottom of the
  // content (e.g. a password/code field directly above a footer button, as
  // on the Delete Account screen) gets auto-scrolled to just clear the
  // keyboard and then immediately re-covered by the footer sitting on top
  // of it. 24 is the base clearance used even with no footer present.
  const [footerHeight, setFooterHeight] = useState(0);
  const contentBottomPadding = bottomSpace + (footer ? footerHeight : 0);

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: background, paddingTop: topInset ? insets.top : 0 }, style]}
    >
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          {
            width: "100%",
            maxWidth: contentMaxWidth,
            alignSelf: "center",
            paddingHorizontal: horizontalPadding,
            paddingBottom: contentBottomPadding,
          },
          contentStyle,
        ]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={false}
        bottomOffset={footer ? footerHeight + 24 : 24}
      >
        {children}
      </KeyboardAwareScrollView>

      {footer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
            style={[
              styles.footer,
              {
                backgroundColor: colors.s0,
                paddingBottom: bottomPad,
                borderTopWidth: footerBorder ? StyleSheet.hairlineWidth : 0,
                borderTopColor: alpha(colors.t0, 0.07),
              },
            ]}
          >
            <View
              style={[
                styles.footerFrame,
                {
                  maxWidth: contentMaxWidth,
                  paddingHorizontal: horizontalPadding,
                },
              ]}
            >
              {footer}
            </View>
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
  const { width } = useWindowDimensions();
  const { horizontalPadding, contentMaxWidth } = resolveResponsiveFrame(width, padding);
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
      <View
        style={[
            styles.footer,
            {
              backgroundColor: colors.s0,
            paddingBottom: Math.max(insets.bottom, MIN_BOTTOM),
            borderTopWidth: border ? StyleSheet.hairlineWidth : 0,
            borderTopColor: alpha(colors.t0, 0.07),
          },
          style,
        ]}
      >
        <View
          style={[
            styles.footerFrame,
            {
              maxWidth: contentMaxWidth,
              paddingHorizontal: horizontalPadding,
            },
          ]}
        >
          {children}
        </View>
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
      <View style={[styles.chevronUpper, { backgroundColor: colors.t1 }]} />
      <View style={[styles.chevronLower, { backgroundColor: colors.t1 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  contentFrame: { flex: 1, width: "100%", alignSelf: "center" },
  footer: { paddingTop: 12 },
  footerFrame: { width: "100%", alignSelf: "center" },
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
    transform: [{ rotate: "-45deg" }, { translateY: -3.9 }],
  },
  chevronLower: {
    position: "absolute",
    width: 11,
    height: 1.8,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }, { translateY: 3.9 }],
  },
});
