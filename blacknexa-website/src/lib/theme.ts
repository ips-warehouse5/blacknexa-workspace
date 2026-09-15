export type ThemeName = "dark" | "light";

export const DEFAULT_THEME: ThemeName = "dark";
export const THEME_STORAGE_KEY = "bn-theme";
export const THEME_COOKIE_KEY = "bn-theme";

/**
 * Inline script injected into <head> so the correct theme is applied
 * before first paint (no flash of the wrong theme). Runs before
 * hydration; must stay dependency-free and framework-agnostic.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = stored === "light" || stored === "dark" ? stored : "${DEFAULT_THEME}";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "${DEFAULT_THEME}");
  }
})();
`;
