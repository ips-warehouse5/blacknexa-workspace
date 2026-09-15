import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";
import { siteConfig } from "@/data/site";

export function ContactTeaserSection() {
  return (
    <section aria-label="Contact and partnership" className="px-7 py-[clamp(52px,5.6vw,80px)]">
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="CONTACT & PARTNERSHIP"
          title="Work with us."
          description="Press, partnerships, advertising or legal — every message goes to a person, not a queue. We reply to most enquiries within two business days."
          maxWidth="660px"
        />
        <div className="mt-[clamp(28px,3.2vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(244px,1fr))] gap-px overflow-hidden rounded border border-border bg-border">
          {siteConfig.contactLines.map((l) => (
            <div key={l.label} className="bn-reveal bg-background px-6 pb-[30px] pt-[26px]">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted">
                {l.label}
              </p>
              <p className="mt-3.5 font-serif text-[1.16rem] leading-[1.3]">
                <a href={l.href}>{l.email}</a>
              </p>
            </div>
          ))}
        </div>
        <Link
          href="/contact"
          className="mt-[clamp(28px,3vw,40px)] inline-flex min-h-[48px] items-center justify-center rounded-[3px] border border-border px-6 text-[14.5px] text-text-primary transition-colors hover:border-accent hover:text-accent-text"
        >
          Open the full contact form
        </Link>
      </div>
    </section>
  );
}
