import { SectionHeading } from "@/components/ui/section-heading";
import { benefits } from "@/data/features";

export function BenefitsSection() {
  return (
    <section aria-label="Platform benefits" className="px-7 py-[clamp(80px,10vw,132px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="PLATFORM BENEFITS"
          title="What changes when you carry it."
          maxWidth="660px"
        />
        <div className="mt-[clamp(40px,4.6vw,64px)] grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[clamp(26px,3vw,44px)]">
          {benefits.map((b) => (
            <div key={b.n} className="bn-reveal border-t border-border pt-[22px]">
              <h3 className="flex gap-3 font-serif text-[1.22rem] font-semibold leading-[1.24] text-text-primary">
                <span className="pt-[0.2em] text-[0.78em] font-normal tabular-nums text-accent">
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
