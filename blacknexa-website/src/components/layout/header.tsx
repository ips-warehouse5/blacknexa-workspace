import { HomeLink } from "@/components/ui/home-link";
import { BlackNexaLogo } from "@/components/ui/logo";
import { HashLink } from "@/components/ui/hash-link";
import { mainNav } from "@/data/navigation";
import { HeaderChrome } from "./header-chrome";
import { MobileMenu } from "./mobile-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-[80]">
      <HeaderChrome>
        <div
          className="relative mx-auto flex max-w-[1280px] items-center gap-8 px-7 py-4"
          style={{ color: "var(--bn-header-ink)" }}
        >
          <HomeLink
            aria-label="BlackNexa home"
            className="relative z-10 flex flex-none items-center gap-[11px] -m-2 p-2"
            style={{ color: "var(--bn-accent)" }}
          >
            <BlackNexaLogo />
          </HomeLink>

          <nav className="ml-auto hidden items-center gap-[26px] lg:flex" aria-label="Primary">
            {mainNav.map((item) => (
              <HashLink
                key={item.href}
                href={item.href}
                className="text-sm tracking-wide transition-colors hover:!text-accent-text"
                style={{ color: "var(--bn-header-ink2)" }}
              >
                {item.label}
              </HashLink>
            ))}
            <HashLink
              href="/waitlist"
              className="min-h-[44px] rounded-[3px] bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-[filter] hover:brightness-110"
            >
              Join the waitlist
            </HashLink>
            <ThemeToggle />
          </nav>

          <div className="ml-auto flex items-center gap-3 lg:hidden">
            <HashLink
              href="/waitlist"
              className="min-h-[40px] rounded-[3px] bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-accent-foreground"
            >
              Join
            </HashLink>
            <MobileMenu />
          </div>
        </div>
      </HeaderChrome>
    </header>
  );
}
