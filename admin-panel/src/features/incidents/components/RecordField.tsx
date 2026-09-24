/**
 * One labelled value in the right-hand action cards — the prototype's CASE
 * RECORD and CASE ASSIGNMENT blocks ("VERIFIED BY", "ASSIGNED AT", …).
 *
 * The prototype repeated the same inline styles for every field; one
 * component keeps the label scale and spacing identical across the cards.
 */

import type { ReactNode } from "react";

export function RecordField({
  label,
  children,
  emphasis = false,
  last = false,
}: {
  label: string;
  children: ReactNode;
  /** The card's headline value (status, assignee name) — larger and bold. */
  emphasis?: boolean;
  /** The final field before the card's buttons gets a little more room. */
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 16 : 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: "var(--muted)",
          textTransform: "uppercase",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: emphasis ? 14 : 13,
          fontWeight: emphasis ? 700 : 400,
          color: "var(--text)",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default RecordField;
