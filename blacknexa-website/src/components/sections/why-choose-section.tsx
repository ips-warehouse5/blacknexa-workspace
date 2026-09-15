import { SectionHeading } from "@/components/ui/section-heading";
import { whyChoose } from "@/data/features";

export function WhyChooseSection() {
  return (
    <section aria-label="Why choose BlackNexa" className="px-7 py-[clamp(52px,5.6vw,80px)]">
      <div className="mx-auto max-w-[1080px]">
        <SectionHeading
          eyebrow="WHY CHOOSE BLACKNEXA"
          title="Five things no other platform puts together."
          maxWidth="660px"
        />
        <div className="mt-[clamp(28px,3.2vw,40px)] flex flex-col">
          {whyChoose.map((w) => (
            <div
              key={w.n}
              className="bn-reveal flex flex-wrap gap-[clamp(18px,3vw,48px)] border-t border-border py-[clamp(24px,2.6vw,32px)]"
            >
              <p className="w-14 flex-none font-serif text-2xl font-bold leading-none tabular-nums text-accent-text">
                {w.n}
              </p>
              <h3 className="min-w-[min(100%,240px)] flex-[1_1_260px] text-balance font-serif text-[clamp(1.2rem,1.9vw,1.5rem)] font-semibold leading-[1.2] text-text-primary">
                {w.title}
              </h3>
              <p className="min-w-[min(100%,280px)] max-w-[58ch] flex-[1_1_400px] text-pretty text-[15px] leading-[1.72] text-text-secondary">
                {w.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
