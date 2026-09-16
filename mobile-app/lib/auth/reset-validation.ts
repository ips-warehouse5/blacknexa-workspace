export type ResetRequestValidation = {
  email: string | null;
  emailForSubmission: string | null;
};

export type ResetConfirmationValidation = {
  code: string | null;
  password: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_ERROR_FALLBACK = "We couldn't reset your password right now. Please try again.";

function isValidEmail(email: string): boolean {
  if (!EMAIL_PATTERN.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return !domain.startsWith(".") && !domain.endsWith(".") && !domain.includes("..");
}

function missingPasswordRules(password: string): string[] {
  return [
    password.length >= 10 ? null : "At least 10 characters",
    /[A-Z]/.test(password) ? null : "One capital letter",
    /\d/.test(password) ? null : "One number",
    /[^A-Za-z0-9]/.test(password) ? null : "One symbol",
  ].filter((rule): rule is string => Boolean(rule));
}

export function validateResetRequest(email: string): ResetRequestValidation {
  const emailForSubmission = email.trim();
  const emailError =
    emailForSubmission.length === 0
      ? "Please enter your email address."
      : isValidEmail(emailForSubmission)
        ? null
        : "Please enter a valid email address.";

  return { email: emailError, emailForSubmission: emailError ? null : emailForSubmission };
}

export function validateResetConfirmation(
  code: string,
  password: string,
): ResetConfirmationValidation {
  const missing = missingPasswordRules(password);
  return {
    code: /^\d{6}$/.test(code) ? null : "Please enter the six-digit code.",
    password: missing.length > 0 ? `Still needed: ${missing.join(", ").toLowerCase()}.` : null,
  };
}

/** Keeps an API response user-facing and avoids exposing transport details. */
export function safeResetErrorMessage(message: string): string {
  const trimmed = message.trim();
  const looksTechnical =
    /\n|\r|<[^>]+>|\b(?:error|exception|stack|trace|typeorm|sequelize|prisma|sql|axios)\b|\bat\s+\S+\.tsx?:\d+/i.test(
      trimmed,
    );

  return trimmed.length > 0 && trimmed.length <= 180 && !looksTechnical
    ? trimmed
    : RESET_ERROR_FALLBACK;
}
