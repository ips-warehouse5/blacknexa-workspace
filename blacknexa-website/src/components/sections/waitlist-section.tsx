import { WaitlistForm } from "@/components/forms/waitlist-form";

export function WaitlistSection() {
  return (
    <section
      id="waitlist"
      className="bg-accent-soft px-7 py-[clamp(52px,5.6vw,80px)]"
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-[clamp(26px,3.2vw,48px)]">
        <div className="bn-reveal min-w-[min(100%,300px)] max-w-[56ch] flex-[1_1_380px]">
          <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent-text">
            WAITLIST REGISTRATION
          </p>
          <h2 className="text-balance font-serif text-[clamp(1.95rem,4vw,3.05rem)] font-semibold leading-[1.08] tracking-[-0.015em] text-text-primary">
            Secure your spot before launch
          </h2>
          <p className="mt-6 text-pretty text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.72] text-text-secondary">
            Waitlist members get the download alert the moment BlackNexa reaches
            the Apple App Store and Google Play, plus early access as features
            roll out to our global family.
          </p>
        </div>
        <div className="bn-reveal min-w-[min(100%,300px)] max-w-[620px] flex-[1_1_420px]">
          <WaitlistForm variant="cta" idPrefix="cta" />
        </div>
      </div>
    </section>
  );
}
