import { faqs } from "@/data/faq";
import { FaqAccordion } from "./faq-accordion";

export function FaqSection() {
  return (
    <section id="faq" className="px-7 py-[clamp(80px,10vw,132px)]">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-start gap-[clamp(30px,4vw,64px)]">
        <div className="bn-reveal min-w-[min(100%,260px)] flex-[0_1_300px]">
          <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent">
            FREQUENTLY ASKED QUESTIONS
          </p>
          <h2 className="text-balance font-serif text-[clamp(1.95rem,4vw,3.05rem)] font-semibold leading-[1.08] tracking-[-0.015em] text-text-primary">
            Straight answers.
          </h2>
          <p className="mt-[22px] text-[15px] leading-[1.7] text-text-secondary">
            Anything not covered here, write to us and a person will answer.
          </p>
        </div>
        <FaqAccordion items={faqs} />
      </div>
    </section>
  );
}
