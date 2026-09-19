"use client";

import { useEffect } from "react";

// Same shield mark as src/app/icon.svg and src/components/ui/logo.tsx.
// The favicon is intentionally brand-gold in every theme.
const FAVICON_COLOR = "#c9a227";

const SHIELD_PATHS = (color: string) => `
  <path d="M24 2.6 44.2 9.4V28.2C44.2 41 35.4 50.2 24 53.8 12.6 50.2 3.8 41 3.8 28.2V9.4Z" fill="none" stroke-width="3.1" stroke-linejoin="round" stroke="${color}"/>
  <path d="M24 12.6 35.4 16.5V28.4C35.4 36.2 30.2 41.8 24 44.4 17.8 41.8 12.6 36.2 12.6 28.4V16.5Z" fill="${color}"/>
`;

function faviconDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56">${SHIELD_PATHS(FAVICON_COLOR)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Colors every icon link currently in <head> — Next's own file-convention
 * ones (icon.svg, favicon.ico) included — with the fixed brand-gold icon.
 * Creates one only if none exist yet.
 *
 * Only ever mutates `href`/`type` on existing nodes, never removes or
 * replaces one. Next's own file-convention icons are nodes React/Next's
 * head management still considers mounted; detaching them with `remove()`
 * leaves that bookkeeping pointing at a node with no parent, and the next
 * time React reconciles that tree (e.g. on a client-side route change) it
 * throws trying to detach it a second time ("Cannot read properties of
 * null (reading 'removeChild')") — confirmed by testing this the
 * destructive way first. Changing attributes on a node without touching
 * its identity is invisible to that bookkeeping and safe.
 */
function applyFavicon(): void {
  const href = faviconDataUri();
  const links = document.querySelectorAll<HTMLLinkElement>(
    "link[rel='icon'], link[rel='shortcut icon']",
  );

  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = href;
    document.head.appendChild(link);
    return;
  }

  links.forEach((link) => {
    link.type = "image/svg+xml";
    link.href = href;
  });
}

export function FaviconSync() {
  useEffect(() => {
    applyFavicon();

    // Next.js can insert its own file-convention icon links into <head>
    // after this effect has already run once — observed happening on
    // client-side navigations between routes. A freshly inserted node
    // still carries its original static color, so it needs correcting the
    // moment it appears.
    const observer = new MutationObserver((mutations) => {
      const sawNewIconLink = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node instanceof HTMLLinkElement &&
            (node.rel === "icon" || node.rel === "shortcut icon"),
        ),
      );
      if (sawNewIconLink) applyFavicon();
    });
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
