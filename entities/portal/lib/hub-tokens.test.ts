// The client's Delivered figure counts only repos linked to a LIVE AI Program.
// This is the case that produced the wrong number on 2026-09-07: 10.24 h on a
// repo whose program had been archived still reached APA's total, while no card
// on the hub showed it, so the strip and the cards could never add up.
import { describe, expect, it } from "vitest";
import { computeTokenUsage, withLiveProgramsOnly } from "./hub-tokens";

const balance = { balanceTokens: 74, pendingTokens: 0, purchases: [] };

describe("client delivered hours", () => {
  const repos = [
    { id: "iq", name: "Payroll IQ", ai_program_id: "p-iq", live_url: null, last_synced_at: null },
    { id: "consulting", name: "Payroll Consulting", ai_program_id: "p-consulting", live_url: null, last_synced_at: null },
    { id: "orphan", name: "Unlinked", ai_program_id: null, live_url: null, last_synced_at: null },
  ];
  const hourRows = [
    { repo_id: "iq", hours: 47.57, measured_hours: 40 },
    { repo_id: "consulting", hours: 10.24, measured_hours: 9 },
    { repo_id: "orphan", hours: 3, measured_hours: 3 },
    { repo_id: null, hours: 2, measured_hours: 2 },
  ];

  it("an archived program's repo is treated as unlinked", () => {
    const live = new Set(["p-iq"]);
    expect(withLiveProgramsOnly(repos, live).map((r) => r.ai_program_id)).toEqual(["p-iq", null, null]);
  });

  it("only live-program repos reach Delivered, Balance and the program list", () => {
    const usage = computeTokenUsage({
      balance,
      allocatedTokens: 0,
      plannedTokens: 0,
      delivery: { repos: withLiveProgramsOnly(repos, new Set(["p-iq"])), hourRows, aiRows: [] },
    });
    expect(usage.deliveredHours).toBeCloseTo(47.57, 2);
    expect(usage.balanceTokens).toBeCloseTo(74 - 47.57, 2);
    expect(usage.programs.map((p) => p.repoId)).toEqual(["iq"]);
  });

  it("a live program's repo counts in full, so the total equals the cards", () => {
    const usage = computeTokenUsage({
      balance,
      allocatedTokens: 0,
      plannedTokens: 0,
      delivery: { repos: withLiveProgramsOnly(repos, new Set(["p-iq", "p-consulting"])), hourRows, aiRows: [] },
    });
    expect(usage.deliveredHours).toBeCloseTo(47.57 + 10.24, 2);
    expect(usage.programs.reduce((s, p) => s + p.deliveredHours, 0)).toBeCloseTo(usage.deliveredHours, 5);
  });
});
