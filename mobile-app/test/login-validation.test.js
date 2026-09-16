import { describe, expect, test } from "bun:test";
import { safeLoginErrorMessage, validateLoginForm } from "@/lib/auth/login-validation";

describe("validateLoginForm", () => {
  test("requires an email address", () => {
    expect(validateLoginForm("", "password")).toEqual({
      email: "Please enter your email address.",
      password: null,
      emailForSubmission: null,
    });
  });

  test("trims surrounding email whitespace before validating and submitting", () => {
    expect(validateLoginForm("  member@example.com  ", "password")).toEqual({
      email: null,
      password: null,
      emailForSubmission: "member@example.com",
    });
  });

  test("rejects malformed email addresses", () => {
    expect(validateLoginForm("member@example", "password").email).toBe(
      "Please enter a valid email address.",
    );
    expect(validateLoginForm("member@@example.com", "password").email).toBe(
      "Please enter a valid email address.",
    );
    expect(validateLoginForm("member@example..com", "password").email).toBe(
      "Please enter a valid email address.",
    );
    expect(validateLoginForm("member@.example.com", "password").email).toBe(
      "Please enter a valid email address.",
    );
  });

  test("requires a password without mutating it", () => {
    expect(validateLoginForm("member@example.com", "")).toEqual({
      email: null,
      password: "Please enter your password.",
      emailForSubmission: "member@example.com",
    });
  });
});

describe("safeLoginErrorMessage", () => {
  test("keeps a short user-facing authentication message", () => {
    expect(safeLoginErrorMessage("That email and password don’t match.")).toBe(
      "That email and password don’t match.",
    );
  });

  test("replaces technical API details with a safe fallback", () => {
    expect(safeLoginErrorMessage("TypeError: Network request failed\n at login.tsx:42")).toBe(
      "Unable to log in right now. Please try again.",
    );
  });
});
