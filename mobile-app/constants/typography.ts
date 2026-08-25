/**
 * Type scale, from the design's SYSTEM artboard.
 *
 * Two families: **Spectral** (serif) carries display and title, **Work Sans**
 * carries everything else. Neither was in the app before this work.
 *
 * ── Why every weight names its own family ───────────────────────────────────
 * On Android, `fontWeight` does not synthesise: asking for `Spectral` at weight
 * 600 renders regular Spectral, silently, and the whole page loses its hierarchy
 * on half the devices. So each weight maps to the family file that *is* that
 * weight, and `fontWeight` is never set alongside `fontFamily`.
 *
 * ── The 12px floor ─────────────────────────────────────────────────────────
 * The design says "12PX FLOOR" for UI text. The 10.5px eyebrows and 11.5px meta
 * that appear in the artboards are secondary by design — they may label, but must
 * never be the only carrier of information.
 */

import { Platform, type TextStyle } from "react-native";

/** Font family names as `expo-font` registers them. */
export const fonts = {
  displayRegular: "Spectral_400Regular",
  displayMedium: "Spectral_500Medium",
  displaySemi: "Spectral_600SemiBold",
  displayBold: "Spectral_700Bold",
  displayItalic: "Spectral_400Regular_Italic",

  bodyRegular: "WorkSans_400Regular",
  bodyMedium: "WorkSans_500Medium",
  bodySemi: "WorkSans_600SemiBold",
  bodyBold: "WorkSans_700Bold",
} as const;

/**
 * Letter spacing is expressed in `em` in the design and in points by React
 * Native, so it has to be resolved against a size.
 */
function tracking(size: number, em: number): number {
  return size * em;
}

/**
 * Fixed-height chrome must not grow without limit under an accessibility text
 * size, or a 24px status pill clips its own label. Body copy is left unclamped —
 * someone who needs larger text needs it most in the part that carries meaning.
 */
export const MAX_CHROME_SCALE = 1.4;

/**
 * Display — Spectral 600, 28–46px, −0.02em.
 * Screen headlines (A2 38, A5 34, A11 30, C9 28, D1 29) and report titles.
 */
export function display(size: number): TextStyle {
  return {
    fontFamily: fonts.displaySemi,
    fontSize: size,
    lineHeight: Math.round(size * (size >= 34 ? 1.1 : 1.16)),
    letterSpacing: tracking(size, -0.02),
  };
}

/**
 * Title — Spectral 600, 19–21px.
 * Card titles (feed card 21 on treatment 1a) and sheet titles.
 */
export function title(size = 21): TextStyle {
  return {
    fontFamily: fonts.displaySemi,
    fontSize: size,
    lineHeight: Math.round(size * 1.24),
    letterSpacing: tracking(size, -0.008),
  };
}

/** Body — Work Sans 400 at 14/1.55. The D1 report body is 15/1.62. */
export function body(size = 14, lineRatio = 1.55): TextStyle {
  return {
    fontFamily: fonts.bodyRegular,
    fontSize: size,
    lineHeight: Math.round(size * lineRatio * 10) / 10,
  };
}

/** Label — Work Sans 600. Buttons, field labels, chip text. */
export function label(size = 13): TextStyle {
  return { fontFamily: fonts.bodySemi, fontSize: size, lineHeight: Math.round(size * 1.3) };
}

/** Meta — Work Sans 500. Timestamps, counts, secondary rows. */
export function meta(size = 12): TextStyle {
  return { fontFamily: fonts.bodyMedium, fontSize: size, lineHeight: Math.round(size * 1.35) };
}

/** Eyebrow — Work Sans 600 at 10.5px with 0.16em tracking, uppercase. */
export function eyebrow(size = 10.5, em = 0.16): TextStyle {
  return {
    fontFamily: fonts.bodySemi,
    fontSize: size,
    lineHeight: size,
    letterSpacing: tracking(size, em),
    textTransform: "uppercase",
  };
}

/**
 * Named styles for the recurring cases, so a screen does not re-derive them.
 * Sizes are the artboard values, annotated with where each one appears.
 */
export const type = {
  /** A2/A3 intro headline. */
  hero: display(38),
  /** A5 Welcome. */
  displayLg: display(34),
  /** A11 notification priming, A4 location priming. */
  displayMd: display(30),
  /** A6/A8/A13 form headline, C9 receipt, D1 report title. */
  displaySm: display(28),
  /** C1/C3 step question, A14. */
  displayXs: display(24),

  /** Feed card title (1a), sheet titles. */
  cardTitle: title(21),
  /** D2 owner title, empty-state headline. */
  sectionTitle: title(20),
  /** Small card title. */
  cardTitleSm: title(17),

  /** D1 report body. */
  bodyLg: body(15, 1.62),
  /** Default body. */
  body: body(14, 1.55),
  /** Feed card excerpt, list descriptions. */
  bodySm: body(13.5, 1.52),
  /** Card sub-copy. */
  bodyXs: body(12.5, 1.5),

  buttonPrimary: label(15.5),
  button: label(15),
  buttonSm: label(14),
  labelLg: label(14),
  label: label(13),
  labelSm: label(12.5),
  chip: label(12.5),
  chipSm: label(12),

  meta: meta(12),
  metaSm: meta(11.5),

  eyebrow: eyebrow(10.5),
  /** Field labels on A6/A9/C2 — 11.5px with 0.1em, not the 0.16em section form. */
  fieldLabel: eyebrow(11.5, 0.1),
  /** C7's review-block labels. */
  eyebrowSm: eyebrow(11, 0.1),

  /** OTP cell digits — A8 at 24px, A14 at 23px, both Spectral 600. */
  otp: {
    fontFamily: fonts.displaySemi,
    fontSize: 24,
    lineHeight: 24,
  } as TextStyle,

  /** Case reference on C9, and the D1 evidence overflow tile. */
  monoRef: {
    fontFamily: fonts.displaySemi,
    fontSize: 19,
    letterSpacing: 0.38,
  } as TextStyle,
} as const;

/**
 * Platform nudge for optical alignment.
 *
 * Spectral sits a little higher in its box on Android than on iOS, which shows up
 * as a headline looking un-centred next to an icon. Applied only where a display
 * style is vertically centred against something else.
 */
export const displayNudge: TextStyle =
  Platform.OS === "android" ? { includeFontPadding: false } : {};

export default type;
