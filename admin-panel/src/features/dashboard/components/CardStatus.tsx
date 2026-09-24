/**
 * The in-card states the prototype never drew: loading, empty and failed.
 *
 * Each takes the place of a card's plot at the plot's height, so a card does
 * not jump when its figures arrive and the two cards of a row stay level. A
 * failure says what the server said and offers the same request again; it
 * never falls back to the prototype's numbers.
 */

import type { ReactNode } from "react";

/** The chart's plot height (`.chart-bars-wrap`), the default for every state. */
const PLOT_HEIGHT = 180;

export function CardPlaceholder({
  children,
  busy = false,
  minHeight = PLOT_HEIGHT,
}: {
  children: ReactNode;
  busy?: boolean;
  minHeight?: number;
}) {
  return (
    <div
      role="status"
      aria-busy={busy}
      style={{
        minHeight,
        display: "grid",
        placeItems: "center",
        padding: "12px 16px",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 13,
      }}
    >
      <div>{children}</div>
    </div>
  );
}

export function CardError({
  message,
  onRetry,
  minHeight = PLOT_HEIGHT,
}: {
  message: string;
  onRetry: () => void;
  minHeight?: number;
}) {
  return (
    <CardPlaceholder minHeight={minHeight}>
      <div style={{ marginBottom: 12 }}>{message}</div>
      <button type="button" className="btn outline" onClick={onRetry}>
        Try again
      </button>
    </CardPlaceholder>
  );
}

/**
 * The line under a card whose background refresh failed while older figures
 * are still on screen — they stay, and the card says they may be stale.
 */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
      Couldn’t refresh — these figures may be out of date.{" "}
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: 0,
          border: 0,
          background: "none",
          color: "var(--accent)",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </p>
  );
}
