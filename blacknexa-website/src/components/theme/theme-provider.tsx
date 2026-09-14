"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeName } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Must start at the same value the server rendered (DEFAULT_THEME),
  // even though the pre-paint inline script (see src/lib/theme.ts)
  // may already have set a different `data-theme` on <html> from
  // localStorage. The actual page colors are correct immediately
  // either way, since every component reads CSS variables scoped by
  // that DOM attribute, not this React state — this state only
  // drives the theme toggle UI and imperative `setTheme` calls.
  //
  // Reading the DOM here instead (to "start correct") would make the
  // client's first render diverge from the server-rendered HTML,
  // which is a hydration mismatch. Instead we render DEFAULT_THEME on
  // both server and first client pass, then sync from the DOM in an
  // effect below — a normal post-hydration update, not a mismatch.
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing React state to the DOM value the pre-paint script already applied; see comment above.
      setThemeState(current);
    }
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private browsing, etc.)
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
