/**
 * Confirmation before a consequential action.
 *
 * Wraps `Modal` with the two-button shape the console uses everywhere: cancel,
 * and one primary action that is `danger` when the thing it does cannot easily
 * be undone. Keeping it as one component means the destructive styling is a
 * prop rather than something each call site remembers to apply.
 */

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ReactNode } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen. Worth being specific — this is the last stop. */
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /** In flight — disables both buttons and spins the confirm. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      description={description}
      // A dialog mid-request should not vanish on a stray backdrop click and
      // leave the operator unsure whether the action went through.
      dismissOnBackdrop={!busy}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export default ConfirmDialog;
