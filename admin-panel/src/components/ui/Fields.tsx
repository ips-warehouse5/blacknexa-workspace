/**
 * Small form controls: search box, switch, text field.
 *
 * Grouped in one module because each is a thin wrapper over a native element —
 * separate files would be more ceremony than code. Anything that grows its own
 * behaviour (as `Select` did) moves out.
 */

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

// ── Search ──────────────────────────────────────────────────────────────────

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name. Defaults to the placeholder when one is given. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label,
  className = "",
  style,
}: SearchInputProps) {
  return (
    <div className={`search-wrap ${className}`.trim()} {...(style ? { style } : {})}>
      <input
        // type="search" gives the browser's native clear button and tells
        // assistive technology what kind of field this is.
        type="search"
        className="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Switch ──────────────────────────────────────────────────────────────────

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** Secondary line under the label. */
  hint?: ReactNode;
  disabled?: boolean;
}

/**
 * A labelled toggle.
 *
 * Built on a real checkbox rather than a styled div, so it is reachable by Tab,
 * toggles on Space, and reports its own checked state without extra ARIA.
 */
export function Switch({ checked, onChange, label, hint, disabled = false }: SwitchProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="switch-toggle-row">
      <div>
        <label className="switch-toggle-label" htmlFor={id}>
          {label}
        </label>
        {hint ? (
          <div className="switch-toggle-sub" id={hintId}>
            {hint}
          </div>
        ) : null}
      </div>

      <span className="switch-toggle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          {...(hint ? { "aria-describedby": hintId } : {})}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-slider" aria-hidden="true" />
      </span>
    </div>
  );
}

// ── Text field ──────────────────────────────────────────────────────────────

/**
 * `ComponentPropsWithRef` rather than `InputHTMLAttributes`, so that spreading
 * react-hook-form's `register()` — which returns a `ref` alongside the handlers
 * — type-checks. React 19 passes `ref` to function components as a plain prop,
 * so it reaches the input through the same spread as everything else.
 */
export interface TextFieldProps extends Omit<ComponentPropsWithRef<"input">, "id"> {
  label: string;
  /** Validation message. Its presence marks the field invalid. */
  error?: string | undefined;
  /** Explanatory text under the input. */
  hint?: string | undefined;
}

/**
 * A labelled input that reports its own errors.
 *
 * The message is tied to the input with aria-describedby and `aria-invalid`, so
 * a screen reader announces the problem when focus lands on the field rather
 * than leaving it as red text nobody hears.
 */
export function TextField({ label, error, hint, className = "", ...rest }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`${error ? "field-invalid" : ""} ${className}`.trim()}
        {...(error ? { "aria-invalid": true } : {})}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
        {...rest}
      />
      {hint ? (
        <div className="field-hint" id={hintId}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div className="field-error-msg" id={errorId} style={{ display: "block" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

// ── Password field ──────────────────────────────────────────────────────────

export interface PasswordFieldProps extends Omit<TextFieldProps, "type"> {
  /** Whether the value is currently shown in the clear. */
  revealed: boolean;
  onToggleReveal: () => void;
}

export function PasswordField({
  label,
  error,
  hint,
  revealed,
  onToggleReveal,
  className = "",
  ...rest
}: PasswordFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>

      <div className={`password-input-wrap${error ? " field-invalid" : ""}`}>
        <input
          id={id}
          type={revealed ? "text" : "password"}
          className={className}
          {...(error ? { "aria-invalid": true } : {})}
          {...(describedBy ? { "aria-describedby": describedBy } : {})}
          {...rest}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={onToggleReveal}
          // The label states the action, and aria-pressed carries the state —
          // between them a screen-reader user knows both without seeing the icon.
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
        >
          <Icon name={revealed ? "eyeOff" : "eye"} />
        </button>
      </div>

      {hint ? (
        <div className="field-hint" id={hintId}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div className="field-error-msg" id={errorId} style={{ display: "block" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
