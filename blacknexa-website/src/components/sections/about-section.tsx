// v2 splits About into a two-column read: the claim and its credentials on
// the left, the long-form body on the right. The single centred 764px column
// it replaced made these two paragraphs a wall of text.
const CREDENTIALS = ["TRADEMARK PENDING", "USPTO FILED", "GOD-CENTERED"];

export function AboutSection() {
  return (
    <section id="about" className="px-7 py-[clamp(56px,6vw,86px)]">
      <div className="bn-reveal mx-auto flex max-w-[1280px] flex-wrap items-start gap-[clamp(26px,3.4vw,56px)]">
        <div className="min-w-[min(100%,300px)] max-w-[520px] flex-[1_1_360px]">
          <p className="mb-[18px] text-[11px] font-semibold tracking-[0.22em] text-accent-text">
            ABOUT BLACKNEXA
          </p>
          <h2 className="text-balance font-serif text-[clamp(1.85rem,3.6vw,2.9rem)] font-semibold leading-[1.06] tracking-[-0.018em] text-text-primary">
            A digital sanctuary, a powerful shield, and a global megaphone
          </h2>
          <div className="mt-[26px] flex flex-wrap gap-2">
            {CREDENTIALS.map((c) => (
              <span
                key={c}
                className="rounded-[2px] bg-accent-soft px-[11px] py-[7px] text-[11.5px] font-semibold tracking-[0.1em] text-accent-text"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="grid min-w-[min(100%,300px)] flex-[1_1_420px] content-start gap-[18px]">
          <p className="text-pretty text-[clamp(0.98rem,1.1vw,1.06rem)] leading-[1.72] text-text-secondary">
            Welcome to BlackNexa™-a breakthrough, grassroots movement and
            trademark-pending mobile platform built specifically for the rising
            generation of Black, brown, and underserved communities. This
            isn&rsquo;t just an app; it is a digital sanctuary, a powerful
            shield, and a global megaphone for those ready to make a real
            change, walk in goodness, and rise above the noise. Rooted deeply in
            our rich history of overcoming adversity through Godly principles,
            unshakeable faith, elite education, and right living, we are not
            defined by the color of our skin, but by the content of our
            character, our brilliant minds, and our spiritual strength.
          </p>
          <p className="text-pretty border-t border-border pt-[18px] text-[clamp(0.98rem,1.1vw,1.06rem)] leading-[1.72] text-text-secondary">
            BLACKNEXA™ is a revolutionary, God-centered ecosystem combining a
            fact-driven AI news engine with powerful community tools to combat
            systemic discrimination against Black, Brown, and underserved
            communities. Officially filed with the USPTO as a legally protected
            social media platform, our mobile app and website serve as a trusted
            shield, a clear voice, and a verified portal for global press and
            media engagement. Grounded in Godly principles, we protect our
            community through positive, actionable civil rights resources and a
            highly secure digital vault engineered to preserve vital personal
            assets. Encrypted security built directly into our application
            ensures absolute defense to protect digital personal data at all
            times.
          </p>
        </div>
      </div>
    </section>
  );
}
