/**
 * Transient notifications.
 *
 * The prototype's toast markup and animation are carried over verbatim
 * (`styles/design/toast.css`); what is added here is the queue behind them.
 *
 * Toasts are announced to assistive technology through a live region. A
 * confirmation an operator cannot perceive is not a confirmation, and in a
 * console where the feedback for "user suspended" is a toast, that matters.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "danger" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastContextValue {
  /** Show a toast. Returns its id so it can be dismissed early. */
  toast: (title: string, body?: string, kind?: ToastKind) => number;
  success: (title: string, body?: string) => number;
  error: (title: string, body?: string) => number;
  warning: (title: string, body?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Matches the fade-out in the ported CSS. */
const VISIBLE_MS = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  /** Timers are tracked so unmounting cannot leave one firing into nothing. */
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (title: string, body?: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current,
        // `body` is spread conditionally rather than set to undefined, because
        // exactOptionalPropertyTypes distinguishes "absent" from "undefined".
        { id, kind, title, ...(body ? { body } : {}) },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), VISIBLE_MS),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, body) => toast(title, body, "success"),
      error: (title, body) => toast(title, body, "danger"),
      warning: (title, body) => toast(title, body, "warning"),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        `role="status"` with aria-live="polite" announces each toast once it is
        inserted, without interrupting whatever the operator is doing.
      */}
      <div id="toastStack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`bn-toast ${t.kind}`}>
            <div>
              <div className="bn-toast-title">{t.title}</div>
              {t.body ? <div className="bn-toast-body">{t.body}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside a ToastProvider.");
  return ctx;
}
