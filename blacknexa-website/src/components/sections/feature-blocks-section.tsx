import Image from "next/image";
import { SectionHeading } from "@/components/ui/section-heading";
import { featureBlocks } from "@/data/features";
import { versionedAsset } from "@/lib/asset-version";

// All three images are client-supplied artwork. They sit in a 4:3 frame, so
// replacements should be 4:3 — ideally 1600 × 1200.
const FEATURE_IMAGES: Record<string, { src: string; alt: string }> = {
  "01": {
    src: "/images/blacknexa/feature-social-feed.jpg",
    alt: "Someone scrolling the BlackNexa community feed on their phone at a café table, beside a coffee, a notebook and a Bible",
  },
  "02": {
    src: "/images/blacknexa/feature-news-engine.jpg",
    alt: "Someone reading a BlackNexa news story on their phone by a window at sunrise, a headline about a Justice Department review of the Shreveport police",
  },
  "03": {
    src: "/images/blacknexa/feature-geo-stamp.jpg",
    alt: "A phone showing a BlackNexa incident report with its time, sealed evidence files and approximate location, beside a gold location pin on a city map and a gold padlock shield",
  },
};

export function FeatureBlocksSection() {
  return (
    <section id="features" className="px-7 pb-[clamp(44px,5vw,66px)] pt-[clamp(56px,6vw,86px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="INSIDE BLACKNEXA™"
          title="Your All-in-One Powerhouse"
          maxWidth="700px"
        />

        <div className="mt-[clamp(34px,3.8vw,50px)] flex flex-col gap-[clamp(44px,5vw,72px)]">
          {featureBlocks.map((b, i) => (
            <div
              key={b.num}
              className={`bn-reveal flex flex-wrap items-center gap-[clamp(28px,3.4vw,52px)] ${
                i % 2 === 1 ? "md:flex-row-reverse" : ""
              }`}
            >
              <div className="min-w-[min(100%,300px)] flex-[1_1_440px]">
                <div
                  className="relative overflow-hidden rounded-[5px] border border-border"
                  style={{ aspectRatio: "4 / 3" }}
                >
                  <Image
                    src={versionedAsset(FEATURE_IMAGES[b.num].src)}
                    alt={FEATURE_IMAGES[b.num].alt}
                    fill
                    // Rendered widths, so the browser downloads a sharp enough
                    // file: two columns from ~906px (about half the width,
                    // capped at ~645px once the 1280px container is full),
                    // stacked and full content width (viewport − 56px padding)
                    // below that.
                    sizes="(min-width: 1336px) 645px, (min-width: 906px) 50vw, calc(100vw - 56px)"
                    // The pictures show app screens; their text needs more
                    // than the default 75 to stay crisp. Allowed in next.config.
                    quality={90}
                    className="object-cover"
                  />
                </div>
                <p className="mt-3 text-[12.5px] leading-[1.55] text-text-muted">{b.caption}</p>
              </div>
              <div className="min-w-[min(100%,290px)] flex-[1_1_380px]">
                <p className="mb-[18px] font-serif text-[15px] tracking-[0.06em] text-accent-text">
                  {b.num}
                </p>
                <h3 className="text-balance font-serif text-[clamp(1.55rem,2.7vw,2.2rem)] font-semibold leading-[1.14] tracking-[-0.012em] text-text-primary">
                  {b.title}
                </h3>
                <p className="mt-3 text-[14px] italic leading-[1.5] text-accent-text">{b.sub}</p>
                {b.body.map((para, idx) => (
                  <p key={idx} className="mt-5 text-pretty text-[clamp(0.98rem,1.15vw,1.08rem)] leading-[1.74] text-text-secondary">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
