import { ImagePlaceholder } from "@/components/ui/image-placeholder";

export function PromoSection() {
  return (
    <section
      aria-label="Promotional video"
      className="relative overflow-hidden px-7 py-[clamp(80px,10vw,132px)]"
      style={{ background: "var(--bn-hero-background)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(80% 110% at 50% 0%, var(--bn-accent-soft) 0%, rgba(0,0,0,0) 64%)",
        }}
      />
      <div className="bn-reveal relative mx-auto max-w-[1080px]">
        <div className="max-w-[640px]">
          <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent">
            MEDIA SHOWCASE
          </p>
          <h2
            className="text-balance font-serif text-[clamp(1.95rem,4vw,3.05rem)] font-semibold leading-[1.08] tracking-[-0.015em]"
            style={{ color: "var(--bn-hero-text)" }}
          >
            See BlackNexa in ninety seconds.
          </h2>
        </div>
        <div className="mt-[clamp(32px,4vw,52px)]">
          <ImagePlaceholder
            label="PROMO VIDEO POSTER FRAME · 1920×1080 landscape — the opening frame of the launch film"
            aspect="16 / 9"
          />
          <p className="mt-3.5 text-[12.5px] leading-[1.55] text-text-muted">
            Drop the poster frame above; the final film replaces this frame when it is delivered.
          </p>
        </div>
      </div>
    </section>
  );
}
