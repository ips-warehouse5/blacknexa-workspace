/**
 * Shows the temporary password produced by a reset.
 *
 * The value exists in exactly one place — this dialog — because the server
 * stored only its hash. That makes closing the dialog destructive, so it says
 * so, offers a copy button, and does not close on a backdrop click.
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { StaffMember } from "@/features/admin-roles/staff.types";

export interface PasswordResetDialogProps {
  open: boolean;
  staff: StaffMember | null;
  temporaryPassword: string | null;
  onClose: () => void;
}

function PasswordResetView({
  open,
  staff,
  temporaryPassword,
  onClose,
}: PasswordResetDialogProps) {
  // Starts false on every open: the dialog is remounted per password by the
  // wrapper below, so there is nothing to reset.
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // The clipboard API needs a secure context and can be refused outright.
      // The password is on screen either way, so this is a convenience only.
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Temporary Password Issued"
      description={
        staff
          ? `${staff.name} must sign in with this password and choose a new one.`
          : undefined
      }
      dismissOnBackdrop={false}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="login-warn-alert" style={{ display: "block" }}>
        <strong>This is shown once.</strong> It is not stored anywhere and cannot be retrieved
        after you close this dialog.
      </div>

      <div className="temp-password-row">
        <code className="temp-password-value">{temporaryPassword}</code>
        <Button variant="outline" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/* Announced politely so a screen-reader user gets the confirmation the
          button's label change conveys visually. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Password copied to the clipboard." : ""}
      </span>
    </Modal>
  );
}

/** Remounts per generated password, so "Copied" never carries over. */
export function PasswordResetDialog(props: PasswordResetDialogProps) {
  return <PasswordResetView key={props.temporaryPassword ?? "none"} {...props} />;
}

export default PasswordResetDialog;
