import { describe, expect, test } from "bun:test";
import {
  safeResetErrorMessage,
  validateResetConfirmation,
  validateResetRequest,
} from "@/lib/auth/reset-validation";

describe("validateResetRequest", () => {
  test("requires an email address", () => {
    expect(validateResetRequest("")).toEqual({
      email: "Please enter your email address.",
      emailForSubmission: null,
    });
  });

  test("trims a valid email only for submission", () => {
    expect(validateResetRequest("  member@example.com  ")).toEqual({
      email: null,
      emailForSubmission: "member@example.com",
    });
  });

  test("rejects malformed email addresses", () => {
    expect(validateResetRequest("member@example..com").email).toBe(
      "Please enter a valid email address.",
    );
  });
});

describe("validateResetConfirmation", () => {
  test("requires the complete six-digit code", () => {
    expect(validateResetConfirmation("12345", "StrongPass1!").code).toBe(
      "Please enter the six-digit code.",
    );
  });

  test("requires the existing password rules", () => {
    expect(validateResetConfirmation("123456", "short").password).toContain(
      "at least 10 characters",
    );
  });

  test("accepts a complete code and valid new password", () => {
    expect(validateResetConfirmation("123456", "StrongPass1!")).toEqual({
      code: null,
      password: null,
    });
  });
});

describe("safeResetErrorMessage", () => {
  test("keeps a brief user-facing reset failure", () => {
    expect(safeResetErrorMessage("That code has expired. Request a new one.")).toBe(
      "That code has expired. Request a new one.",
    );
  });

  test("replaces technical error details", () => {
    expect(safeResetErrorMessage("TypeError: Network request failed\n at reset.tsx:42")).toBe(
      "We couldn't reset your password right now. Please try again.",
    );
  });
});
