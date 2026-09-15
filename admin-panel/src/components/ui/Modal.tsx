/**
 * The modal dialog.
 *
 * The prototype's modal was a styled div — fine for a click-through, not enough
 * to ship. This one adds what a dialog owes a keyboard or screen-reader user:
 * focus moves in on open and returns to the trigger on close, Tab is trapped
 * inside, Escape dismisses, the rest of the page is hidden from assistive
 * technology, and the title names the dialog.
 *
 * Rendered through a portal so that a modal opened from inside a transformed or
 * overflow-hidden container is not clipped by it.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Supporting line under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons for the footer. Rendered inside `.modal-actions`. */
  footer?: ReactNode;
  /** Use the wider variant from the design. */
  wide?: boolean;
  /**
   * Whether clicking the backdrop closes the dialog. Off for dialogs that
   * would lose typed input — a stray click should not discard a form.
   */
  dismissOnBackdrop?: boolean;
}

/** Everything focusable, in DOM order, for the tab trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
  dismissOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** The element that had focus before the dialog opened. */
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Remember where focus came from, and put it back on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    return () => restoreFocusTo.current?.focus?.();
  }, [open]);

  // Move focus into the dialog once it is on screen.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, [open]);

  /**
   * Stop the page behind from scrolling.
   *
   * The scrollbar's width is replaced as padding, otherwise removing it shifts
   * the whole layout sideways the moment a dialog opens.
   */
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        // offsetParent is null for anything display:none, which would
        // otherwise become an invisible stop in the tab order.
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      // Wrap at both ends so Tab can never escape into the page behind.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="modal-wrap"
      style={{ display: "flex" }}
      onPointerDown={(event) => {
        // Only a press that starts on the backdrop itself dismisses — a drag
        // that began inside the panel and released outside should not.
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description ? { "aria-describedby": descId } : {})}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h3 id={titleId}>{title}</h3>
        {description ? <p id={descId}>{description}</p> : null}
        {children}
        {footer ? <div className="modal-actions">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
