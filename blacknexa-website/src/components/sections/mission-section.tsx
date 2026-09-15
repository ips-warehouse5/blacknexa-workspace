import { Icon } from "@/components/icons/icon";
import { coreValues } from "@/data/features";

export function MissionSection() {
  return (
    <section id="mission" className="px-7 py-[clamp(80px,10vw,132px)]">
      <div className="bn-reveal mx-auto flex max-w-[1180px] flex-wrap gap-[clamp(28px,4vw,72px)]">
        <div className="min-w-[min(100%,200px)] flex-[0_1_240px]">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-accent">MISSION STATEMENT</p>
        </div>
        <div className="min-w-[min(100%,300px)] max-w-[66ch] flex-[1_1_520px]">
          <p className="text-pretty font-serif text-[clamp(1.4rem,2.6vw,2.15rem)] font-medium leading-[1.34] tracking-[-0.01em] text-text-primary">
            To equip Black, Brown, underserved and disenfranchised communities with God-centered
            technology that documents the truth, protects the evidence, and carries a verified
            voice to the people with the authority to act on it.
          </p>
          <div className="mt-[clamp(30px,3.4vw,44px)] flex flex-wrap gap-3.5">
            {coreValues.map((v) => (
              <div
                key={v.label}
                className="flex items-center gap-[11px] rounded-[3px] border border-border bg-surface px-5 py-3.5"
              >
                <span className="text-accent">
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
