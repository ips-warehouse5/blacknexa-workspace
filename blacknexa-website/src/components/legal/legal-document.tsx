import type { ReactNode } from "react";
import type { LegalSection } from "@/data/legal";

/**
 * Paragraphs are plain strings. `**…**` marks bold and `_…_` italic — the two
 * emphases the client's Privacy §12 copy uses, and the same markers the mobile
 * app's Privacy screen reads, so both render the copy identically.
 */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function LegalDocument({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="px-7 pb-[clamp(80px,9vw,120px)] pt-[clamp(122px,13vw,172px)]">
      <div className="mx-auto max-w-[1120px]">
        <p className="mb-5 text-[11px] font-semibold tracking-[0.22em] text-accent-text">LEGAL</p>
        <h1 className="font-serif text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.02em] text-text-primary">
          {title}
        </h1>
        <p className="mt-[18px] text-sm text-text-muted">Last updated {updated}</p>

        <div className="mt-[clamp(44px,5vw,70px)] flex flex-wrap gap-[clamp(32px,4vw,64px)]">
          <nav
            aria-label="Contents"
            className="sticky top-[112px] hidden min-w-[min(100%,230px)] flex-[0_1_248px] self-start md:block"
          >
            <p className="mb-4 text-[11px] font-semibold tracking-[0.16em] text-text-muted">
              CONTENTS
            </p>
            <div className="flex flex-col gap-0.5 border-l border-border">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="-ml-px border-l-2 border-transparent py-[9px] pl-4 text-[13.5px] leading-[1.45] text-text-muted hover:border-accent hover:text-accent-text"
                >
                  {s.n}. {s.title}
                </a>
              ))}
            </div>
          </nav>

          <div className="min-w-[min(100%,300px)] max-w-[680px] flex-[1_1_520px]">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-[120px] pb-[46px]">
                <h2 className="flex gap-3.5 font-serif text-[clamp(1.35rem,2.2vw,1.72rem)] font-semibold leading-[1.2] text-text-primary">
                  <span className="pt-[0.16em] text-[0.8em] text-accent-text">{s.n}</span>
                  {s.title}
                </h2>
                {s.body.map((p, i) => (
                  <p key={i} className="mt-[18px] text-pretty text-base leading-[1.78] text-text-secondary">
                    {renderInline(p)}
                  </p>
                ))}
              </section>
            ))}

            <div className="rounded-[5px] border border-border bg-surface p-[30px]">
              <h2 className="font-serif text-[1.35rem] font-semibold text-text-primary">
                Questions about this document
              </h2>
              <p className="mt-3 text-[15px] leading-[1.7] text-text-secondary">
                Write to <a href="mailto:legal@blacknexa.com">legal@blacknexa.com</a> or use the{" "}
                <a href="/contact">contact form</a>. We acknowledge legal notices in writing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
