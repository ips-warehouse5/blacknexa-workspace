import { describe, expect, test } from "bun:test";
import { validateSignUpAccount, validateVerificationCode } from "@/lib/auth/signup-validation";

describe("validateSignUpAccount", () => {
  test("requires an email address", () => {
    expect(validateSignUpAccount("", "StrongPass1!", false).email).toBe(
      "Please enter your email address.",
    );
  });

  test("normalizes a valid email only for submission", () => {
    expect(validateSignUpAccount("  member@example.com ", "StrongPass1!", true)).toMatchObject({
      email: null,
      password: null,
      consent: null,
      emailForSubmission: "member@example.com",
    });
  });

  test("requires every existing password rule", () => {
    expect(validateSignUpAccount("member@example.com", "short", true).password).toContain(
      "at least 10 characters",
    );
  });

  test("requires consent", () => {
    expect(validateSignUpAccount("member@example.com", "StrongPass1!", false).consent).toBe(
      "Please agree to the Terms of Service and Privacy Policy.",
    );
  });
});

describe("validateVerificationCode", () => {
  test("requires all six digits before verification", () => {
    expect(validateVerificationCode("12345")).toBe("Please enter the six-digit code.");
    expect(validateVerificationCode("123456")).toBeNull();
  });
});
