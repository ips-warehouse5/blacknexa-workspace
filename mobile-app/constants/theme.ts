/**
 * Design tokens, lifted verbatim from the design's `:root` block and its SYSTEM
 * artboard (`BlackNexa Screens.dc.html`).
 *
 * No screen should ever hardcode a hex, a radius or a font size. If a value is
 * not in this file, it is not in the design.
 *
 * ── Theme scope ─────────────────────────────────────────────────────────────
 * v1 ships `signal` light only. The design has no dark variant of `signal` — its
 * only dark palette is `gold`, supplied at token level, and not one of the 51
 * artboards is drawn in it. So the app is locked to light (`userInterfaceStyle:
 * "light"` in app.json), and the extra palettes below exist so that shipping one
 * later is a token swap rather than a rewrite. Wiring a theme switcher into the
 * UI is deliberately out of scope until those screens are designed.
 *
 * ── Three guardrails the design states outright ─────────────────────────────
 *   1. One accent colour, and one primary action per screen. (A5 Welcome
 *      deliberately has no accent button — none of its four routes is the app's
 *      recommendation.)
 *   2. `ok` / `warn` / `bad` carry status meaning only, never decoration.
 *   3. Category colour appears only as a 6–7px dot, never as a fill.
 */

/** The full token set for one theme. */
export interface ThemeColors {
  /** Page ground. */
  bg: string;
  /** Deepest ink, used for scrims and overlays. */
  deep: string;

  // Surfaces, base → most raised.
  s0: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  s6: string;
  s7: string;
  /** Placeholder fill for an image that has not loaded. */
  ph: string;

  // Ink, strongest → faintest.
  t0: string;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
  line: string;

  acc: string;
  onAcc: string;

  ok: string;
  warn: string;
  bad: string;
  /** Slightly lighter red, for text on a tinted red ground. */
  bad2: string;
  /** Corroboration. Its own hue precisely so it is not read as a status. */
  corro: string;

  // Category dots, c1…c9.
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  c5: string;
  c6: string;
  c7: string;
  c8: string;
  c9: string;

  // Map rendering.
  map: string;
  map2: string;
  road: string;
  road2: string;

  onDeep: string;
}

export type ThemeName = "signal" | "indigo" | "emerald" | "mono" | "gold";

/** `signal` — the default, and the only theme v1 ships. */
const signal: ThemeColors = {
  bg: "#FFFFFF",
  deep: "#0E1116",

  s0: "#FFFFFF",
  s1: "#F1F5FA",
  s2: "#FFFFFF",
  s3: "#F5F7FA",
  s4: "#EAF2FE",
  s5: "#EEF2F7",
  s6: "#E6ECF4",
  s7: "#D6DEE8",
  ph: "#DFE5EC",

  t0: "#0E1116",
  t1: "#2C3542",
  t2: "#55606E",
  t3: "#7A8593",
  t4: "#98A2AE",
  t5: "#B3BCC7",
  line: "#D5DCE4",

  acc: "#0A7CFF",
  onAcc: "#FFFFFF",

  ok: "#1A8F4C",
  warn: "#B26A00",
  bad: "#D23B33",
  bad2: "#C2352E",
  corro: "#6D5BC4",

  c1: "#C4603A",
  c2: "#7E5BB8",
  c3: "#2E6FB8",
  c4: "#5E7F3A",
  c5: "#A85C86",
  c6: "#2F8A82",
  c7: "#3D63A8",
  c8: "#B5734A",
  c9: "#7A8593",

  map: "#EBEFF3",
  map2: "#E6EBF0",
  road: "#D8DEE6",
  road2: "#E2E7ED",

  onDeep: "#FFFFFF",
};

/** Accent-only variants. Everything else inherits from `signal`. */
const indigo: ThemeColors = {
  ...signal,
  acc: "#4F46E5",
  s4: "#EEEDFD",
  s1: "#F3F3FB",
  c3: "#4F46E5",
};

const emerald: ThemeColors = {
  ...signal,
  acc: "#0E8A5F",
  s4: "#E6F4EE",
  s1: "#F0F7F4",
  ok: "#0E8A5F",
};

/** Full monochrome. Status hues collapse to ink, so shape must carry meaning. */
const mono: ThemeColors = {
  bg: "#FFFFFF",
  deep: "#000000",
  s0: "#FFFFFF",
  s1: "#F4F4F4",
  s2: "#FFFFFF",
  s3: "#F5F5F5",
  s4: "#ECECEC",
  s5: "#EFEFEF",
  s6: "#E4E4E4",
  s7: "#D4D4D4",
  ph: "#DEDEDE",
  t0: "#000000",
  t1: "#262626",
  t2: "#4A4A4A",
  t3: "#6E6E6E",
  t4: "#8F8F8F",
  t5: "#B0B0B0",
  line: "#D4D4D4",
  acc: "#000000",
  onAcc: "#FFFFFF",
  ok: "#1F1F1F",
  warn: "#4A4A4A",
  bad: "#000000",
  bad2: "#333333",
  c1: "#3D3D3D",
  c2: "#565656",
  c3: "#6E6E6E",
  c4: "#858585",
  c5: "#9A9A9A",
  c6: "#4A4A4A",
  c7: "#7A7A7A",
  c8: "#616161",
  c9: "#8F8F8F",
  corro: "#333333",
  map: "#EDEDED",
  map2: "#E8E8E8",
  road: "#D9D9D9",
  road2: "#E0E0E0",
  onDeep: "#FFFFFF",
};

/** The design's only dark palette. Not shipped in v1 — see the file header. */
const gold: ThemeColors = {
  bg: "#17130F",
  deep: "#0C0A08",
  s0: "#1A1511",
  s1: "#1B1611",
  s2: "#1D1813",
  s3: "#201B16",
  s4: "#221C17",
  s5: "#241E19",
  s6: "#2A231C",
  s7: "#3A322A",
  ph: "#262019",
  t0: "#F5EFE6",
  t1: "#C6BDB0",
  t2: "#A79E92",
  t3: "#8C8377",
  t4: "#776E63",
  t5: "#5C5348",
  line: "#4A423A",
  acc: "#C9A227",
  onAcc: "#17130F",
  ok: "#6FBF8E",
  warn: "#D98A2B",
  bad: "#D0574E",
  bad2: "#E08078",
  corro: "#A08FCB",
  c1: "#C97B5A",
  c2: "#A98BC9",
  c3: "#6FA0C9",
  c4: "#8FA86B",
  c5: "#C9A0B8",
  c6: "#5FA8A0",
  c7: "#7C93C9",
  c8: "#C98A6B",
  c9: "#8C857A",
  map: "#1B211F",
  map2: "#1A1F1E",
  road: "#2A322F",
  road2: "#232A28",
  onDeep: "#FFFFFF",
};

export const THEMES: Record<ThemeName, ThemeColors> = {
  signal,
  indigo,
  emerald,
  mono,
  gold,
};

/** The shipped theme. */
export const DEFAULT_THEME: ThemeName = "signal";

/** Direct access for modules that run outside the React tree. */
export const colors: ThemeColors = signal;

// ─────────────────────────────────────────────────────────────────────────────
// Alpha helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The design expresses most separators and scrims as `rgba(token, alpha)`.
 * `alpha("#0E1116", 0.07)` reproduces those exactly, so a hairline is the same
 * weight here as on the artboard.
 */
export function alpha(hex: string, value: number): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${value})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Horizontal screen padding, which differs by surface in the artboards.
 * Reading these from the design rather than settling on one number is what keeps
 * a feed card and a wizard step from drifting a couple of pixels apart.
 */
export const screenPadding = {
  /** B1 feed. */
  feed: 16,
  /** C1–C7 wizard, D1 header. */
  wizard: 18,
  /** D1 body, sheets, auth forms. */
  detail: 20,
  /** A4, A5, A10, A11 hero screens. */
  hero: 24,
} as const;

export const radius = {
  pill: 999,
  /** Status pill (h24), category chip inner. */
  xs: 7,
  /** Small tile, thumbnail. */
  sm: 10,
  /** Field, secondary button. */
  md: 13,
  /** Primary button, sheet inner card. */
  lg: 14,
  /** Card. */
  xl: 16,
  /** Feed card, large card. */
  xxl: 18,
  /** Dialog. */
  dialog: 20,
  /** Bottom sheet top corners. */
  sheet: 24,
} as const;

/** Fixed control heights from the artboards. */
export const controlHeight = {
  statusPill: 24,
  chipSm: 30,
  chip: 32,
  chipLg: 34,
  segment: 38,
  fieldSm: 50,
  field: 52,
  buttonQuiet: 46,
  buttonSecondary: 50,
  button: 52,
  otpCell: 60,
  otpCellSm: 58,
} as const;

/**
 * Minimum touch target. The design's 24px status pills and 32–34px chips sit
 * below it, so those components add `hitSlop` to reach 44 without changing how
 * they look.
 */
export const MIN_TOUCH = 44;

/**
 * Hairline alpha. The design uses `rgba(t0, .07)` inside cards and `.06` between
 * list rows — subtly different, and both are used, so both are named.
 */
export const hairline = {
  card: 0.07,
  row: 0.06,
  strong: 0.14,
  border: 0.16,
} as const;

/** Scrim opacities behind sheets and dialogs, per artboard. */
export const scrim = {
  /** B2 filters, B7 sort, D3 trust. */
  sheet: 0.6,
  /** C10 save-or-discard, D8 flag, D9, D10. */
  sheetDeep: 0.66,
  /** C11 discard confirm — a dialog, deliberately heavier than a sheet. */
  dialog: 0.76,
  /** A12 coach marks. */
  coach: 0.78,
} as const;

export * from "./typography";
export { fonts, type, type as typography } from "./typography";

export default colors;
