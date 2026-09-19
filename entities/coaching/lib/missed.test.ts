import { describe, expect, it } from "vitest";
import { MISSED_GRACE_DAYS, missedLine, missedState } from "./missed";

describe("missedState", () => {
  it("leaves a booking on today or later alone", () => {
    expect(missedState({ heldOn: "2026-09-20", status: "scheduled", todayISO: "2026-09-17" })).toBe("upcoming");
    expect(missedState({ heldOn: "2026-09-17", status: "scheduled", todayISO: "2026-09-17" })).toBe("upcoming");
  });

  it("calls the day after the date a miss", () => {
    expect(missedState({ heldOn: "2026-09-16", status: "scheduled", todayISO: "2026-09-17" })).toBe("missed");
  });

  it("keeps the grace window open for three days", () => {
    expect(missedState({ heldOn: "2026-09-16", status: "scheduled", todayISO: "2026-09-19" })).toBe("missed");
  });

  it("closes the grace window on the fourth day", () => {
    expect(missedState({ heldOn: "2026-09-16", status: "scheduled", todayISO: "2026-09-20" })).toBe("grace-over");
    expect(MISSED_GRACE_DAYS).toBe(3);
  });

  // A held 1-1 happened and a skipped one was deliberately let go; neither is
  // waiting on an answer, however long ago the date was.
  it("never asks about a 1-1 that is no longer a booking", () => {
    expect(missedState({ heldOn: "2026-08-01", status: "held", todayISO: "2026-09-17" })).toBe("upcoming");
    expect(missedState({ heldOn: "2026-08-01", status: "skipped", todayISO: "2026-09-17" })).toBe("upcoming");
  });
});

describe("missedLine", () => {
  it("names the day and states the fact, with no count in it", () => {
    expect(missedLine("2026-09-16", (iso) => iso)).toBe("1-1 on 2026-09-16 did not happen");
  });
});
