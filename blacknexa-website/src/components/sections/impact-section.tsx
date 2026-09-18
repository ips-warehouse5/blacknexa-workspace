import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { impactPoints, impactStats } from "@/data/features";

export function ImpactSection() {
  return (
    <section
      aria-label="Community impact"
      className="px-7 py-[clamp(52px,5.6vw,80px)]"
    >
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="COMMUNITY IMPACT"
          title="One record is a story. Thousands are evidence"
          description="A single incident can be dismissed as an isolated case. When a community documents together, on the record and in one place, a pattern becomes impossible to wave away."
          maxWidth="680px"
        />
        <div className="mt-[clamp(28px,3.2vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(262px,1fr))] gap-[18px]">
          {impactPoints.map((i) => (
            <div key={i.title} className="bn-reveal">
              <span className="text-accent-text">
                <Icon name={i.icon} size={24} />
              </span>
              <h3 className="mt-[18px] font-serif text-[1.28rem] font-semibold leading-[1.22] text-text-primary">
                {i.title}
              </h3>
              <p className="mt-[11px] text-pretty text-[14.5px] leading-[1.68] text-text-secondary">
                {i.body}
              </p>
            </div>
          ))}
        </div>

        <div className="bn-reveal mt-[clamp(30px,3.4vw,44px)] rounded-[5px] border border-border bg-surface p-[clamp(26px,3vw,38px)]">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[18px]">
            {impactStats.map((k) => (
              <div key={k.label}>
                <p className="font-serif text-[clamp(2rem,3.4vw,2.9rem)] leading-none text-text-muted">
                  {k.value}
                </p>
                <p className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-accent-text">
                  {k.label}
                </p>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-text-secondary">
                  {k.note}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-[26px] border-t border-border pt-5 text-[13px] leading-[1.6] text-text-muted">
            Live figures publish at launch. We will not show a number we cannot
            evidence.
          </p>
        </div>
      </div>
    </section>
  );
}
