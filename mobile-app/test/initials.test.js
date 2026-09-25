import { describe, expect, test } from "bun:test";
import { initialsFromName } from "@/lib/ui/initials";

describe("initialsFromName", () => {
  test("two words take the first letter of each", () => {
    expect(initialsFromName("Gigii Gi")).toBe("GG");
    expect(initialsFromName("Viraj Patel")).toBe("VP");
  });

  test("three or more words take the first and last word", () => {
    expect(initialsFromName("Mary Ann Smith")).toBe("MS");
  });

  test("one word takes its first and last letter", () => {
    expect(initialsFromName("Viraj")).toBe("VJ");
    expect(initialsFromName("gigii")).toBe("GI");
  });

  test("a single letter stays a single letter", () => {
    expect(initialsFromName("V")).toBe("V");
  });

  test("surrounding and repeated spaces are ignored", () => {
    expect(initialsFromName("  Viraj   Patel  ")).toBe("VP");
  });

  test("an empty name gives null so the caller can fall back to the email", () => {
    expect(initialsFromName("")).toBeNull();
    expect(initialsFromName("   ")).toBeNull();
  });

  test("letters outside the basic alphabet are kept whole", () => {
    expect(initialsFromName("Émile Zoë")).toBe("ÉZ");
  });
});
