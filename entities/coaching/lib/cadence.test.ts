import { describe, expect, it } from "vitest";
import { rollForward } from "./cadence";

describe("rollForward", () => {
  it("keeps a future or same-day date", () => {
    expect(rollForward("2026-09-10", "2026-08-27", 14, "2026-09-09")).toBe("2026-09-10");
    expect(rollForward("2026-09-09", null, 14, "2026-09-09")).toBe("2026-09-09");
  });
  it("steps a stale date forward by the cadence, keeping the weekday", () => {
    expect(rollForward("2026-08-26", "2026-08-26", 14, "2026-09-09")).toBe("2026-09-09");
    expect(rollForward("2026-08-19", "2026-08-19", 14, "2026-09-09")).toBe("2026-09-16");
    expect(rollForward("2026-08-26", null, 14, "2026-09-10")).toBe("2026-09-23");
  });
  it("anchors on the last held 1-1 when no next date is set", () => {
    expect(rollForward(null, "2026-08-26", 14, "2026-09-09")).toBe("2026-09-09");
  });
  it("prefers the newer of the two anchors", () => {
    expect(rollForward("2026-08-12", "2026-08-26", 14, "2026-09-09")).toBe("2026-09-09");
  });
  it("waits when the profile has never had a 1-1", () => {
    expect(rollForward(null, null, 14, "2026-09-09")).toBeNull();
  });
  it("falls back to fourteen days on a bad cadence", () => {
    expect(rollForward("2026-09-01", null, 0, "2026-09-09")).toBe("2026-09-15");
  });
});
