"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import type { ThemeName } from "@/lib/theme";

// Same shield mark as src/app/icon.svg and src/components/ui/logo.tsx.
// icon.svg picks its color from the OS/browser prefers-color-scheme media
// query, because a static favicon file has no access to this site's own
// theme toggle (data-theme attribute + localStorage, see theme-provider.tsx)
// — the two can disagree (e.g. OS set to dark, site manually switched to
// light), leaving the favicon showing the wrong color for the page. This
// component corrects that by swapping the favicon's colors to match the
// site's actual theme state whenever it changes.
const SHIELD_PATHS = (color: string) => `
  <path d="M24 2.6 44.2 9.4V28.2C44.2 41 35.4 50.2 24 53.8 12.6 50.2 3.8 41 3.8 28.2V9.4Z" fill="none" stroke-width="3.1" stroke-linejoin="round" stroke="${color}"/>
  <path d="M24 12.6 35.4 16.5V28.4C35.4 36.2 30.2 41.8 24 44.4 17.8 41.8 12.6 36.2 12.6 28.4V16.5Z" fill="${color}"/>
`;

// Warm Gold for the dark theme, Signal Blue for the light theme — matching
// icon.svg's original color choices, just keyed off the real site theme.
const THEME_ICON_COLOR: Record<ThemeName, string> = {
  dark: "#c9a227",
  light: "#0a7cff",
};

function faviconDataUri(theme: ThemeName): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56">${SHIELD_PATHS(THEME_ICON_COLOR[theme])}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function FaviconSync() {
  const { theme } = useTheme();

  useEffect(() => {
    const href = faviconDataUri(theme);
    const existing = document.querySelectorAll<HTMLLinkElement>("link[rel='icon']");
    if (existing.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.href = href;
      document.head.appendChild(link);
      return;
    }
    existing.forEach((link) => {
      link.type = "image/svg+xml";
      link.href = href;
    });
  }, [theme]);

  return null;
}
