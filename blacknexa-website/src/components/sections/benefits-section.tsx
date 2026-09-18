import { SectionHeading } from "@/components/ui/section-heading";
import { benefits } from "@/data/features";

export function BenefitsSection() {
  return (
    <section
      aria-label="Platform benefits"
      className="px-7 py-[clamp(52px,5.6vw,80px)]"
    >
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="PLATFORM BENEFITS"
          title="What changes when you carry it"
          maxWidth="660px"
        />
        <div className="mt-[clamp(28px,3.2vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(268px,1fr))] gap-[18px]">
          {benefits.map((b) => (
            <div
              key={b.n}
              className="bn-reveal rounded-[5px] border border-border bg-surface px-[22px] pb-[26px] pt-6"
            >
              <h3 className="flex gap-3 font-serif text-[1.22rem] font-semibold leading-[1.24] text-text-primary">
                <span className="pt-[0.2em] text-[0.78em] font-normal tabular-nums text-accent-text">
                  {b.n}
                </span>
                {b.title}
              </h3>
              <p className="mt-3 text-pretty text-[14.5px] leading-[1.68] text-text-secondary">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
