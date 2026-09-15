import { proofStats } from "@/data/features";

export function ProofBar() {
  return (
    <section aria-label="At a glance" className="border-y border-border">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(232px,1fr))] px-7">
        {proofStats.map((item) => (
          <div
            key={item.label}
            className="bn-reveal border-r border-border px-[30px] pt-[38px] pb-10"
          >
            <p className="text-[11px] font-semibold tracking-[0.18em] text-text-muted">{item.label}</p>
            <p className="mt-3.5 font-serif text-[clamp(1.3rem,1.9vw,1.75rem)] font-semibold leading-[1.05] text-text-primary">
              {item.value}
            </p>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-text-secondary">{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
