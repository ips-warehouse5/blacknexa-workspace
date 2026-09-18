export function NexaSection() {
  return (
    <section
      aria-label="NEXA"
      className="border-t border-border px-7 py-[clamp(48px,5.2vw,74px)]"
    >
      <div className="bn-reveal mx-auto flex max-w-[1180px] flex-wrap items-start gap-[clamp(28px,3.4vw,52px)]">
        <div className="min-w-[min(100%,280px)] flex-[0_1_380px]">
          <p className="font-serif text-[clamp(3.4rem,8vw,6.6rem)] font-bold leading-[0.86] tracking-[-0.03em] text-accent">
            NEXA
          </p>
          <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-text-muted">
            = THE NEXT GENERATION
          </p>
        </div>
        <div className="min-w-[min(100%,300px)] max-w-[64ch] flex-[1_1_440px]">
          <h2 className="text-balance font-serif text-[clamp(1.6rem,2.9vw,2.3rem)] font-semibold leading-[1.14] tracking-[-0.012em] text-text-primary">
            NEXA: The Power of Our Next Generation
          </h2>
          <p className="mt-[22px] text-pretty text-[clamp(1rem,1.2vw,1.12rem)] leading-[1.78] text-text-secondary">
            NEXA stands for The Next Generation. We are paving the way and
            opening doors of real opportunity for Black and Brown and
            Underserved Communities across the globe. We are putting advanced
            technology directly back into the hands of the people-empowering our
            youth and our communities to let their voices be heard, stand up for
            their rights, and handle injustice in a peaceful, godly manner.
          </p>
        </div>
      </div>
    </section>
  );
}
