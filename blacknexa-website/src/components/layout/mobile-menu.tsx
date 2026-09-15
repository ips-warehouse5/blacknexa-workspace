"use client";

import { useEffect, useRef, useState } from "react";
import { HashLink } from "@/components/ui/hash-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { mainNav } from "@/data/navigation";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const firstLink = panel?.querySelector<HTMLElement>("a, button");
    firstLink?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>("a, button");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="grid h-10 w-[42px] place-items-center gap-1 rounded-[3px] border border-border bg-transparent"
        style={{ color: "var(--bn-header-ink)" }}
      >
        <span className="block h-[1.5px] w-[17px]" style={{ background: "currentColor" }} />
        <span className="block h-[1.5px] w-[17px]" style={{ background: "currentColor" }} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-[90] flex flex-col px-7 pb-[34px] pt-5"
          style={{ background: "var(--bn-hero-background)" }}
        >
          <div ref={panelRef} className="flex flex-1 flex-col">
            <div className="flex items-center justify-between">
              <span
                className="font-serif text-[22px] font-bold"
                style={{ color: "var(--bn-hero-text)" }}
              >
                BlackNexa
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="grid h-10 w-[42px] place-items-center rounded-[3px] border text-xl leading-none"
                style={{
                  color: "var(--bn-hero-text)",
                  borderColor: "rgba(255,255,255,0.16)",
                }}
              >
                ×
              </button>
            </div>

            <div className="mt-[26px]">
              <ThemeToggle onDark />
            </div>

            <nav className="mt-[26px] flex flex-col gap-[18px]" aria-label="Mobile">
              {mainNav.map((item) => (
                <HashLink
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className="font-serif text-[24px] font-medium"
                  style={{ color: "var(--bn-hero-text)" }}
                >
                  {item.label}
                </HashLink>
              ))}
            </nav>

            <HashLink
              href="/#waitlist"
              onClick={close}
              className="mt-auto min-h-[48px] rounded-[3px] bg-accent px-6 py-[19px] text-center text-base font-semibold text-accent-foreground"
            >
              Join the waitlist
            </HashLink>
          </div>
        </div>
      ) : null}
    </>
  );
}
