"use client";

import { useEffect } from "react";

/**
 * Client-only fade/slide-in for `.bn-reveal` elements, matching the
 * source site's initReveal() behavior: elements are visible by default
 * (no CSS hides them on its own), and this only ever toggles the
 * `.bn-reveal-pending` class (see globals.css) at runtime. If this
 * effect never runs (JS blocked, slow, or erroring), content stays
 * visible — it must never depend on JS to appear in the first place,
 * only to animate in.
 *
 * Deliberately uses `classList`, not `el.style.*`: some `.bn-reveal`
 * elements also carry their own React-managed `style` prop (e.g. the
 * Hero phone mockup's `flexShrink`), and writing to that same `style`
 * attribute from here — outside React — made React's reconciler see a
 * DOM `style` value that no longer matched the one its own props said
 * it should render, which surfaced as a "hydrated but attributes
 * didn't match" warning on every page. A class is a separate attribute
 * React isn't tracking a conflicting value for here, so it can't
 * produce that mismatch.
 */
export function RevealInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.remove("bn-reveal-pending");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    document.querySelectorAll<HTMLElement>(".bn-reveal").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.94) {
        return;
      }
      el.classList.add("bn-reveal-pending");
      io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  return null;
}
