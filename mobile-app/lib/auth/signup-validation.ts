export type SignUpAccountValidation = {
  /**
   * First name is required, last name is not.
   *
   * Mononymous people exist in every region this app serves, and blocking a
   * sign-up over a missing surname would be a validation rule that rejects real
   * users to satisfy a form's sense of symmetry. The server takes the same view.
   */
  firstName: string | null;
  email: string | null;
  password: string | null;
  consent: string | null;
  /** Trimmed only for the API request; passwords are never rewritten. */
  emailForSubmission: string | null;
  firstNameForSubmission: string | null;
  lastNameForSubmission: string;
};

/** Matches the server's `FIRST_NAME` / `LAST_NAME` bounds. */
const NAME_MAX = 80;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(email: string): boolean {
  if (!EMAIL_PATTERN.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return !domain.startsWith(".") && !domain.endsWith(".") && !domain.includes("..");
}

function missingPasswordRules(password: string): string[] {
  const nonWhitespaceLength = password.replace(/\s/g, "").length;
  return [
    nonWhitespaceLength >= 10 ? null : "At least 10 characters",
    /[A-Z]/.test(password) ? null : "One capital letter",
    /\d/.test(password) ? null : "One number",
    // Excludes whitespace: a space is not a symbol, and padding a password
    // with spaces should not satisfy this rule.
    /[^A-Za-z0-9\s]/.test(password) ? null : "One symbol",
  ].filter((rule): rule is string => Boolean(rule));
}

export function validateSignUpAccount(
  email: string,
  password: string,
  agreedToTerms: boolean,
  firstName = "",
  lastName = "",
): SignUpAccountValidation {
  const firstForSubmission = firstName.trim();
  const lastForSubmission = lastName.trim();
  const firstNameError =
    firstForSubmission.length === 0
      ? "Please enter your first name."
      : firstForSubmission.length > NAME_MAX
        ? "That first name is too long."
        : null;
  const emailForSubmission = email.trim();
  const emailError =
    emailForSubmission.length === 0
      ? "Please enter your email address."
      : validEmail(emailForSubmission)
        ? null
        : "Please enter a valid email address.";
  const missing = missingPasswordRules(password);
  const passwordError =
    password.length === 0
      ? "Please enter your password."
      : missing.length > 0
        ? `Still needed: ${missing.join(", ").toLowerCase()}.`
        : null;

  return {
    firstName: firstNameError,
    email: emailError,
    password: passwordError,
    consent: agreedToTerms ? null : "Please agree to the Terms of Service and Privacy Policy.",
    emailForSubmission: emailError ? null : emailForSubmission,
    firstNameForSubmission: firstNameError ? null : firstForSubmission,
    // Bounded rather than rejected: a pasted-in surname over the limit is not
    // worth blocking a sign-up for, and the server stores the same 80 chars.
    lastNameForSubmission: lastForSubmission.slice(0, NAME_MAX),
  };
}

export function validateVerificationCode(code: string): string | null {
  return /^\d{6}$/.test(code) ? null : "Please enter the six-digit code.";
}
