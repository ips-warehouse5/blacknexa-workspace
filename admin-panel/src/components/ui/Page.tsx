/**
 * Page-level furniture: header, card shell, KPI tiles, tabs, empty state.
 *
 * These are the pieces every screen in the design repeats. Having them as
 * components rather than copied markup is what keeps twenty screens looking like
 * one product.
 */

import type { ReactNode } from "react";

// ── Page header ─────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Buttons or filters aligned to the right of the title. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="card-header-bar">
      <div>
        <h1 className="title">{title}</h1>
        {description ? (
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0" }}>{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{actions}</div>
      ) : null}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

/** The surface every screen's content sits on. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`.trim()}>{children}</div>;
}

// ── KPI tiles ───────────────────────────────────────────────────────────────

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  /** Pill or badge shown top-right, opposite the label. */
  tag?: ReactNode;
  icon?: ReactNode;
  /** Colours for the icon well, when the design tints it per tile. */
  iconStyle?: React.CSSProperties;
  /** The line under the value. */
  footer?: ReactNode;
  compact?: boolean;
}

export function KpiCard({
  label,
  value,
  tag,
  icon,
  iconStyle,
  footer,
  compact = false,
}: KpiCardProps) {
  return (
    <div className="kpi-card" {...(compact ? { style: { padding: "16px 18px" } } : {})}>
      <div className="kpi-top" {...(compact ? { style: { marginBottom: 6 } } : {})}>
        <span className="kpi-label">{label}</span>
        {tag}
        {icon ? (
          <div className="kpi-icon-wrap" {...(iconStyle ? { style: iconStyle } : {})}>
            {icon}
          </div>
        ) : null}
      </div>
      <div className="kpi-value" {...(compact ? { style: { fontSize: 22 } } : {})}>
        {value}
      </div>
      {footer ? <div className="kpi-sub">{footer}</div> : null}
    </div>
  );
}

/** Grid wrapper for a row of KPI tiles. */
export function KpiGrid({
  children,
  columns,
  style,
}: {
  children: ReactNode;
  columns?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="kpi-grid"
      style={{
        ...(columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Count shown after the label. */
  count?: number;
}

export interface TabsProps<T extends string = string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the tab strip. */
  label: string;
  /** The design's alternative underlined style. */
  variant?: "pill" | "section";
}

/**
 * A tab strip.
 *
 * Follows the ARIA tabs pattern: arrow keys move between tabs, and only the
 * selected tab is in the page tab order, so Tab moves past the strip to the
 * panel rather than stepping through every tab.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  label,
  variant = "pill",
}: TabsProps<T>) {
  const wrapperClass = variant === "pill" ? "tabs" : "section-tabs";
  const itemClass = variant === "pill" ? "tab" : "section-tab";

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = items.findIndex((i) => i.value === value);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;

    event.preventDefault();
    const target = items[next];
    if (target) onChange(target.value);
  };

  return (
    <div className={wrapperClass} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            // Roving tabindex: only the active tab is a tab stop.
            tabIndex={selected ? 0 : -1}
            className={`${itemClass}${selected ? " active" : ""}`}
            onClick={() => onChange(item.value)}
          >
            {item.label}
            {item.count !== undefined ? ` (${item.count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-placeholder">
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
