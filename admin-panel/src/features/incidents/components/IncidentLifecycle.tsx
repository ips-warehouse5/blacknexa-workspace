/**
 * The Incident Lifecycle card's timeline.
 *
 * Markup and colours follow the prototype's `renderIncidentLifecycle` — a dot
 * per step joined by a line, the step title with a tinted badge, "time · by",
 * and a line of detail — so the screen reads as the approved design. The steps
 * themselves are the real history, mapped in `incidents.lifecycle.ts`.
 *
 * A note is marked with who else can read it: the author sees dismissal notes
 * on their own timeline, while notes given with publication decisions are
 * operators-only. Saying so beside the text stops an operator treating one as
 * the other when they quote it back to a reporter.
 */

import { STEP_COLOURS, type LifecycleStep } from "@/features/incidents/incidents.lifecycle";

const VISIBILITY_TAGS = {
  author: "Shown to the author",
  internal: "Internal",
} as const;

export function IncidentLifecycle({ steps }: { steps: readonly LifecycleStep[] }) {
  if (steps.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>
        No lifecycle events recorded yet.
      </div>
    );
  }

  return (
    <ol
      className="lifecycle-timeline"
      aria-label="Incident lifecycle, oldest first"
      style={{ display: "flex", flexDirection: "column", gap: 0, margin: "6px 0 0", padding: 0, listStyle: "none" }}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const colours = STEP_COLOURS[step.tone];
        return (
          <li
            key={step.id}
            style={{ display: "flex", gap: 12, position: "relative", paddingBottom: last ? 0 : 18 }}
          >
            {!last ? (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 10,
                  top: 20,
                  bottom: 0,
                  width: 2,
                  background: colours.line,
                  zIndex: 1,
                }}
              />
            ) : null}
            <div
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: colours.dot,
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 10,
                fontWeight: 800,
                flexShrink: 0,
                zIndex: 2,
                boxShadow:
                  step.tone === "progress" ? "0 0 0 4px #fef3c7" : "0 0 0 3px var(--surface)",
              }}
            >
              {colours.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <strong style={{ fontSize: 12.5, color: "var(--text)" }}>{step.title}</strong>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: `${colours.badge}15`,
                    color: colours.badge,
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.badge}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
                {step.time} · <strong>{step.by}</strong>
              </div>
              {step.details.map((detail, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 11.5,
                    color: "var(--text)",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {detail.text}
                  {detail.visibility ? (
                    <span style={{ color: "var(--muted)", fontSize: 10.5, marginLeft: 6 }}>
                      ({VISIBILITY_TAGS[detail.visibility]})
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default IncidentLifecycle;
