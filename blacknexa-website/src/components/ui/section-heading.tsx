export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  maxWidth = "40ch",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  maxWidth?: string;
}) {
  return (
    <div
      className={`bn-reveal max-w-[660px] ${align === "center" ? "mx-auto text-center" : ""}`}
      style={align === "center" ? undefined : { maxWidth }}
    >
      <p className="mb-[22px] text-[11px] font-semibold tracking-[0.22em] text-accent-text">
        {eyebrow}
      </p>
      <h2 className="font-serif text-[clamp(1.95rem,4vw,3.05rem)] font-semibold leading-[1.08] tracking-[-0.015em] text-balance text-text-primary">
        {title}
      </h2>
      {description ? (
        <p className="mt-6 text-[clamp(1rem,1.2vw,1.12rem)] leading-[1.72] text-pretty text-text-secondary">
          {description}
        </p>
      ) : null}
    </div>
  );
}
