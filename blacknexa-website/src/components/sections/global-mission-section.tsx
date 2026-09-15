// v2 sets this section on the accent tint and lifts the quote onto its own
// card beside the heading, rather than running heading and blockquote down a
// single centred column.
export function GlobalMissionSection() {
  return (
    <section aria-label="Global mission" className="bg-accent-soft px-7 py-[clamp(52px,5.6vw,80px)]">
      <div className="bn-reveal mx-auto flex max-w-[1280px] flex-wrap items-start gap-[clamp(26px,3.4vw,52px)]">
        <div className="min-w-[min(100%,280px)] max-w-[420px] flex-[1_1_300px]">
          <p className="mb-[18px] text-[11px] font-semibold tracking-[0.22em] text-accent-text">
            BLACKNEXA GLOBAL MISSION
          </p>
          <h2 className="text-balance font-serif text-[clamp(1.6rem,3vw,2.35rem)] font-semibold leading-[1.08] tracking-[-0.015em] text-text-primary">
            Automated Global Research &amp; Dignity Mission
          </h2>
          {/* Outline-only shield: the filled inner crest of the full logo
              would read as a second brand mark this far down the page. */}
          <svg
            width="30"
            height="36"
            viewBox="0 0 48 56"
            fill="none"
            aria-hidden="true"
            className="mt-[22px]"
          >
            <path
              d="M24 2.6 44.2 9.4V28.2C44.2 41 35.4 50.2 24 53.8 12.6 50.2 3.8 41 3.8 28.2V9.4Z"
              stroke="var(--bn-accent)"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <blockquote className="min-w-[min(100%,300px)] flex-[1_1_440px] rounded-r-[5px] border-l-[3px] border-accent bg-background p-[clamp(24px,2.8vw,34px)]">
          <p className="text-pretty font-serif text-[clamp(1.1rem,1.6vw,1.4rem)] leading-[1.52] text-text-primary">
            &ldquo;BlackNexa™ employs automated AI geographic research to connect users anywhere in
            the world with the exact local, state, national, and international oversight
            authorities qualified to address their specific incidents-whether regarding housing
            discrimination, workplace bias, civil rights violations, or law enforcement
            misconduct. Grounded in the belief that all individuals are created equal under God
            and deserve to be treated with dignity, honor, and respect, BlackNexa™ provides the
            technical tools to ensure community voices are heard globally.&rdquo;
          </p>
        </blockquote>
      </div>
    </section>
  );
}
