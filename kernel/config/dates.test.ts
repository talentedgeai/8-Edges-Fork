import { describe, expect, it } from "vitest";
import { addDays, diffDays, saigonToday } from "./dates";

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-09-02", 5)).toBe("2026-09-07");
  });
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("crosses a year boundary and handles leap days", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("diffDays", () => {
  it("counts whole days in either direction", () => {
    expect(diffDays("2026-01-31", "2026-02-02")).toBe(2);
    expect(diffDays("2026-02-02", "2026-01-31")).toBe(-2);
  });
});

describe("saigonToday", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(saigonToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
