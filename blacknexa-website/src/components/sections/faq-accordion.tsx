"use client";

import { useState } from "react";
import type { FaqItem } from "@/data/faq";

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="bn-reveal flex-1">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} className="border-t border-border">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              aria-controls={`faq-panel-${i}`}
              className="flex min-h-[48px] w-full items-start justify-between gap-5 border-0 bg-transparent py-[22px] text-left text-text-primary hover:text-accent-text"
            >
              <span className="font-serif text-[clamp(1.08rem,1.6vw,1.28rem)] font-semibold leading-[1.3]">
                {item.q}
              </span>
              <span
                aria-hidden="true"
                className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border border-border text-[15px] leading-none text-accent-text"
              >
                {open ? "−" : "+"}
              </span>
            </button>
            {open ? (
              <p id={`faq-panel-${i}`} className="max-w-[66ch] whitespace-pre-line pb-6 text-[15px] leading-[1.76] text-pretty text-text-secondary">
                {item.a}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="border-t border-border" />
    </div>
  );
}
