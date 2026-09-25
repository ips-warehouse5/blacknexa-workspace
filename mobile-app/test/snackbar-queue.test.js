import { describe, expect, test } from "bun:test";
import { isDuplicateSnackbar } from "@/lib/ui/snackbar-queue";

const failed = { message: "Incorrect email or password.", type: "error" };

describe("isDuplicateSnackbar", () => {
  test("a message with nothing showing or queued is new", () => {
    expect(isDuplicateSnackbar(failed, [], null)).toBe(false);
  });

  test("the same message while it is on screen is a duplicate", () => {
    expect(isDuplicateSnackbar(failed, [], { id: 1, duration: 2800, ...failed })).toBe(true);
  });

  test("the same message while it waits in the queue is a duplicate", () => {
    const shown = { id: 1, duration: 2800, message: "Saved.", type: "success" };
    const queued = [{ id: 2, duration: 2800, ...failed }];
    expect(isDuplicateSnackbar(failed, queued, shown)).toBe(true);
  });

  test("the same text with a different type is not a duplicate", () => {
    expect(
      isDuplicateSnackbar({ ...failed, type: "warning" }, [], { id: 1, duration: 2800, ...failed }),
    ).toBe(false);
  });

  test("a different message is not a duplicate", () => {
    expect(
      isDuplicateSnackbar({ message: "Saved.", type: "success" }, [{ id: 1, duration: 2800, ...failed }], null),
    ).toBe(false);
  });

  test("the same message after the first has gone shows again, as a retry would", () => {
    expect(isDuplicateSnackbar(failed, [], null)).toBe(false);
  });
});
