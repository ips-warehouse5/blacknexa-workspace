import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/contact-form";
import { siteConfig } from "@/data/site";

const description =
  "Reach BlackNexa for partnerships, press, legal or general enquiries. Every message goes to a person, not a queue.";

export const metadata: Metadata = {
  title: "Contact",
  description,
  alternates: { canonical: "/contact" },
  openGraph: { type: "website", title: `Contact — ${siteConfig.name}`, description, url: `${siteConfig.url}/contact` },
  twitter: { card: "summary", title: `Contact — ${siteConfig.name}`, description },
};

// Server-rendered on every request per the client's SSR requirement.
export const dynamic = "force-dynamic";

export default function ContactPage() {
  return (
    <div className="px-7 pb-[clamp(80px,9vw,120px)] pt-[clamp(122px,13vw,176px)]">
      <div className="mx-auto max-w-[1120px]">
        <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent">CONTACT</p>
        <h1 className="max-w-[20ch] font-serif text-[clamp(2.2rem,5vw,3.9rem)] font-bold leading-[1.02] tracking-[-0.02em] text-text-primary">
          Reach the people building this.
        </h1>
        <p className="mt-6 max-w-[60ch] text-[clamp(1rem,1.2vw,1.1rem)] leading-[1.7] text-text-secondary">
          Partnership, press, legal or a problem with the platform — send it here and it goes to a
          person, not a queue.
        </p>

        <div className="mt-[clamp(48px,6vw,76px)] flex flex-wrap gap-[clamp(32px,4vw,60px)]">
          <div className="min-w-[min(100%,300px)] flex-[1_1_440px]">
            <ContactForm />
          </div>

          <aside className="min-w-[min(100%,280px)] flex-[1_1_300px] self-start rounded-[5px] border border-border bg-surface p-8">
            <h2 className="font-serif text-[1.4rem] font-semibold text-text-primary">Direct lines</h2>
            <div className="mt-6 flex flex-col gap-5">
              {siteConfig.contactLines.map((l) => (
                <div key={l.label}>
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted">
                    {l.label}
                  </p>
                  <p className="mt-[7px] text-[15px] leading-[1.5]">
                    <a href={l.href}>{l.email}</a>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-[26px] border-t border-border pt-[22px] text-[13.5px] leading-[1.65] text-text-secondary">
              We reply to most messages within two business days. Legal notices are acknowledged
              in writing.
            </p>
            <p className="mt-[18px] text-[13.5px] leading-[1.65] text-text-secondary">
              BlackNexa™ is a technology and software platform provider — not a law firm, legal
              referral service or government oversight agency, and we do not provide legal advice.{" "}
              <a href="/terms">Read the full disclaimer</a>.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
