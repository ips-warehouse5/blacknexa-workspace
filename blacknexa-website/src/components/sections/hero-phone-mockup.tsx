/**
 * Reproduces the exact hero phone mockup markup from the source
 * `blacknexa-site.html` (a coded UI, not an image asset — see the
 * `<image-slot id="bn-hero-bg">` there for the actual photo slot, which is
 * the separate full-bleed background image this mockup floats in front of).
 *
 * The phone's screen renders a neutral iOS-style app UI that DOES flip
 * light/dark with the site theme (source's `surfaces.light`/`surfaces.dark`
 * palette) — it just isn't tinted by the site's warm-gold/signal-blue
 * accent surfaces, only the accent chips/buttons are (`--bn-accent`,
 * already theme-adaptive). See `--bn-phone-*` tokens in tokens.css.
 */
export function HeroPhoneMockup() {
  return (
    <div className="bn-reveal flex flex-none basis-[340px] justify-center" style={{ flexShrink: 1 }}>
      <div
        className="w-[314px] max-w-full rounded-[40px] p-[9px]"
        style={{
          border: "1px solid rgb(var(--bn-feature-on) / 0.14)",
          background: "var(--bn-feature-bg)",
          transform: "rotate(-2.2deg)",
          boxShadow: "0 44px 90px -34px rgba(0,0,0,0.9), 0 0 0 1px rgb(var(--bn-feature-on) / 0.05) inset",
        }}
      >
        <div className="relative overflow-hidden rounded-[33px]" style={{ background: "var(--bn-phone-bg)" }}>
          {/* Status bar */}
          <div className="relative flex items-center justify-between px-[18px] pb-[2px] pt-[11px] text-[11.5px]" style={{ color: "var(--bn-phone-ink)" }}>
            <span className="flex items-center gap-[5px] font-semibold">
              <span>3:42</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5H4.5s2-1.5 2-6.5" />
                <path d="M3.5 3.5 20.5 20.5" />
              </svg>
            </span>
            <span className="flex items-center gap-1">
              <svg width="12" height="10" viewBox="0 0 16 12" aria-hidden="true">
                <rect x="0" y="7" width="2.4" height="5" rx=".6" fill="currentColor" />
                <rect x="3.6" y="5" width="2.4" height="7" rx=".6" fill="currentColor" />
                <rect x="7.2" y="3" width="2.4" height="9" rx=".6" fill="currentColor" />
                <rect x="10.8" y="0" width="2.4" height="12" rx=".6" fill="currentColor" opacity=".35" />
              </svg>
              <svg width="12" height="10" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M2.4 6.6a14 14 0 0 1 19.2 0" />
                <path d="M6.4 11a9 9 0 0 1 11.2 0" />
                <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
              </svg>
              <span
                className="flex h-[10px] w-[19px] items-center justify-center rounded-[2.5px] text-[7px] font-bold"
                style={{ background: "var(--bn-accent)", color: "var(--bn-accent-foreground)" }}
              >
                63
              </span>
            </span>
          </div>

          {/* App header */}
          <div className="flex flex-col gap-[10px] px-[14px] pb-3 pt-[10px]" style={{ borderBottom: "1px solid var(--bn-phone-line)" }}>
            <div className="flex items-center gap-[9px]">
              <span
                className="grid h-7 w-7 flex-none place-items-center rounded-[8px]"
                style={{ border: "1px solid var(--bn-accent)", background: "var(--bn-phone-bg2)" }}
              >
                <svg width="13" height="15" viewBox="0 0 48 56" aria-hidden="true">
                  <path d="M24 4 42 10.4V28C42 39.6 34 47.8 24 51.2 14 47.8 6 39.6 6 28V10.4Z" fill="var(--bn-accent)" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-[2px] text-sm font-bold tracking-[-0.01em]" style={{ color: "var(--bn-phone-ink)" }}>
                  BlackNexa<span className="pt-px text-[7.5px] font-semibold">TM</span>
                </span>
                <span className="mt-0.5 block text-[9px] tracking-[0.01em]" style={{ color: "var(--bn-phone-ink3)" }}>
                  Community · Evidence · Trust
                </span>
              </span>
              <span
                className="relative grid h-7 w-7 flex-none place-items-center rounded-[9px]"
                style={{ background: "var(--bn-phone-bg2)", border: "1px solid var(--bn-phone-line)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--bn-phone-ink2)" strokeWidth="1.7" aria-hidden="true">
                  <path d="M6.6 9.6a5.4 5.4 0 0 1 10.8 0c0 4.8 1.9 6.3 1.9 6.3H4.7s1.9-1.5 1.9-6.3" />
                  <path d="M10.2 19a2 2 0 0 0 3.6 0" />
                </svg>
                <span
                  className="absolute right-1 top-[3px] block h-[5px] w-[5px] rounded-full"
                  style={{ background: "var(--bn-accent)" }}
                />
              </span>
            </div>
            <div className="flex items-center gap-[7px] rounded-full px-3 py-2" style={{ background: "var(--bn-phone-bg2)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bn-phone-ink3)" strokeWidth="2" aria-hidden="true">
                <circle cx="10.6" cy="10.6" r="6.6" />
                <path d="M15.6 15.6 20.4 20.4" />
              </svg>
              <span className="text-[10px]" style={{ color: "var(--bn-phone-ink3)" }}>
                Search incidents, areas, categories
              </span>
            </div>
          </div>

          {/* Category pills */}
          <div className="flex gap-[6px] overflow-hidden py-[9px] pl-[14px]">
            <span
              className="flex-none rounded-full px-[13px] py-[6px] text-[9.5px] font-semibold"
              style={{ background: "var(--bn-accent)", color: "var(--bn-accent-foreground)" }}
            >
              All
            </span>
            {["Profiling", "Housing", "Workplace"].map((label) => (
              <span
                key={label}
                className="flex-none rounded-full px-3 py-[6px] text-[9.5px]"
                style={{ border: "1px solid var(--bn-phone-line)", color: "var(--bn-phone-ink2)" }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Feed */}
          <div className="relative h-[404px] overflow-hidden">
            <div className="flex items-baseline justify-between px-[14px] pt-[2px]">
              <span className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--bn-phone-ink)" }}>
                Community Feed
              </span>
              <span className="text-[9.5px]" style={{ color: "var(--bn-phone-ink3)" }}>
                6 stories
              </span>
            </div>

            <div className="mt-[10px] flex flex-col gap-[11px] px-[14px]">
              <FeedCard
                category="POLICING"
                badges={["Public", "Urgent"]}
                time="2h ago"
                title="Stopped and searched without cause outside corner market"
                body="Officers approached without explanation, requested ID, and searched my bag. No reason given. Logged badge numbers and timestamps."
                location="Brownsville, Brooklyn · M. Thompson"
                stats={["142", "3 evidence", "12 verified"]}
              />
              <FeedCard
                category="HOUSING"
                badges={["Public"]}
                time="9h ago"
                title="Landlord refused to accept housing voucher"
                body="Application was pre-approved, then withdrawn the moment the voucher was mentioned. Saved emails and voicemails."
                location="Atlanta, GA · Anonymous"
                stats={["87", "7 evidence", "5 verified"]}
              />
              <div className="rounded-[11px] px-3 pb-5 pt-[11px]" style={{ background: "var(--bn-phone-bg2)" }}>
                <div className="flex items-center gap-[5px]">
                  <span
                    className="rounded-full px-[7px] py-1 text-[8px] font-bold tracking-[0.08em]"
                    style={{ background: "var(--bn-accent-soft)", color: "var(--bn-accent)" }}
                  >
                    WORKPLACE
                  </span>
                  <span className="ml-auto text-[8.5px]" style={{ color: "var(--bn-phone-ink3)" }}>
                    1d ago
                  </span>
                </div>
              </div>
            </div>

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
              style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, var(--bn-phone-bg) 82%)" }}
            />
            <div
              className="absolute bottom-4 right-[14px] flex items-center gap-[6px] rounded-full px-[17px] py-[11px] text-[11px] font-bold"
              style={{ background: "var(--bn-accent)", color: "var(--bn-accent-foreground)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Report
            </div>
          </div>

          {/* Bottom nav */}
          <div className="flex justify-between px-3 pb-[14px] pt-[9px]" style={{ borderTop: "1px solid var(--bn-phone-line)", background: "var(--bn-phone-bg)" }}>
            <NavItem label="Feed" active>
              <circle cx="12" cy="12" r="2.2" />
              <path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2M4.4 4.4a10.7 10.7 0 0 0 0 15.2M19.6 4.4a10.7 10.7 0 0 1 0 15.2" />
            </NavItem>
            <NavItem label="News">
              <path d="M12 5.6C10 4.2 7.4 3.8 4.6 4v14c2.8-.2 5.4.2 7.4 1.6 2-1.4 4.6-1.8 7.4-1.6V4c-2.8-.2-5.4.2-7.4 1.6Z" />
              <path d="M12 5.6v14" />
            </NavItem>
            <NavItem label="Vault">
              <rect x="4.6" y="10.4" width="14.8" height="9.4" rx="2.2" />
              <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
            </NavItem>
            <NavItem label="Report">
              <path d="M12 3.4 19.6 6v6.4c0 4.6-3.2 7.8-7.6 9.2-4.4-1.4-7.6-4.6-7.6-9.2V6Z" />
            </NavItem>
            <NavItem label="Support">
              <circle cx="12" cy="12" r="8.4" />
              <circle cx="12" cy="12" r="3.4" />
              <path d="M6.1 6.1 9.6 9.6M17.9 6.1 14.4 9.6M6.1 17.9l3.5-3.5M17.9 17.9l-3.5-3.5" />
            </NavItem>
            <NavItem label="Profile">
              <circle cx="12" cy="8.4" r="3.6" />
              <path d="M4.8 19.6a7.2 7.2 0 0 1 14.4 0" />
            </NavItem>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedCard({
  category,
  badges,
  time,
  title,
  body,
  location,
  stats,
}: {
  category: string;
  badges: string[];
  time: string;
  title: string;
  body: string;
  location: string;
  stats: [string, string, string];
}) {
  return (
    <div className="rounded-[11px] px-3 pb-3 pt-[11px]" style={{ background: "var(--bn-phone-bg2)" }}>
      <div className="flex items-center gap-[5px]">
        <span
          className="rounded-full px-[7px] py-1 text-[8px] font-bold tracking-[0.08em]"
          style={{ background: "var(--bn-accent-soft)", color: "var(--bn-accent)" }}
        >
          {category}
        </span>
        {badges.map((b) => (
          <span
            key={b}
            className="flex items-center gap-[3px] rounded-full px-[7px] py-[3px] text-[8.5px]"
            style={{
              border: `1px solid ${b === "Urgent" ? "var(--bn-err)" : "var(--bn-ok)"}`,
              color: b === "Urgent" ? "var(--bn-err)" : "var(--bn-ok)",
            }}
          >
            {b}
          </span>
        ))}
        <span className="ml-auto text-[8.5px]" style={{ color: "var(--bn-phone-ink3)" }}>
          {time}
        </span>
      </div>
      <p className="mt-[9px] text-[11.5px] font-bold leading-[1.32] tracking-[-0.005em]" style={{ color: "var(--bn-phone-ink)" }}>
        {title}
      </p>
      <p className="mt-[7px] text-[9.5px] leading-[1.5]" style={{ color: "var(--bn-phone-ink2)" }}>
        {body}
      </p>
      <p className="mt-[9px] text-[9px]" style={{ color: "var(--bn-phone-ink3)" }}>
        {location}
      </p>
      <div className="mt-[10px] flex gap-[6px] pt-[10px]" style={{ borderTop: "1px solid var(--bn-phone-line)" }}>
        {stats.map((s, i) => (
          <span
            key={s}
            className="rounded-full px-[9px] py-[5px] text-[9px]"
            style={{
              background: "var(--bn-phone-bg3)",
              color: i === 0 ? "var(--bn-phone-ink2)" : i === 1 ? "var(--bn-accent)" : "var(--bn-ok)",
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function NavItem({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className="flex flex-col items-center gap-[3px]"
      style={{ color: active ? "var(--bn-accent)" : "var(--bn-phone-ink3)" }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {children}
      </svg>
      <span className="text-[7.5px]" style={{ fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
    </span>
  );
}
