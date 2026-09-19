import { describe, expect, it } from "vitest";
import { goalMoment } from "./goal-moment";

describe("goalMoment", () => {
  it("celebrates a move with the share and what is left", () => {
    // Under the half line, so this is the plain move, not the milestone: the
    // K.41 line still reads the same wherever the halfway rule does not fire.
    const m = goalMoment({ before: 19, after: 79, target: 200, unit: "students" });
    expect(m.tone).toBe("up");
    expect(m.headline).toBe("19 → 79 students");
    expect(m.detail).toBe("40% of the way. 121 students to go.");
  });
  it("says Halfway only on the bump that crosses the line", () => {
    const crossing = goalMoment({ before: 90, after: 110, target: 200, unit: "students" });
    expect(crossing.tone).toBe("halfway");
    expect(crossing.headline).toBe("Halfway. 110 of 200 students.");
    expect(goalMoment({ before: 110, after: 130, target: 200, unit: "students" }).tone).toBe("up");
  });
  it("keeps landing ahead of halfway when one bump does both", () => {
    // A goal with no measure has no half to cross, and a bump that goes
    // straight past the target is a landing, not a halfway.
    expect(goalMoment({ before: 10, after: 40, target: null, unit: null }).tone).toBe("up");
    expect(goalMoment({ before: 10, after: 200, target: 200, unit: null }).tone).toBe("landed");
  });
  it("marks the goal landed at or past the target", () => {
    expect(goalMoment({ before: 190, after: 200, target: 200, unit: null }).tone).toBe("landed");
  });
  it("never scolds a drop and treats no change as a fact", () => {
    expect(goalMoment({ before: 30, after: 20, target: 100, unit: null }).detail).toMatch(/both ways/);
    expect(goalMoment({ before: 20, after: 20, target: 100, unit: null }).tone).toBe("flat");
  });
});
