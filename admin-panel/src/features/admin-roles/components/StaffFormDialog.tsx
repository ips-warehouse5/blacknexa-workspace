/**
 * Create and edit an operator account.
 *
 * One dialog for both because the fields are nearly the same and keeping them
 * together means the validation cannot drift. The one real difference is the
 * password: it is set on create and never edited here — changing someone else's
 * password is the reset action, which issues a new temporary one rather than
 * letting an administrator choose a password on another person's behalf.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { PasswordField, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { passwordPolicy } from "@/features/auth/auth.schemas";
import { ROLE_LIST } from "@/lib/rbac";
import type { StaffMember } from "@/features/admin-roles/staff.types";
import { ROLE_KEYS, type RoleKey } from "@/types/rbac";

/**
 * Role choices, with the remit spelled out so the picker is self-explaining.
 *
 * Super Admin is deliberately absent, and the API refuses it too. Super Admin
 * accounts are "Protected" — they cannot be edited, disabled or deleted from
 * this screen — so allowing one to be created here would mint an account nobody
 * could subsequently remove, a mistyped address included. Additional Super
 * Admins are provisioned out of band via `ADMIN_BOOTSTRAP_*`.
 *
 * Offering the option and then failing the request was the earlier behaviour;
 * the two ends now agree, and the form says why.
 */
const ROLE_OPTIONS = ROLE_LIST.filter((role) => role.key !== "superadmin").map((role) => ({
  value: role.key,
  label: `${role.label} (${role.tagline})`,
}));

const baseFields = {
  name: z.string().trim().min(2, "Enter the person's full name.").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address.")
    .email("Enter a valid email address."),
  role: z.enum(ROLE_KEYS),
};

const createSchema = z.object({ ...baseFields, password: passwordPolicy });
const editSchema = z.object(baseFields);

type CreateValues = z.infer<typeof createSchema>;

export interface StaffFormDialogProps {
  open: boolean;
  /** The account being edited, or null to create a new one. */
  staff: StaffMember | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; email: string; role: RoleKey; password?: string }) => void;
}

function StaffForm({ open, staff, busy, onClose, onSubmit }: StaffFormDialogProps) {
  const editing = staff !== null;
  const [revealPassword, setRevealPassword] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateValues>({
    // The create schema types the form; the edit path validates with the
    // narrower one so an absent password is not reported as a failure.
    resolver: zodResolver(editing ? editSchema : createSchema) as never,
    // Correct from the first render because the dialog is remounted per record
    // — see the wrapper below.
    defaultValues: {
      name: staff?.name ?? "",
      email: staff?.email ?? "",
      role: staff?.role ?? "moderator",
      password: "",
    },
  });

  const submit = handleSubmit((values) => {
    onSubmit({
      name: values.name,
      email: values.email,
      role: values.role,
      ...(editing ? {} : { password: values.password }),
    });
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Administrator / Staff Member" : "Add Administrator / Staff Member"}
      description={
        editing
          ? `Update the assigned role and details for ${staff.email}.`
          : "Create a new operator account and assign its role."
      }
      // Typed input should not be thrown away by a stray click on the backdrop.
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {editing ? "Save Changes" : "Create Account"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="Full Name"
          placeholder="e.g. Marcus Wright"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />

        <TextField
          label="Email Address"
          type="email"
          placeholder="e.g. m.wright@blacknexa.com"
          autoComplete="email"
          // The email is the account's identity server-side; changing it would
          // be a different operation from editing a profile.
          disabled={editing}
          {...(editing ? { hint: "The sign-in address cannot be changed." } : {})}
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="login-field">
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <Select
                label="Assigned Role"
                showLabel
                value={field.value}
                options={ROLE_OPTIONS}
                onChange={field.onChange}
              />
            )}
          />
          {errors.role ? (
            <div className="field-error-msg" style={{ display: "block" }}>
              {errors.role.message}
            </div>
          ) : (
            <div className="field-hint">
              Super Admin cannot be assigned here. Those accounts are protected once
              created, so they are provisioned by the platform team.
            </div>
          )}
        </div>

        {editing ? null : (
          <PasswordField
            label="Initial Temporary Password"
            placeholder="••••••••"
            autoComplete="new-password"
            hint="They will be asked to change this the first time they sign in."
            revealed={revealPassword}
            onToggleReveal={() => setRevealPassword((v) => !v)}
            error={errors.password?.message}
            {...register("password")}
          />
        )}

        {/* Lets Enter submit the form even though the buttons live in the
            modal footer, outside this <form>. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

/**
 * Remounts the form for each record it is opened on.
 *
 * Editing one account and then another must not show the first one's values,
 * and a create dialog opened after an edit must start empty. Keying on the
 * record gives that for free; re-seeding the form in an effect gave it one
 * render late.
 */
export function StaffFormDialog(props: StaffFormDialogProps) {
  return <StaffForm key={props.staff?.id ?? "new"} {...props} />;
}

export default StaffFormDialog;
