/**
 * Form schemas for the auth screens.
 *
 * These validate *shape*, not policy. The sign-in form checks that an email
 * looks like one and that a password was typed — it deliberately does not check
 * complexity, because telling someone their existing password fails a rule they
 * have never seen is both unhelpful and a hint to an attacker about what the
 * rules are. Complexity is enforced where a password is *set*.
 */

import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter your password."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .email("Please enter a valid email address."),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/**
 * The policy applied when a password is chosen.
 *
 * Length carries most of the strength, so the floor is 12 rather than 8. The
 * character-class rules are kept because the API enforces the same three, and a
 * form that accepts what the server will reject is worse than a strict one.
 */
export const passwordPolicy = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(200, "That password is too long.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/\d/, "Include a number.");

export const resetPasswordSchema = z
  .object({
    code: z.string().trim().min(1, "Enter the code from your email."),
    password: passwordPolicy,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Both passwords must match.",
    // Attach the message to the field the operator needs to fix.
    path: ["confirmPassword"],
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/** Rules shown as a live checklist while a new password is typed. */
export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A number", test: (v) => /\d/.test(v) },
];

/**
 * A coarse 0–4 strength score for the meter.
 *
 * Counts satisfied rules and adds a point for real length. This is a hint about
 * effort, not a measure of entropy — it is not treated as one anywhere.
 */
export function passwordStrength(value: string): number {
  if (!value) return 0;
  const met = PASSWORD_RULES.filter((rule) => rule.test(value)).length;
  return Math.min(4, met + (value.length >= 16 ? 1 : 0));
}
