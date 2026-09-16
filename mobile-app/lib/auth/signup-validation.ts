export type SignUpAccountValidation = {
  email: string | null;
  password: string | null;
  consent: string | null;
  /** Trimmed only for the API request; passwords are never rewritten. */
  emailForSubmission: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(email: string): boolean {
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

export function validateSignUpAccount(
  email: string,
  password: string,
  agreedToTerms: boolean,
): SignUpAccountValidation {
  const emailForSubmission = email.trim();
  const emailError =
    emailForSubmission.length === 0
      ? "Please enter your email address."
      : validEmail(emailForSubmission)
        ? null
        : "Please enter a valid email address.";
  const missing = missingPasswordRules(password);

  return {
    email: emailError,
    password: missing.length > 0 ? `Still needed: ${missing.join(", ").toLowerCase()}.` : null,
    consent: agreedToTerms ? null : "Please agree to the Terms of Service and Privacy Policy.",
    emailForSubmission: emailError ? null : emailForSubmission,
  };
}

export function validateVerificationCode(code: string): string | null {
  return /^\d{6}$/.test(code) ? null : "Please enter the six-digit code.";
}
