import { Icon } from "@/components/icons/icon";
import { coreValues } from "@/data/features";

export function MissionSection() {
  return (
    <section id="mission" className="bg-accent-soft px-7 py-[clamp(52px,5.6vw,80px)]">
      <div className="bn-reveal mx-auto flex max-w-[1180px] flex-wrap gap-[clamp(26px,3vw,48px)]">
        <div className="min-w-[min(100%,200px)] flex-[0_1_240px]">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-accent-text">MISSION STATEMENT</p>
        </div>
        <div className="min-w-[min(100%,300px)] max-w-[66ch] flex-[1_1_520px]">
          <p className="text-pretty font-serif text-[clamp(1.4rem,2.6vw,2.15rem)] font-medium leading-[1.34] tracking-[-0.01em] text-text-primary">
            To equip Black, Brown, underserved, and disenfranchised communities with God-centered
            technology that documents the truth, protects the evidence, and carries a verified
            voice to the people with the authority to act on it.
          </p>
          <div className="mt-[26px] flex flex-wrap gap-2.5">
            {coreValues.map((v) => (
              <div
                key={v.label}
                className="flex items-center gap-[11px] rounded-[3px] border border-border bg-background px-5 py-3.5"
              >
                <span className="text-accent-text">
                  <Icon name={v.icon} size={22} />
                </span>
                <span className="text-sm tracking-[0.03em] text-text-primary">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
