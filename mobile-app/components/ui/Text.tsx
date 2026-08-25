/**
 * Typed text.
 *
 * Wrapping `Text` gets three things right by default that are easy to forget on
 * an individual screen:
 *
 *   • **The right family for the weight.** Android does not synthesise weights,
 *     so `constants/typography` maps each one to its own family. Going through a
 *     `variant` makes that impossible to bypass.
 *   • **Bounded scaling on chrome.** A 24px status pill clips its own label at a
 *     large accessibility text size, so chrome variants cap the multiplier while
 *     body variants stay unclamped — someone who needs bigger text needs it most
 *     in the part that carries meaning.
 *   • **`text-wrap: pretty` equivalent.** The design leans on balanced headlines;
 *     `display` variants ask for the same treatment where the platform offers it.
 */

import React from "react";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { colors } from "@/constants/theme";
import { MAX_CHROME_SCALE, type as T } from "@/constants/typography";

export type TextVariant = keyof typeof VARIANTS;

const VARIANTS = {
  hero: T.hero,
  displayLg: T.displayLg,
  displayMd: T.displayMd,
  displaySm: T.displaySm,
  displayXs: T.displayXs,
  cardTitle: T.cardTitle,
  sectionTitle: T.sectionTitle,
  cardTitleSm: T.cardTitleSm,
  bodyLg: T.bodyLg,
  body: T.body,
  bodySm: T.bodySm,
  bodyXs: T.bodyXs,
  buttonPrimary: T.buttonPrimary,
  button: T.button,
  buttonSm: T.buttonSm,
  labelLg: T.labelLg,
  label: T.label,
  labelSm: T.labelSm,
  chip: T.chip,
  chipSm: T.chipSm,
  meta: T.meta,
  metaSm: T.metaSm,
  eyebrow: T.eyebrow,
  fieldLabel: T.fieldLabel,
  eyebrowSm: T.eyebrowSm,
} as const;

/**
 * Variants that live inside a fixed-height control. These get their font scaling
 * capped; everything else does not.
 */
const CHROME_VARIANTS = new Set<TextVariant>([
  "buttonPrimary",
  "button",
  "buttonSm",
  "chip",
  "chipSm",
  "eyebrow",
  "eyebrowSm",
  "fieldLabel",
  "meta",
  "metaSm",
  "label",
  "labelSm",
]);

/** Variants that read as a headline and should balance their line breaks. */
const DISPLAY_VARIANTS = new Set<TextVariant>([
  "hero",
  "displayLg",
  "displayMd",
  "displaySm",
  "displayXs",
  "cardTitle",
  "sectionTitle",
  "cardTitleSm",
]);

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** Any token from the theme, or a literal for a one-off. */
  color?: string;
  center?: boolean;
  children?: React.ReactNode;
}

export function Text({
  variant = "body",
  color,
  center,
  style,
  numberOfLines,
  ...rest
}: AppTextProps): React.ReactElement {
  const base = VARIANTS[variant] as TextStyle;
  const isChrome = CHROME_VARIANTS.has(variant);

  return (
    <RNText
      // Left unset for body copy so accessibility sizes apply in full.
      maxFontSizeMultiplier={isChrome ? MAX_CHROME_SCALE : undefined}
      numberOfLines={numberOfLines}
      style={[
        base,
        { color: color ?? colors.t1 },
        center && { textAlign: "center" },
        // Only meaningful on a wrapping headline, and harmless elsewhere.
        DISPLAY_VARIANTS.has(variant) && numberOfLines !== 1
          ? ({ textAlign: center ? "center" : "left" } as TextStyle)
          : null,
        style,
      ]}
      {...rest}
    />
  );
}

export default Text;
