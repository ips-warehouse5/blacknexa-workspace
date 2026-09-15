import Image from "next/image";
import { SectionHeading } from "@/components/ui/section-heading";
import { featureBlocks } from "@/data/features";
import { versionedAsset } from "@/lib/asset-version";

// Content-relevant stock photos (Unsplash) standing in for real product
// screenshots/clips of each feature. Swap for actual BlackNexa app captures
// (feed scroll, article view, geo-stamp incident flow) once available.
const FEATURE_IMAGES: Record<string, { src: string; alt: string }> = {
  "01": {
    src: "/images/blacknexa/feature-social-feed.jpg",
    alt: "Hands holding a smartphone scrolling a social feed, representing the Global Community Feed",
  },
  "02": {
    src: "/images/blacknexa/feature-news-engine.jpg",
    alt: "A vintage typewriter with a page reading \"News\", representing the BlackNexa AI News Engine",
  },
  "03": {
    src: "/images/blacknexa/feature-geo-stamp.jpg",
    alt: "Push pins marking locations on a map, representing the Geo-Stamp incident reporting tool",
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
                    sizes="(min-width: 768px) 440px, 100vw"
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
