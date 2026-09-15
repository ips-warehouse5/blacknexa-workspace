"use client";

import { useTheme } from "./theme-provider";

/**
 * `onDark` is for placing this on a permanently-dark surface (the mobile
 * menu overlay uses `--bn-hero-background`, which stays dark in both site
 * themes) — it swaps the inactive-state colors for the same fixed
 * light-on-dark tokens that surface's other text/borders already use, so
 * the inactive button stays legible in light mode instead of using
 * `--bn-text-secondary` (a dark gray meant for a light background).
 */
export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const inactiveColor = onDark ? "var(--bn-hero-secondary-text)" : "var(--bn-text-secondary)";
  const borderColor = onDark ? "rgba(255,255,255,0.16)" : "var(--bn-border)";

  return (
    <div className="flex items-center gap-1 rounded-full border p-[3px]" style={{ borderColor }}>
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={!isDark}
        aria-label="Light appearance"
        className="min-h-[30px] rounded-full px-3 text-[11px] font-semibold tracking-wide transition-colors duration-200"
        style={{
          background: !isDark ? "var(--bn-accent)" : "transparent",
          color: !isDark ? "var(--bn-accent-foreground)" : inactiveColor,
        }}
      >
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={isDark}
        aria-label="Dark appearance"
        className="min-h-[30px] rounded-full px-3 text-[11px] font-semibold tracking-wide transition-colors duration-200"
        style={{
          background: isDark ? "var(--bn-accent)" : "transparent",
          color: isDark ? "var(--bn-accent-foreground)" : inactiveColor,
        }}
      >
        Dark
      </button>
    </div>
  );
}
