"use client";

import { useEffect } from "react";

/**
 * Client-only fade/slide-in for `.bn-reveal` elements, matching the
 * source site's initReveal() behavior: elements are visible by
 * default (no CSS hides them), and this only ever applies inline
 * styles at runtime. If this effect never runs (JS blocked, slow, or
 * erroring), content stays visible — it must never depend on JS to
 * appear in the first place, only to animate in.
 */
export function RevealInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          el.style.transition =
            "opacity .75s ease, transform .75s cubic-bezier(.2,.7,.2,1)";
          el.style.opacity = "1";
          el.style.transform = "none";
          io.unobserve(el);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    document.querySelectorAll<HTMLElement>(".bn-reveal").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.94) {
        el.style.opacity = "1";
        return;
      }
      el.style.opacity = "0";
      el.style.transform = "translateY(22px)";
      io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  return null;
}
