export type LoginFormValidation = {
  email: string | null;
  password: string | null;
  /** Trimmed only for transport; the displayed input remains untouched. */
  emailForSubmission: string | null;
};

// Purposefully conservative: this rules out whitespace, a missing local part,
// multiple @ signs, and a missing dot in the domain without rejecting valid
// addresses the server should be allowed to accept.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  if (!EMAIL_PATTERN.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return !domain.startsWith(".") && !domain.endsWith(".") && !domain.includes("..");
}

export function validateLoginForm(email: string, password: string): LoginFormValidation {
  const emailForSubmission = email.trim();
  const emailError =
    emailForSubmission.length === 0
      ? "Please enter your email address."
      : !isValidEmail(emailForSubmission)
        ? "Please enter a valid email address."
        : null;

  return {
    email: emailError,
    password: password.length === 0 ? "Please enter your password." : null,
    emailForSubmission: emailError ? null : emailForSubmission,
  };
}

const LOGIN_ERROR_FALLBACK = "Unable to log in right now. Please try again.";

/** Keeps a safe server sentence, never a transport error or implementation detail. */
export function safeLoginErrorMessage(message: string): string {
  const trimmed = message.trim();
  const looksTechnical =
    /\n|\r|<[^>]+>|\b(?:error|exception|stack|trace|typeorm|sequelize|prisma|sql|axios)\b|\bat\s+\S+\.tsx?:\d+/i.test(
      trimmed,
    );

  return trimmed.length > 0 && trimmed.length <= 180 && !looksTechnical
    ? trimmed
    : LOGIN_ERROR_FALLBACK;
}
