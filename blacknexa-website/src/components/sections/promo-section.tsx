import Image from "next/image";
import { versionedAsset } from "@/lib/asset-version";

// Plain, non-interactive image — no play button/video affordance — so it
// isn't mistaken for an actual clickable video before the launch film
// exists. Swap this block for a real <video poster="..."> once delivered.
export function PromoSection() {
  return (
    <section
      aria-label="Media showcase"
      className="relative overflow-hidden px-7 py-[clamp(52px,5.6vw,80px)]"
      style={{ background: "var(--bn-hero-background)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 110% at 50% 0%, var(--bn-accent-soft) 0%, rgba(0,0,0,0) 64%)",
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
            See BlackNexa in ninety seconds
          </h2>
        </div>
        <div className="mt-[clamp(24px,2.8vw,36px)]">
          <div
            className="relative overflow-hidden rounded-[5px] border border-border"
            style={{ aspectRatio: "16 / 9" }}
          >
            <Image
              src={versionedAsset("/images/blacknexa/promo-showcase.jpg")}
              alt="Black women collaborating together on laptops, representing the community BlackNexa is built for"
              fill
              sizes="(min-width: 1080px) 1080px, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
