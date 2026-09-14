import { AppleLogo, GooglePlayLogo } from "@/components/icons/store-badges";
import { WaitlistForm } from "@/components/forms/waitlist-form";
import { ImagePlaceholder } from "@/components/ui/image-placeholder";

export function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-end overflow-hidden pt-[132px]"
      style={{ background: "var(--bn-feature-bg)" }}
    >
      <div className="absolute inset-0">
        <ImagePlaceholder
          label="HERO IMAGE · 2400×1600 or larger, landscape — everyday people, a street, a community gathering. Keep the left third clear of faces so the headline reads."
          aspect="auto"
          className="h-full w-full border-0"
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(var(--bn-feature-scrim) / 0.86) 0%, rgb(var(--bn-feature-scrim) / 0.62) 34%, rgb(var(--bn-feature-scrim) / 0.8) 72%, var(--bn-feature-bg) 100%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-[1280px] flex-wrap items-end gap-14 px-7 pb-[82px]">
        <div className="bn-reveal min-w-[min(100%,320px)] max-w-[720px] flex-[1_1_520px]">
          <p className="mb-[26px] text-xs font-semibold tracking-[0.22em] text-accent">
            PRE-LAUNCH · iOS AND ANDROID
          </p>
          <h1
            className="font-serif text-[clamp(2.7rem,6.4vw,5.9rem)] font-bold leading-[0.96] tracking-[-0.022em] text-balance"
            style={{ color: "var(--bn-feature-ink)" }}
          >
            Your Voice. Your Shield. Absolute Truth.
          </h1>
          <p
            className="mt-[30px] max-w-[60ch] text-[clamp(1.02rem,1.35vw,1.22rem)] leading-[1.62]"
            style={{ color: "var(--bn-feature-ink2)" }}
          >
            Document what happened the moment it happens — GPS, time and evidence sealed. Route
            your report to the agencies that should answer for it. And read news that&rsquo;s
            actually verified. Built for Black and Brown communities worldwide.
          </p>
          <p className="mt-5 text-[15px] italic leading-[1.5] text-accent opacity-90">
            Built on God first, absolute truth, and moral integrity.
          </p>

          <div className="mt-[38px] max-w-[620px]">
            <WaitlistForm variant="hero" idPrefix="hero" />
          </div>

          <div className="mt-[34px] flex flex-wrap items-center gap-3">
            <StoreBadge label="App Store" icon={<AppleLogo />} />
            <StoreBadge label="Google Play" icon={<GooglePlayLogo />} />
            <span className="rounded-[2px] border border-accent px-[9px] py-1 text-[11px] font-semibold tracking-[0.16em] text-accent">
              COMING SOON
            </span>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute bottom-10 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1.5 md:flex"
        style={{ color: "var(--bn-feature-ink2)", animation: "bn-cue 2.4s ease-in-out infinite" }}
      >
        <span className="text-[10px] tracking-[0.18em]">SCROLL</span>
        <span className="block h-[22px] w-px" style={{ background: "currentColor" }} />
      </div>
    </section>
  );
}

function StoreBadge({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div
      aria-label={`${label} — coming soon`}
      className="flex items-center gap-2.5 rounded-[5px] border px-4 py-2.5 opacity-50"
      style={{ borderColor: "rgb(var(--bn-feature-on) / 0.16)", color: "var(--bn-feature-ink)" }}
    >
      {icon}
      <span className="text-[13px]">{label}</span>
    </div>
  );
}
