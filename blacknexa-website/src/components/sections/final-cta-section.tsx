import { HashLink } from "@/components/ui/hash-link";
import { AppleLogo, GooglePlayLogo } from "@/components/icons/store-badges";

export function FinalCtaSection() {
  return (
    <section
      className="relative overflow-hidden px-7 py-[clamp(64px,7vw,100px)]"
      style={{ background: "var(--bn-hero-background)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(72% 120% at 50% 0%, var(--bn-accent-soft) 0%, rgba(0,0,0,0) 68%)",
        }}
      />
      <div className="bn-reveal relative mx-auto max-w-[860px] text-center">
        <p className="mb-6 text-[11px] font-semibold tracking-[0.22em] text-accent">
          THE FUTURE IS OURS
        </p>
        <h2
          className="text-balance font-serif text-[clamp(2.1rem,5.2vw,4rem)] font-bold leading-[1.02] tracking-[-0.02em]"
          style={{ color: "var(--bn-hero-text)" }}
        >
          This is our time. This is our tool.
        </h2>
        <p
          className="mx-auto mt-7 max-w-[66ch] text-pretty text-[clamp(1rem,1.3vw,1.16rem)] leading-[1.75]"
          style={{ color: "var(--bn-hero-secondary-text)" }}
        >
          BlackNexa is a movement of truth, power, and divine purpose. We are equipping the next
          generation of Black and Brown and Underserved and Disenfranchise Communities to be
          rooted in Gods Holy word, educated, business-savvy, and anchored in faith to level the
          playing field once and for all-ensuring that we prosper, walk according to His purpose,
          and let our voices be heard without ever being suppressed by discriminatory practices.
        </p>
        <p className="mx-auto mt-[22px] max-w-[66ch] font-serif text-[clamp(1.15rem,1.7vw,1.45rem)] leading-[1.5] text-accent">
          Welcome to BlackNexa. To God be the Glory!
        </p>

        <div className="mt-10 border-t border-border pt-8">
          <p
            className="text-[11px] font-semibold tracking-[0.18em]"
            style={{ color: "var(--bn-hero-secondary-text)" }}
          >
            DOWNLOAD THE APP TODAY
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <span
              className="flex items-center gap-2.5 rounded-[5px] border px-[18px] py-2.5 text-[13.5px] opacity-55"
              style={{ borderColor: "rgba(255,255,255,0.16)", color: "var(--bn-hero-text)" }}
            >
              <AppleLogo width={16} height={19} />
              App Store
            </span>
            <span
              className="flex items-center gap-2.5 rounded-[5px] border px-[18px] py-2.5 text-[13.5px] opacity-55"
              style={{ borderColor: "rgba(255,255,255,0.16)", color: "var(--bn-hero-text)" }}
            >
              <GooglePlayLogo width={16} height={18} />
              Google Play
            </span>
            <span className="self-center rounded-[2px] border border-accent px-2.5 py-[5px] text-[11px] font-semibold tracking-[0.16em] text-accent">
              COMING SOON
            </span>
          </div>
        </div>

        <HashLink
          href="/#waitlist"
          className="mt-[34px] inline-flex min-h-[48px] items-center justify-center rounded-[3px] bg-accent px-[30px] py-[17px] text-[15px] font-semibold text-accent-foreground transition-[filter] hover:brightness-110"
        >
          Join the Global Movement
        </HashLink>
      </div>
    </section>
  );
}
