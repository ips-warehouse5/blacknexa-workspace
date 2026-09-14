"use client";

import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-[3px]">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={!isDark}
        aria-label="Light appearance"
        className="min-h-[30px] rounded-full px-3 text-[11px] font-semibold tracking-wide transition-colors duration-200"
        style={{
          background: !isDark ? "var(--bn-accent)" : "transparent",
          color: !isDark ? "var(--bn-accent-foreground)" : "var(--bn-text-secondary)",
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
          color: isDark ? "var(--bn-accent-foreground)" : "var(--bn-text-secondary)",
        }}
      >
        Dark
      </button>
    </div>
  );
}
