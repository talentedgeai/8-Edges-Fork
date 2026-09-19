import { describe, expect, it } from "vitest";
import { clientTerm, clientTermLabel, parseTypedDate, todayInCompanyZone } from "./client-term";

describe("clientTerm", () => {
  const today = "2026-09-16";

  it("is unset with no dates", () => {
    expect(clientTerm(null, null, today)).toEqual({ state: "unset" });
  });

  it("is upcoming before the start date", () => {
    expect(clientTerm("2026-09-20", null, today)).toEqual({ state: "upcoming", daysUntilStart: 4 });
  });

  it("is active through the end date itself", () => {
    expect(clientTerm("2026-09-01", "2026-09-16", today)).toEqual({ state: "active", daysLeft: 0 });
    expect(clientTerm("2026-09-01", null, today)).toEqual({ state: "active", daysLeft: null });
    expect(clientTerm(null, "2027-09-15", today)).toEqual({ state: "active", daysLeft: 364 });
  });

  it("is ended after the end date", () => {
    expect(clientTerm("2025-01-01", "2026-09-15", today)).toEqual({ state: "ended", daysSinceEnd: 1 });
  });

  it("labels each state", () => {
    expect(clientTermLabel(clientTerm("2026-09-01", "2026-09-17", today))).toBe("Active, 1 day left");
    expect(clientTermLabel(clientTerm(null, null, today))).toBe("No dates set");
  });
});

describe("todayInCompanyZone", () => {
  it("rolls to the next day at 17:00 UTC", () => {
    expect(todayInCompanyZone(new Date("2026-09-16T16:59:00Z"))).toBe("2026-09-16");
    expect(todayInCompanyZone(new Date("2026-09-16T17:00:00Z"))).toBe("2026-09-17");
  });
});

describe("parseTypedDate", () => {
  it("reads the formats people type", () => {
    for (const t of ["16/9/2026", "16-09-2026", "16.9.2026", "2026-09-16", "16 Sep 2026", "16 September 2026", "Sep 16, 2026", " sep 16 2026 "]) {
      expect(parseTypedDate(t)).toBe("2026-09-16");
    }
  });

  it("treats an empty field as cleared", () => {
    expect(parseTypedDate("  ")).toBe("");
  });

  it("rejects what is not a real date", () => {
    for (const t of ["31/2/2026", "13/13/2026", "tomorrow", "16 Foo 2026", "2026-9"]) {
      expect(parseTypedDate(t)).toBeNull();
    }
  });
});
