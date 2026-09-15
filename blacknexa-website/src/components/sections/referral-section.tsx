import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { referralSteps } from "@/data/features";
import { ReferralLink } from "./referral-link";

export function ReferralSection() {
  return (
    <section aria-label="Referral program" className="px-7 py-[clamp(52px,5.6vw,80px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="REFERRAL PROGRAM"
          title="Bring your people. Build the movement faster."
          description="A community millions strong is built one invitation at a time. Share your link, and every person who joins through it moves both of you up the early-access list."
          maxWidth="660px"
        />
        <div className="mt-[clamp(28px,3.2vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(244px,1fr))] gap-px overflow-hidden rounded border border-border bg-border">
          {referralSteps.map((r) => (
            <div key={r.num} className="bn-reveal bg-background px-6 pb-[30px] pt-[26px]">
              <div className="flex items-center justify-between">
                <span className="text-accent-text">
                  <Icon name={r.icon} size={24} />
                </span>
                <span className="font-serif text-[15px] tracking-[0.06em] text-text-muted">
                  {r.num}
                </span>
              </div>
              <h3 className="mt-5 font-serif text-[1.28rem] font-semibold leading-[1.22] text-text-primary">
                {r.title}
              </h3>
              <p className="mt-[11px] text-pretty text-[14.5px] leading-[1.66] text-text-secondary">
                {r.body}
              </p>
            </div>
          ))}
        </div>
        <ReferralLink />
        <p className="mt-3.5 text-[12.5px] leading-[1.6] text-text-muted">
          Link shown is an example. Reward tiers are being finalised and will be confirmed before
          launch.
        </p>
      </div>
    </section>
  );
}
