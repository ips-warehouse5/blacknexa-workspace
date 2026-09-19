"use client";

import { useEffect } from "react";

/**
 * Client-only fade/slide-in for `.bn-reveal` elements. Elements are
 * visible by default: content must never depend on JS to appear in the
 * first place, only to animate in when JS is available.
 *
 * Deliberately uses the Web Animations API instead of classList or
 * inline style mutation. React can hydrate sections independently, so
 * changing a React-owned attribute from this top-level effect can race
 * with hydration of lower page segments and trigger a hydration
 * mismatch. WAAPI starts the visual transition without changing the
 * server-rendered attributes React expects to see.
 */
export function RevealInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const reveal = (el: Element) => {
      el.animate(
        [
          { opacity: 0, transform: "translateY(22px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 750,
          easing: "cubic-bezier(.2, .7, .2, 1)",
          fill: "none",
        }
      );
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveal(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    document.querySelectorAll<HTMLElement>(".bn-reveal").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.94) {
        return;
      }
      io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  return null;
}
