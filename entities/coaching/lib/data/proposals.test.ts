import { describe, expect, it } from "vitest";
import { proposalOutcome } from "./proposals";

describe("proposalOutcome", () => {
  it("books the date at once when the profile has none", () => {
    expect(proposalOutcome({ hasNextDate: false })).toBe("confirmed");
  });
  it("waits for the coach when a date is already set", () => {
    expect(proposalOutcome({ hasNextDate: true })).toBe("proposed");
  });
});
