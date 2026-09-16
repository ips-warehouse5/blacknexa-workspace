import { expect, test } from "bun:test";
import { COMING_SOON_LABEL } from "@/lib/ui/coming-soon";

test("uses the agreed temporary tab-state label", () => {
  expect(COMING_SOON_LABEL).toBe("Coming Soon");
});
