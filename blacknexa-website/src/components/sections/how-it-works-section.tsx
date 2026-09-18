import { Icon } from "@/components/icons/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { reportingSteps, workflowExamples } from "@/data/features";

export function HowItWorksSection() {
  return (
    <section
      aria-label="How a report travels"
      className="border-t border-border bg-surface-elevated px-7 py-[clamp(56px,6vw,86px)]"
    >
      <div className="mx-auto max-w-[1280px]">
        <SectionHeading
          eyebrow="CORE INCIDENT REPORTING, GLOBAL DISPATCH & RESOURCE DIRECTORY"
          title="From the moment it happens to the desk that answers"
          maxWidth="720px"
        />

        <div className="mt-[clamp(32px,3.6vw,46px)] grid grid-cols-[repeat(auto-fit,minmax(244px,1fr))] gap-px overflow-hidden rounded border border-border bg-border">
          {reportingSteps.map((s) => (
            <div
              key={s.num}
              className="bn-reveal flex flex-col bg-background px-6 pb-[30px] pt-[26px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-accent-text">
                  <Icon name={s.icon} size={24} />
                </span>
                <span className="font-serif text-[15px] tracking-[0.06em] text-text-muted">
                  {s.num}
                </span>
              </div>
              <h3 className="mt-[22px] font-serif text-[1.32rem] font-semibold leading-[1.2] text-text-primary">
                {s.title}
              </h3>
              <p className="mt-3 text-pretty text-[14.5px] leading-[1.68] text-text-secondary">
                {s.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-[clamp(36px,4vw,52px)]">
          <h3 className="font-serif text-[clamp(1.4rem,2.2vw,1.9rem)] font-semibold text-text-primary">
            Example Workflow in Action
          </h3>
          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(268px,1fr))] gap-[22px]">
            {workflowExamples.map((w) => (
              <div
                key={w.label}
                className="rounded-[5px] border border-border bg-background p-[26px]"
              >
                <p className="text-[11px] font-semibold tracking-[0.16em] text-accent-text">
                  {w.label}
                </p>
                <p className="mt-4 text-pretty text-[15px] leading-[1.72] text-text-secondary">
                  {w.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
