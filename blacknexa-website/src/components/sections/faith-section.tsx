export function FaithSection() {
  return (
    <section
      aria-label="Built on faith"
      className="relative overflow-hidden px-7 py-[clamp(56px,6vw,86px)]"
      style={{ background: "var(--bn-feature-bg)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(88% 120% at 50% -10%, var(--bn-accent-soft) 0%, rgba(0,0,0,0) 62%)",
        }}
      />
      <div className="bn-reveal relative mx-auto max-w-[1080px]">
        <h2
          className="max-w-[16ch] text-balance font-serif text-[clamp(2.1rem,5.4vw,4.1rem)] font-bold leading-[1.02] tracking-[-0.02em]"
          style={{ color: "var(--bn-feature-ink)" }}
        >
          BLACKNEXA™: Built on Faith. Driven by Truth. Unstoppable.
        </h2>
        <div className="mt-[clamp(38px,4vw,58px)] flex flex-wrap items-start gap-[clamp(26px,3.5vw,58px)]">
          <p className="flex-none font-serif text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1.1] text-accent-text">
            First, God.
          </p>
          <p
            className="min-w-[min(100%,300px)] max-w-[70ch] flex-[1_1_460px] text-pretty text-[clamp(1rem,1.25vw,1.15rem)] leading-[1.78]"
            style={{ color: "var(--bn-feature-ink2)" }}
          >
            In everything we do, God comes first. We honor Him, keep His commandments, and let His
            wisdom direct our steps. When we live out our faith openly and walk in His divine
            purpose, His blessings flow naturally-bringing true abundance, clarity, and peace
            without any sorrow attached. The truth speaks for itself, and people everywhere
            naturally recognize and gravitate toward the light.
          </p>
        </div>
      </div>
    </section>
  );
}
