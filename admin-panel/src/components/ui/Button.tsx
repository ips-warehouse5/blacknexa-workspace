/**
 * Buttons.
 *
 * Two concerns beyond styling:
 *
 * `loading` disables the button and swaps in a spinner, but keeps the label in
 * the accessible name — a control that announces itself as "Loading" has lost
 * the information about what it does.
 *
 * `deniedReason` is how RBAC reaches a control. A button the role cannot use is
 * shown disabled with an explanation rather than removed, because an operator
 * who cannot see an action cannot tell that it exists and is not theirs. Removal
 * is right for whole sections; explanation is right for individual actions.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "outline" | "danger" | "enforce";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Leading glyph. Rendered before the label. */
  icon?: ReactNode;
  /**
   * When set, the button is disabled and carries this as its tooltip and
   * accessible description. Used for permission locks.
   */
  deniedReason?: string;
  className?: string;
  children?: ReactNode;
}

export function Button({
  variant = "outline",
  loading = false,
  icon,
  deniedReason,
  className = "",
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const locked = Boolean(deniedReason);
  const isDisabled = disabled || loading || locked;

  const classes = ["btn", variant, locked ? "perm-locked" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      {...(locked ? { title: deniedReason } : {})}
      {...(loading ? { "aria-busy": true } : {})}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export default Button;
