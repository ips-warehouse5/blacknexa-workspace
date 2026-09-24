import { AppleLogo, GooglePlayLogo } from "@/components/icons/store-badges";

/**
 * Dimmed App Store / Google Play badges with a "COMING SOON" tag. Not links:
 * there is nothing to download yet. At launch, turn each badge into a link to
 * its store listing and drop the tag.
 *
 * Uses the --bn-feature-* tokens, so it sits on feature surfaces (the
 * /waitlist page) in both themes.
 */
export function ComingSoonBadges({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <StoreBadge label="App Store" icon={<AppleLogo />} />
      <StoreBadge label="Google Play" icon={<GooglePlayLogo />} />
      <span className="rounded-[2px] border border-accent px-[9px] py-1 text-[11px] font-semibold tracking-[0.16em] text-accent-text">
        COMING SOON
      </span>
    </div>
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
