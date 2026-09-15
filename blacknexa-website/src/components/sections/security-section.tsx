import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { securityPoints } from "@/data/features";

export function SecuritySection() {
  return (
    <section aria-label="Brand protection and security" className="bg-surface-elevated px-7 py-[clamp(52px,5.6vw,80px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="BRAND PROTECTION & SECURITY"
          title="A protected platform, and protected people."
          description="The BlackNexa™ name and our custom technology are legally protected, so the platform our community depends on stays ours. The same seriousness governs how your data is held."
          maxWidth="660px"
        />
        <div className="mt-[clamp(28px,3.2vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(238px,1fr))] gap-[18px]">
          {securityPoints.map((s) => (
            <div key={s.title} className="bn-reveal rounded-[5px] border border-border bg-background px-[22px] pb-[26px] pt-6">
              <span className="text-accent-text">
                <Icon name={s.icon} size={24} />
              </span>
              <h3 className="mt-[18px] font-serif text-[1.2rem] font-semibold leading-[1.22] text-text-primary">
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
