/**
 * Theme state: accent colour and light/dark mode.
 *
 * Both are written onto <html> as data attributes, which `styles/tokens.css`
 * keys off. Nothing else in the app reads the theme — components use the custom
 * properties, so the whole switch is two attribute writes.
 *
 * The `dark` class on <body> is set alongside `data-mode` because the ported
 * prototype CSS uses `body.dark` for its surface overrides. Both are kept in
 * step here so that nothing downstream has to know there are two mechanisms.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** The two accents the console ships. */
export const ACCENTS = ["blue", "gold"] as const;
export type Accent = (typeof ACCENTS)[number];

export type Mode = "light" | "dark";

/** Swatch metadata for the sidebar picker. */
export const ACCENT_SWATCHES: { value: Accent; label: string; swatch: string }[] = [
  { value: "blue", label: "Signal Blue", swatch: "#0a7cff" },
  { value: "gold", label: "Warm Gold", swatch: "#b78a00" },
];

const ACCENT_KEY = "bn_color_theme";
const MODE_KEY = "bn_appearance_mode";

interface ThemeContextValue {
  accent: Accent;
  mode: Mode;
  setAccent: (accent: Accent) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

/**
 * Initial accent: the stored choice, else blue.
 *
 * Read lazily inside `useState` so it runs once rather than on every render,
 * and wrapped because storage access throws outright in some privacy modes.
 */
function initialAccent(): Accent {
  try {
    const stored = localStorage.getItem(ACCENT_KEY);
    if (isAccent(stored)) return stored;
  } catch {
    // Fall through to the default.
  }
  return "blue";
}

/** Initial mode: the stored choice, else whatever the operating system prefers. */
function initialMode(): Mode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Fall through to the system preference.
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(initialAccent);
  const [mode, setModeState] = useState<Mode>(initialMode);

  // Reflect the theme onto the document and remember it.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = accent;
    root.dataset.mode = mode;
    // Lets the browser render form controls and scrollbars to match.
    root.style.colorScheme = mode;
    document.body.classList.toggle("dark", mode === "dark");

    try {
      localStorage.setItem(ACCENT_KEY, accent);
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // A theme that cannot be remembered still applies for this visit.
    }
  }, [accent, mode]);

  /**
   * Follow the system preference, but only until the operator states one.
   *
   * Once a mode is stored, the listener stops overriding it — otherwise a
   * deliberate choice would be undone the next time the OS switched at dusk.
   */
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(MODE_KEY)) return;
      } catch {
        // If storage is unreadable, treat the preference as unset and follow.
      }
      setModeState(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setAccent = useCallback((next: Accent) => setAccentState(next), []);
  const setMode = useCallback((next: Mode) => setModeState(next), []);
  const toggleMode = useCallback(
    () => setModeState((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ accent, mode, setAccent, setMode, toggleMode }),
    [accent, mode, setAccent, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside a ThemeProvider.");
  return ctx;
}
