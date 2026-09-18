import { getFaqs } from "@/data/faq";
import { FaqAccordion } from "./faq-accordion";

/**
 * Async Server Component: the answers come from the platform API, so an editor
 * changes them in the console rather than in a deploy. `getFaqs` falls back to
 * the bundled copy on any failure, so this never renders an empty section.
 */
export async function FaqSection() {
  const faqs = await getFaqs();

  return (
    <section
      id="faq"
      className="bg-surface-elevated px-7 py-[clamp(52px,5.6vw,80px)]"
    >
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-start gap-[clamp(26px,3vw,44px)]">
        <div className="bn-reveal min-w-[min(100%,260px)] flex-[0_1_300px]">
          <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent-text">
            FREQUENTLY ASKED QUESTIONS
          </p>
          <h2 className="text-balance font-serif text-[clamp(1.95rem,4vw,3.05rem)] font-semibold leading-[1.08] tracking-[-0.015em] text-text-primary">
            Straight answers
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
