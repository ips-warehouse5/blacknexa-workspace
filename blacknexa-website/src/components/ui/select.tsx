"use client";

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

/**
 * Custom listbox replacing the native `<select>`. The native element's
 * option popup is drawn entirely by the OS/browser and cannot be styled or
 * positioned by CSS — on real mobile devices (confirmed on an actual phone,
 * not just an emulator) this was rendering the option list anchored to the
 * wrong part of the screen instead of below the field. Building the dropdown
 * ourselves as normal positioned DOM guarantees it always opens directly
 * under the trigger, on every device, while keeping the exact same visual
 * appearance as the field it replaces.
 */
export function Select({
  id,
  name,
  value,
  options,
  onChange,
  className = "",
}: {
  id: string;
  name: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {/* Keeps `name`/`value` submittable exactly like a real form field. */}
      <input type="hidden" name={name} value={selected?.value ?? ""} />
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-[3px] border border-border bg-surface px-4 py-[15px] text-left text-[15px] text-text-primary focus:border-accent ${className}`}
      >
        <span>{selected?.label}</span>
        <svg
          aria-hidden="true"
          width="12"
          height="8"
          viewBox="0 0 12 8"
          className={`flex-none text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 right-0 top-full z-10 mt-1.5 max-h-64 overflow-auto rounded-[3px] border border-border bg-surface py-1.5 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="block w-full px-4 py-[10px] text-left text-[15px] text-text-primary hover:bg-surface-elevated hover:text-accent-text"
                style={o.value === value ? { color: "var(--bn-accent)" } : undefined}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
