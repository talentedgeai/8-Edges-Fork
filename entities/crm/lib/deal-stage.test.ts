import { describe, expect, it } from "vitest";
import { forecastInputsError, type StageRow } from "./deal-stage";

// The forecast gate as a pure rule (RH-2). Proposal and every open stage after
// it need an amount and an expected close date; earlier stages and the two
// closed stages never do; what the same request writes counts as present.

const STAGES: StageRow[] = [
  { id: "new", name: "New", position: 0, is_won: false, is_lost: false },
  { id: "disc", name: "Discovery", position: 2, is_won: false, is_lost: false },
  { id: "prop", name: "Proposal", position: 3, is_won: false, is_lost: false },
  { id: "cs", name: "Contract Sent", position: 4, is_won: false, is_lost: false },
  { id: "won", name: "Won", position: 5, is_won: true, is_lost: false },
  { id: "lost", name: "Lost", position: 6, is_won: false, is_lost: true },
];
const EMPTY = { amount_cents: null, expected_close_date: null };
const FULL = { amount_cents: 500000, expected_close_date: "2026-10-01" };

describe("forecastInputsError", () => {
  it("lets a deal into Discovery with nothing filled", () => {
    expect(forecastInputsError(STAGES, "disc", EMPTY)).toBeNull();
  });

  it("refuses Proposal without both inputs and names what is missing", () => {
    expect(forecastInputsError(STAGES, "prop", EMPTY)).toBe(
      "Proposal needs an amount and an expected close date on the deal first, so the forecast can count it.",
    );
    expect(forecastInputsError(STAGES, "prop", { amount_cents: 100, expected_close_date: null })).toMatch(/needs an expected close date on/);
    expect(forecastInputsError(STAGES, "prop", { amount_cents: 0, expected_close_date: "2026-10-01" })).toMatch(/needs an amount on/);
  });

  it("applies the same gate to every open stage after Proposal", () => {
    expect(forecastInputsError(STAGES, "cs", EMPTY)).toMatch(/^Contract Sent needs/);
    expect(forecastInputsError(STAGES, "cs", FULL)).toBeNull();
  });

  it("never gates the closed stages: won carries its own amount rule, lost needs nothing", () => {
    expect(forecastInputsError(STAGES, "won", EMPTY)).toBeNull();
    expect(forecastInputsError(STAGES, "lost", EMPTY)).toBeNull();
  });

  it("counts what the same request is writing", () => {
    expect(forecastInputsError(STAGES, "prop", EMPTY, { amount_cents: 1000, expected_close_date: "2026-11-01" })).toBeNull();
    // An incoming null clears the field and is refused, even if the row had one.
    expect(forecastInputsError(STAGES, "prop", FULL, { expected_close_date: null })).toMatch(/expected close date/);
  });

  it("is inert on a pipeline without a Proposal stage or an unknown target", () => {
    const noGate = STAGES.filter((s) => s.name !== "Proposal");
    expect(forecastInputsError(noGate, "cs", EMPTY)).toBeNull();
    expect(forecastInputsError(STAGES, "nope", EMPTY)).toBeNull();
  });
});
