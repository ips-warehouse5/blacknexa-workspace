/**
 * The console's dropdown.
 *
 * The prototype replaced the native <select> with a popover because a native
 * one cannot be styled to match the design. That trade is only worth making if
 * the replacement keeps what the native control gave away for free, so this one
 * implements the listbox keyboard contract: arrows move, Home/End jump, typing
 * seeks, Enter commits, Escape and blur close, and the active option is wired
 * to the trigger through aria-activedescendant.
 *
 * Visuals come from `styles/design/forms.css` unchanged.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "@/components/ui/Icon";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional muted second line inside the option row. */
  hint?: string;
}

export interface SelectProps<T extends string = string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name. Required — a dropdown with no name is unusable by ear. */
  label: string;
  /** Show the label above the control rather than only to screen readers. */
  showLabel?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Minimum trigger width, matching the prototype's per-filter sizing. */
  minWidth?: number | string;
  id?: string;
}

/** How much room the menu needs below the trigger before it flips upward. */
const MENU_CLEARANCE = 220;

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  label,
  showLabel = false,
  placeholder = "Select…",
  disabled = false,
  className = "",
  minWidth,
  id,
}: SelectProps<T>) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listboxId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  /** Keyboard cursor. Separate from `value`: moving the cursor is not choosing. */
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Buffer for type-ahead, cleared after a pause in typing. */
  const typeahead = useRef({ query: "", at: 0 });

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  /**
   * Open, deciding direction from the room actually available.
   *
   * Measured at open time rather than on a resize listener: the trigger can move
   * for reasons a resize never fires for — a filter bar wrapping, a modal
   * scrolling — and the only moment the answer has to be right is this one.
   */
  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const modal = trigger.closest(".modal");
    const spaceInModal = modal ? modal.getBoundingClientRect().bottom - rect.bottom : Infinity;

    setDropUp(
      (spaceBelow < MENU_CLEARANCE || spaceInModal < MENU_CLEARANCE) && rect.top > MENU_CLEARANCE,
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      onChange(option.value);
      close();
    },
    [options, onChange, close],
  );

  // Close when focus or a click leaves the control.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };
    // Capture phase: a click that also unmounts the trigger would otherwise
    // never bubble back to this listener.
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  // Keep the cursored option in view while arrowing through a long list.
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  /** Jump to the next option whose label starts with what has been typed. */
  const seek = useCallback(
    (char: string) => {
      const now = Date.now();
      const buffer = now - typeahead.current.at > 600 ? char : typeahead.current.query + char;
      typeahead.current = { query: buffer, at: now };

      const from = activeIndex >= 0 ? activeIndex : 0;
      // Start one past the cursor so repeating a letter cycles through matches.
      for (let step = 1; step <= options.length; step++) {
        const index = (from + step) % options.length;
        if (options[index]?.label.toLowerCase().startsWith(buffer.toLowerCase())) {
          setActiveIndex(index);
          return;
        }
      }
    },
    [activeIndex, options],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        }
        return;

      case "Tab":
        // Tabbing away commits nothing and closes — the standard behaviour.
        if (open) close(false);
        return;

      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) openMenu();
        else if (activeIndex >= 0) commit(activeIndex);
        return;

      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          openMenu();
          return;
        }
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => {
          const next = current + delta;
          if (next < 0) return options.length - 1;
          if (next >= options.length) return 0;
          return next;
        });
        return;
      }

      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        return;

      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        return;

      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (!open) openMenu();
          seek(event.key);
        }
    }
  };

  const wrapClass = [
    "custom-select-wrap",
    open ? "open" : "",
    dropUp ? "dropup" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={wrapRef}
      className={wrapClass}
      {...(minWidth ? { style: { minWidth } } : {})}
    >
      {showLabel ? (
        <label htmlFor={baseId} className="custom-select-outer-label">
          {label}
        </label>
      ) : null}

      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        className={`custom-select-trigger${open ? " active" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        // Names the control when no visible label is rendered.
        {...(showLabel ? {} : { "aria-label": label })}
        {...(open && activeIndex >= 0
          ? { "aria-activedescendant": `${baseId}-opt-${activeIndex}` }
          : {})}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="custom-select-label">{selected?.label ?? placeholder}</span>
        <Icon name="chevronDown" />
      </button>

      <div ref={menuRef} className="custom-select-menu" role="listbox" id={listboxId} aria-label={label}>
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${baseId}-opt-${index}`}
            data-index={index}
            role="option"
            aria-selected={option.value === value}
            className={[
              "custom-select-option",
              option.value === value ? "selected" : "",
              index === activeIndex ? "cursor" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            // pointerdown, not click: the outside-click listener runs on
            // pointerdown too, and would close the menu before a click landed.
            onPointerDown={(event) => {
              event.preventDefault();
              commit(index);
            }}
            onPointerEnter={() => setActiveIndex(index)}
          >
            {option.label}
            {option.hint ? <span className="custom-select-option-hint">{option.hint}</span> : null}
          </div>
        ))}

        {options.length === 0 ? (
          <div className="custom-select-option" aria-disabled="true">
            No options
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Select;
