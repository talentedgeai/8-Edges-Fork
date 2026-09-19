import { describe, expect, it } from "vitest";
import { describeDay, nearestWeekday, nextWeekdayOnOrAfter, rollForward, shortTime, validateProposedDate } from "./cadence";

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

  it("moves a rolled Saturday to the following Monday", () => {
    // 2026-09-05 is a Saturday, so +14 is 2026-09-19, a Saturday too (K.9).
    expect(rollForward("2026-09-05", null, 14, "2026-09-10")).toBe("2026-09-21");
  });

  it("moves a rolled Sunday to Monday", () => {
    // 2026-09-06 is a Sunday; +14 is 2026-09-20, also a Sunday.
    expect(rollForward("2026-09-06", null, 14, "2026-09-10")).toBe("2026-09-21");
  });

  it("leaves a future date the coach picked alone, weekend or not", () => {
    expect(rollForward("2026-09-19", "2026-09-05", 14, "2026-09-10")).toBe("2026-09-19");
  });

  it("stops at the loop bound instead of spinning on a corrupt anchor", () => {
    // 400 one-day steps from 1970 never reach today: the bound returns the
    // last value computed (1971-02-05, a Friday) rather than looping forever.
    expect(rollForward("1970-01-01", null, 1, "2026-09-16")).toBe("1971-02-05");
  });

  it("lands a rolled date on the preferred weekday, nearest occurrence (K.34)", () => {
    // 2026-08-26 is a Wednesday; +14 is 2026-09-09, a Wednesday. Preferring
    // Friday (5) moves it two days later; preferring Monday (1) two days earlier
    // would fall before today, so it goes to the Monday after.
    expect(rollForward("2026-08-26", "2026-08-26", 14, "2026-09-09", 5)).toBe("2026-09-11");
    expect(rollForward("2026-08-26", "2026-08-26", 14, "2026-09-09", 1)).toBe("2026-09-14");
    expect(rollForward("2026-08-26", "2026-08-26", 14, "2026-09-01", 1)).toBe("2026-09-07");
  });

  it("keeps a Wednesday preference on Wednesdays across rolls", () => {
    expect(rollForward("2026-09-09", "2026-09-09", 14, "2026-09-10", 3)).toBe("2026-09-23");
    expect(rollForward("2026-09-23", "2026-09-23", 14, "2026-09-24", 3)).toBe("2026-10-07");
  });

  it("leaves a future date alone even when it is not the preferred weekday", () => {
    expect(rollForward("2026-09-19", "2026-09-05", 14, "2026-09-10", 3)).toBe("2026-09-19");
  });
});

describe("weekday helpers", () => {
  it("finds the nearest occurrence, never more than three days away", () => {
    expect(nearestWeekday("2026-09-09", 3)).toBe("2026-09-09");
    expect(nearestWeekday("2026-09-09", 1)).toBe("2026-09-07");
    expect(nearestWeekday("2026-09-09", 0)).toBe("2026-09-06");
    expect(nearestWeekday("2026-09-09", 6)).toBe("2026-09-12");
  });
  it("finds the first occurrence on or after a date", () => {
    expect(nextWeekdayOnOrAfter("2026-09-09", 3)).toBe("2026-09-09");
    expect(nextWeekdayOnOrAfter("2026-09-09", 1)).toBe("2026-09-14");
  });
  it("shortens a Postgres time", () => {
    expect(shortTime("15:00:00")).toBe("15:00");
    expect(shortTime("09:30")).toBe("09:30");
    expect(shortTime(null)).toBeNull();
    expect(shortTime("")).toBeNull();
  });
});

describe("describeDay", () => {
  it("names the weekday and the day from the date string alone", () => {
    expect(describeDay("2026-09-23")).toBe("Wednesday 23 Sep");
    expect(describeDay("2026-01-01")).toBe("Thursday 1 Jan");
  });
});

describe("validateProposedDate", () => {
  const today = "2026-09-17"; // a Thursday
  it("accepts a weekday today or later", () => {
    expect(validateProposedDate("2026-09-17", today)).toEqual({ ok: true });
    expect(validateProposedDate("2026-09-23", today)).toEqual({ ok: true });
  });
  it("refuses a past date, a weekend and a malformed one", () => {
    expect(validateProposedDate("2026-09-16", today).ok).toBe(false);
    expect(validateProposedDate("2026-09-19", today).ok).toBe(false); // Saturday
    expect(validateProposedDate("2026-09-20", today).ok).toBe(false); // Sunday
    expect(validateProposedDate("next week", today).ok).toBe(false);
  });
});
