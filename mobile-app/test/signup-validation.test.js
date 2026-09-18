import { describe, expect, test } from "bun:test";
import { validateSignUpAccount, validateVerificationCode } from "@/lib/auth/signup-validation";

describe("validateSignUpAccount", () => {
  test("requires an email address", () => {
    expect(validateSignUpAccount("", "StrongPass1!", false, "Ada").email).toBe(
      "Please enter your email address.",
    );
  });

  test("normalizes a valid email only for submission", () => {
    expect(
      validateSignUpAccount("  member@example.com ", "StrongPass1!", true, "Ada"),
    ).toMatchObject({
      email: null,
      password: null,
      consent: null,
      emailForSubmission: "member@example.com",
    });
  });

  test("requires every existing password rule", () => {
    expect(
      validateSignUpAccount("member@example.com", "short", true, "Ada").password,
    ).toContain("at least 10 characters");
  });

  test("does not count spaces toward the password length rule", () => {
    expect(
      validateSignUpAccount("member@example.com", "         A1!", true, "Ada").password,
    ).toContain("at least 10 characters");
  });

  test("requires consent", () => {
    expect(
      validateSignUpAccount("member@example.com", "StrongPass1!", false, "Ada").consent,
    ).toBe("Please agree to the Terms of Service and Privacy Policy.");
  });

  test("requires a first name", () => {
    expect(validateSignUpAccount("member@example.com", "StrongPass1!", true).firstName).toBe(
      "Please enter your first name.",
    );
    expect(
      validateSignUpAccount("member@example.com", "StrongPass1!", true, "   ").firstName,
    ).toBe("Please enter your first name.");
  });

  test("rejects a first name over the server's 80-char bound", () => {
    const tooLong = "A".repeat(81);
    expect(
      validateSignUpAccount("member@example.com", "StrongPass1!", true, tooLong).firstName,
    ).toBe("That first name is too long.");
  });

  test("does not require a last name", () => {
    const result = validateSignUpAccount("member@example.com", "StrongPass1!", true, "Ada");
    expect(result.firstName).toBeNull();
    expect(result.lastNameForSubmission).toBe("");
  });

  test("trims names and bounds the last name for submission rather than rejecting it", () => {
    const tooLong = "B".repeat(90);
    const result = validateSignUpAccount(
      "member@example.com",
      "StrongPass1!",
      true,
      "  Ada  ",
      tooLong,
    );
    expect(result.firstName).toBeNull();
    expect(result.firstNameForSubmission).toBe("Ada");
    expect(result.lastNameForSubmission).toBe(tooLong.slice(0, 80));
    expect(result.lastNameForSubmission.length).toBe(80);
  });

  test("all fields valid together resolve every field for submission", () => {
    const result = validateSignUpAccount(
      "member@example.com",
      "StrongPass1!",
      true,
      "Ada",
      "Lovelace",
    );
    expect(result).toMatchObject({
      firstName: null,
      email: null,
      password: null,
      consent: null,
      emailForSubmission: "member@example.com",
      firstNameForSubmission: "Ada",
      lastNameForSubmission: "Lovelace",
    });
  });
});

describe("validateVerificationCode", () => {
  test("requires all six digits before verification", () => {
    expect(validateVerificationCode("12345")).toBe("Please enter the six-digit code.");
    expect(validateVerificationCode("123456")).toBeNull();
  });
});
