import { ImagePlaceholder } from "@/components/ui/image-placeholder";
import { SectionHeading } from "@/components/ui/section-heading";
import { featureBlocks } from "@/data/features";

export function FeatureBlocksSection() {
  return (
    <section id="features" className="bg-surface px-7 pb-[clamp(60px,7vw,92px)] pt-[clamp(84px,10vw,140px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="INSIDE BLACKNEXA™"
          title="Your All-in-One Powerhouse"
          maxWidth="700px"
        />

        <div className="mt-[clamp(56px,6vw,84px)] flex flex-col gap-[clamp(64px,8vw,116px)]">
          {featureBlocks.map((b, i) => (
            <div
              key={b.num}
              className={`bn-reveal flex flex-wrap items-center gap-[clamp(34px,4.5vw,72px)] ${
                i % 2 === 1 ? "md:flex-row-reverse" : ""
              }`}
            >
              <div className="min-w-[min(100%,300px)] flex-[1_1_440px]">
                <ImagePlaceholder
                  label={`Poster frame — feature ${b.num}: ${b.caption}`}
                  aspect="4 / 3"
                />
                <p className="mt-3 text-[12.5px] leading-[1.55] text-text-muted">{b.caption}</p>
              </div>
              <div className="min-w-[min(100%,290px)] flex-[1_1_380px]">
                <p className="mb-[18px] font-serif text-[15px] tracking-[0.06em] text-accent">
                  {b.num}
                </p>
                <h3 className="text-balance font-serif text-[clamp(1.55rem,2.7vw,2.2rem)] font-semibold leading-[1.14] tracking-[-0.012em] text-text-primary">
                  {b.title}
                </h3>
                <p className="mt-3 text-[14px] italic leading-[1.5] text-accent">{b.sub}</p>
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
