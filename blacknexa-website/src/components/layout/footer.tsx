import { HashLink } from "@/components/ui/hash-link";
import { BlackNexaLogo } from "@/components/ui/logo";
import {
  footerCompanyLinks,
  footerLegalLinks,
  footerProductLinks,
} from "@/data/navigation";
import { siteConfig } from "@/data/site";

export function Footer() {
  return (
    <footer
      className="border-t border-border px-7 pb-[46px] pt-[62px] md:pt-[92px]"
      style={{ background: "var(--bn-hero-background)" }}
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-11">
          <div>
            <span style={{ color: "var(--bn-hero-text)" }}>
              <BlackNexaLogo size={26} />
            </span>
            <p className="mt-[18px] text-sm tracking-wide" style={{ color: "var(--bn-hero-secondary-text)" }}>
              {siteConfig.tagline}
            </p>
            <p className="mt-3.5 text-[13px] leading-[1.6] text-text-muted">
              {siteConfig.trademarkNote}
            </p>
          </div>

          <FooterColumn title="PRODUCT" links={footerProductLinks} />
          <FooterColumn title="COMPANY" links={footerCompanyLinks} />
          <FooterColumn title="LEGAL" links={footerLegalLinks} />
        </div>

        <div className="mt-[52px] border-t border-border pt-[34px]">
          <p className="text-[13px] text-text-muted">
            © {new Date().getFullYear()} BlackNexa. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="mb-[18px] text-[11px] font-semibold tracking-[0.16em] text-text-muted">
        {title}
      </p>
      <div className="flex flex-col gap-3">
        {links.map((link) => (
          <HashLink
            key={link.label}
            href={link.href}
            className="text-[14.5px] transition-colors hover:!text-accent"
            style={{ color: "var(--bn-hero-secondary-text)" }}
          >
            {link.label}
          </HashLink>
        ))}
      </div>
    </div>
  );
}
