import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { services } from "@/data/features";

export function ServicesSection() {
  return (
    <section
      id="services"
      className="bg-surface-elevated px-7 py-[clamp(52px,5.6vw,80px)]"
    >
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="CORE SERVICES / KEY FEATURES"
          title="Everything the platform does, in one place"
          maxWidth="660px"
        />
        <div className="mt-[clamp(30px,3.4vw,44px)] grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div
              key={s.title}
              className="bn-reveal flex flex-col bg-background px-6 pb-[30px] pt-[26px]"
            >
              <span className="text-accent-text">
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
