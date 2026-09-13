import { describe, expect, it } from "vitest";
import { isStale, startsWithinWindow, STALE_AFTER_MS } from "./schedule";

describe("startsWithinWindow", () => {
  it("drafts the day before the start date and on the day itself", () => {
    expect(startsWithinWindow("2026-09-16", "2026-09-15")).toBe(true);
    expect(startsWithinWindow("2026-09-16", "2026-09-16")).toBe(true);
  });
  it("leaves campaigns that start later, started earlier, or have no date", () => {
    expect(startsWithinWindow("2026-09-16", "2026-09-14")).toBe(false);
    expect(startsWithinWindow("2026-09-16", "2026-09-17")).toBe(false);
    expect(startsWithinWindow(null, "2026-09-15")).toBe(false);
  });
});

describe("isStale", () => {
  const now = Date.parse("2026-09-12T06:30:00Z");
  it("treats a run with no recorded step, or one older than the ceiling, as dropped", () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date(now - STALE_AFTER_MS - 1000).toISOString(), now)).toBe(true);
  });
  it("leaves a run whose last step is recent", () => {
    expect(isStale(new Date(now - 60_000).toISOString(), now)).toBe(false);
  });
});
