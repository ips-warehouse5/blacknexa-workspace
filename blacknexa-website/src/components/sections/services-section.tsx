import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { services } from "@/data/features";

export function ServicesSection() {
  return (
    <section id="services" className="bg-surface px-7 py-[clamp(80px,10vw,132px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="CORE SERVICES / KEY FEATURES"
          title="Everything the platform does, in one place."
          maxWidth="660px"
        />
        <div className="mt-[clamp(44px,5vw,68px)] grid grid-cols-[repeat(auto-fit,minmax(276px,1fr))] gap-px overflow-hidden rounded border border-border bg-border">
          {services.map((s) => (
            <div key={s.title} className="bn-reveal flex flex-col bg-background px-7 pb-9 pt-8">
              <span className="text-accent">
                <Icon name={s.icon} size={24} />
              </span>
              <h3 className="mt-5 font-serif text-[1.28rem] font-semibold leading-[1.22] text-text-primary">
                {s.title}
              </h3>
              <p className="mt-[11px] text-pretty text-[14.5px] leading-[1.66] text-text-secondary">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
