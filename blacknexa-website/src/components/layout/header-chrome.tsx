"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Controls the header's scroll-progressive appearance.
 *
 * On the home page the header starts transparent over the Hero
 * section (so nav text uses the Hero's own adaptive `--bn-feature-*`
 * tokens — the Hero flips from dark+photographic to light+airy with
 * the theme) and crossfades to a bordered surface with primary-text
 * tokens once the user scrolls past it. Every other page has no hero
 * underneath, so it is always treated as "scrolled".
 */
export function HeaderChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [homeScrolled, setHomeScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setHomeScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const scrolled = isHome ? homeScrolled : true;

  return (
    <div
      data-scrolled={scrolled}
      className="relative"
      style={{
        // These feed the header's text/accent colors below.
        ["--bn-header-ink" as string]: scrolled ? "var(--bn-text-primary)" : "var(--bn-feature-ink)",
        ["--bn-header-ink2" as string]: scrolled
          ? "var(--bn-text-secondary)"
          : "var(--bn-feature-ink2)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 border-b transition-opacity duration-300"
        style={{
          background: "var(--bn-background)",
          borderColor: "var(--bn-border)",
          opacity: scrolled ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}
