// The human-hours rule, checked against the cases that produced the wrong
// numbers it replaces: a wall-clock span with a long gap, parallel sessions,
// a UTC day boundary that is not the person's midnight, and a day that is
// spread across more repos than the budget allows.
import { describe, expect, it } from "vitest";
import {
  applyFocusBudget,
  computeDayHours,
  computeDayHoursV2,
  humanRunIntervals,
  subtractIntervals,
  unattendedIntervals,
  HUMAN_GAP_MS,
  MIN_DAY_HOURS,
  PRESENCE_GAP_MS,
  presenceIntervals,
  UNATTENDED_WEIGHT,
  UNATTENDED_FLOOR,
  UNATTENDED_HOLD_MS,
  UNATTENDED_FLOOR_AT_MS,
  unattendedWeightAt,
  intervalsFromTimestamps,
  measuredHoursByDay,
  tzOffsetMinutes,
  unionIntervals,
  bridgeNeedsReview,
  type HumanTurn,
  BRIDGE_REVIEW_MIN_HOURS,
} from "./day-hours";

const t = (iso: string) => Date.parse(iso);
const VN = 7 * 60;

/** Exact credit for a lone run left alone from minute `fromMin` to `toMin` after
 *  the typed line, integrating the curve minute by minute. The rule quantises
 *  the curve into quarter-hour slices, so the two agree to a rounding error. */
function curveCredit(fromMin: number, toMin: number): number {
  let h = 0;
  for (let m = fromMin; m < toMin; m++) h += unattendedWeightAt((m + 0.5) * 60_000) / 60;
  return h;
}

describe("intervalsFromTimestamps", () => {
  it("stops the clock after 30 minutes of silence", () => {
    const stamps = ["2026-08-25T08:00:00Z", "2026-08-25T08:10:00Z", "2026-08-25T10:00:00Z", "2026-08-25T10:05:00Z"].map(t);
    expect(intervalsFromTimestamps(stamps)).toEqual([
      { start: "2026-08-25T08:00:00.000Z", end: "2026-08-25T08:10:00.000Z" },
      { start: "2026-08-25T10:00:00.000Z", end: "2026-08-25T10:05:00.000Z" },
    ]);
  });
  it("handles an unsorted single-message session", () => {
    expect(intervalsFromTimestamps([t("2026-08-25T08:00:00Z")])).toHaveLength(1);
    expect(intervalsFromTimestamps([])).toEqual([]);
  });
});

describe("unionIntervals", () => {
  it("merges overlaps and keeps gaps", () => {
    expect(unionIntervals([[5, 10], [1, 6], [20, 25]])).toEqual([[1, 10], [20, 25]]);
  });
});

describe("tzOffsetMinutes", () => {
  it("reads the profile form's free text, a bare offset and an IANA name", () => {
    expect(tzOffsetMinutes("UTC+07:00 (Thailand, Vietnam)")).toBe(420);
    expect(tzOffsetMinutes("-05:00")).toBe(-300);
    expect(tzOffsetMinutes("Asia/Ho_Chi_Minh")).toBe(420);
    expect(tzOffsetMinutes(null)).toBe(420);
  });
});

describe("measuredHoursByDay", () => {
  it("counts parallel sessions on one repo once", () => {
    const by = measuredHoursByDay(
      [
        { repoId: "web", intervals: [{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T04:00:00Z" }] },
        { repoId: "web", intervals: [{ start: "2026-08-25T03:00:00Z", end: "2026-08-25T05:00:00Z" }] },
      ],
      VN,
    );
    expect(by.get("2026-08-25")?.get("web")).toBeCloseTo(3);
  });
  it("splits at the person's midnight, not UTC midnight", () => {
    // 23:00 to 01:00 Vietnam time is 16:00 to 18:00 UTC: one UTC day, two local days.
    const by = measuredHoursByDay(
      [{ repoId: "web", intervals: [{ start: "2026-08-25T16:00:00Z", end: "2026-08-25T18:00:00Z" }] }],
      VN,
    );
    expect(by.get("2026-08-25")?.get("web")).toBeCloseTo(1);
    expect(by.get("2026-08-26")?.get("web")).toBeCloseTo(1);
  });
  it("does not bill the gap between an afternoon and the next morning", () => {
    const by = measuredHoursByDay(
      [
        {
          repoId: "web",
          intervals: [
            { start: "2026-08-25T08:00:00Z", end: "2026-08-25T09:30:00Z" },
            { start: "2026-08-25T23:40:00Z", end: "2026-08-26T00:10:00Z" },
          ],
        },
      ],
      VN,
    );
    expect(by.get("2026-08-25")?.get("web")).toBeCloseTo(1.5);
    expect(by.get("2026-08-26")?.get("web")).toBeCloseTo(0.5);
  });
});

describe("applyFocusBudget", () => {
  it("keeps measured hours under the budget and floors tiny repos", () => {
    const out = applyFocusBudget(new Map([["a", 2], ["b", 0.1]]), 6);
    expect(out.get("a")).toMatchObject({ measured: 2, final: 2, scaled: false });
    expect(out.get("b")).toMatchObject({ measured: 0.25, final: 0.25 });
  });
  it("scales every repo in proportion when the day exceeds the budget", () => {
    const out = applyFocusBudget(new Map([["a", 2], ["b", 4], ["c", 8]]), 6);
    expect(out.get("a")?.final).toBeCloseTo(0.86, 2);
    expect(out.get("b")?.final).toBeCloseTo(1.71, 2);
    expect(out.get("c")?.final).toBeCloseTo(3.43, 2);
    expect(out.get("c")?.scaled).toBe(true);
    const sum = [...out.values()].reduce((s, v) => s + v.final, 0);
    expect(sum).toBeCloseTo(6, 1);
  });
  it("drops repos with no time", () => {
    expect(applyFocusBudget(new Map([["a", 0]]), 6).size).toBe(0);
  });
});

describe("computeDayHours", () => {
  it("reports each repo's share of the day with the others beside it", () => {
    const rows = computeDayHours(
      [
        { repoId: "web", intervals: [{ start: "2026-08-25T01:00:00Z", end: "2026-08-25T06:00:00Z" }] },
        { repoId: "api", intervals: [{ start: "2026-08-25T07:00:00Z", end: "2026-08-25T10:00:00Z" }] },
      ],
      VN,
      6,
    );
    expect(rows).toHaveLength(2);
    const web = rows.find((r) => r.repoId === "web");
    expect(web).toMatchObject({ day: "2026-08-25", measured: 5, final: 3.75, scaled: true, totalMeasured: 8 });
    expect(web?.others).toEqual({ api: 2.25 });
  });
});


// ─── Rule v2: the human-turn clock ──────────────────────────────────────────
describe("computeDayHoursV2", () => {
  it("a day can never exceed the union of the person's runs: concurrent repos count once", () => {
    // Two repos worked in the SAME two hours (parallel windows). v1 summed them to 4h.
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: [{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T04:00:00Z" }], turns: [{ t: "2026-08-25T02:00:00Z", branch: "feat/a" }, { t: "2026-08-25T03:00:00Z", branch: "feat/a" }, { t: "2026-08-25T03:30:00Z", branch: "feat/a" }] },
        { repoId: "api", intervals: [{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T04:00:00Z" }], turns: [{ t: "2026-08-25T02:30:00Z", branch: "fix/b" }] },
      ],
      VN,
    );
    const web = rows.find((r) => r.repoId === "web")!;
    const api = rows.find((r) => r.repoId === "api")!;
    expect(web.dayTotal).toBe(2);
    expect(web.final + api.final).toBeCloseTo(2, 5);
    // Both repos' clocks cover the same two hours, so each claims 2 h of a 2 h
    // day: the overlap is shared equally, never by who typed more lines.
    expect(web).toMatchObject({ share: 0.5, final: 1, turns: 3, branches: { "feat/a": 3 } });
    expect(api).toMatchObject({ share: 0.5, final: 1, turns: 1, branches: { "fix/b": 1 } });
    expect(web.others).toEqual({ api: 1 });
  });

  it("falls back to time share when no session carries human turns (legacy sessions)", () => {
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: [{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T05:00:00Z" }] },
        { repoId: "api", intervals: [{ start: "2026-08-25T04:00:00Z", end: "2026-08-25T06:00:00Z" }] },
      ],
      VN,
    );
    const web = rows.find((r) => r.repoId === "web")!;
    const api = rows.find((r) => r.repoId === "api")!;
    expect(web.dayTotal).toBe(4); // 02:00–06:00 union, not 3 + 2
    expect(web.final).toBeCloseTo(2.4, 5); // 3/5 of 4
    expect(api.final).toBeCloseTo(1.6, 5); // 2/5 of 4
    expect(web.turns).toBe(0);
  });

  it("measured time is never scaled down in proportion — but it is capped", () => {
    const day = [{ repoId: "web", intervals: [{ start: "2026-08-25T00:00:00Z", end: "2026-08-25T14:00:00Z" }], turns: [{ t: "2026-08-25T01:00:00Z", branch: "main" }] }];
    // Uncapped, a 14-hour day is still a 14-hour day (v2 never budget-scales).
    expect(computeDayHoursV2(day, VN)[0]).toMatchObject({ final: 14, dayTotal: 14, capped: false });
    // With the person's daily cap, it bills the cap and says so.
    const capped = computeDayHoursV2(day, VN, 12)[0];
    expect(capped).toMatchObject({ final: 12, dayTotal: 12, rawDayTotal: 14, capped: true, budget: 12 });
  });

  it("the daily cap is a hard ceiling on the whole day, across repos", () => {
    // Two repos, 9 hours each in non-overlapping windows: 18 h of real clock.
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: [{ start: "2026-08-24T18:00:00Z", end: "2026-08-25T03:00:00Z" }], turns: [{ t: "2026-08-24T18:00:00Z", branch: "a" }] },
        { repoId: "api", intervals: [{ start: "2026-08-25T03:00:00Z", end: "2026-08-25T12:00:00Z" }], turns: [{ t: "2026-08-25T03:00:00Z", branch: "b" }] },
      ],
      VN,
      12,
    );
    const day = rows.filter((r) => r.day === "2026-08-25");
    expect(day.every((r) => r.capped)).toBe(true);
    expect(day.reduce((s, r) => s + r.final, 0)).toBeLessThanOrEqual(12);
  });

  it("floors a repo that got a real turn but almost no time", () => {
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: [{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T04:00:00Z" }], turns: [{ t: "2026-08-25T02:00:00Z", branch: "main" }] },
        { repoId: "api", intervals: [{ start: "2026-08-25T05:00:00Z", end: "2026-08-25T05:00:30Z" }], turns: [] },
      ],
      VN,
    );
    expect(rows.find((r) => r.repoId === "api")?.final).toBe(0.25);
  });

  it("cuts the union at the person's midnight and counts turns on the local day", () => {
    // 23:30 → 00:30 Vietnam = 16:30Z → 17:30Z; turn at 00:10 local (17:10Z) lands on the 26th
    const rows = computeDayHoursV2(
      [{ repoId: "web", intervals: [{ start: "2026-08-25T16:30:00Z", end: "2026-08-25T17:30:00Z" }], turns: [{ t: "2026-08-25T16:40:00Z", branch: "main" }, { t: "2026-08-25T17:10:00Z", branch: "main" }] }],
      VN,
    );
    expect(rows.map((r) => [r.day, r.final, r.turns])).toEqual([["2026-08-25", 0.5, 1], ["2026-08-26", 0.5, 1]]);
  });

  it("HUMAN_GAP_MS is ten minutes", () => {
    expect(HUMAN_GAP_MS).toBe(600_000);
  });
});


describe("unattended AI runtime", () => {
  // One prompt at 02:00, AI runs until 02:40, nobody replies until 03:30.
  const loneRun = [{ t: "2026-08-25T02:00:00Z", branch: "main", runEnd: "2026-08-25T02:40:00Z" }, { t: "2026-08-25T03:30:00Z", branch: "main", runEnd: "2026-08-25T03:31:00Z" }];
  it("a run nobody watched: 10 min at full rate, the remaining 30 min unattended", () => {
    expect(humanRunIntervals(loneRun)[0]).toEqual({ start: "2026-08-25T02:00:00.000Z", end: "2026-08-25T02:10:00.000Z" });
    expect(unattendedIntervals(loneRun)).toEqual([{ start: "2026-08-25T02:10:00.000Z", end: "2026-08-25T02:40:00.000Z", weight: 0.5 }]);
  });
  it("a prompt reply within 10 minutes of the AI going quiet: start, finish and reading gap at full rate, the middle unattended", () => {
    const watched = [{ t: "2026-08-25T02:00:00Z", branch: "main", runEnd: "2026-08-25T02:40:00Z" }, { t: "2026-08-25T02:45:00Z", branch: "main", runEnd: "2026-08-25T02:46:00Z" }];
    expect(humanRunIntervals(watched)).toEqual([
      { start: "2026-08-25T02:00:00.000Z", end: "2026-08-25T02:10:00.000Z" },
      { start: "2026-08-25T02:30:00.000Z", end: "2026-08-25T02:46:00.000Z" },
    ]);
    expect(unattendedIntervals(watched)).toEqual([{ start: "2026-08-25T02:10:00.000Z", end: "2026-08-25T02:30:00.000Z", weight: 0.5 }]);
  });
  it("a short run that was replied to bills in full, no unattended slice", () => {
    const short = [{ t: "2026-08-25T02:00:00Z", branch: "main", runEnd: "2026-08-25T02:15:00Z" }, { t: "2026-08-25T02:18:00Z", branch: "main", runEnd: "2026-08-25T02:19:00Z" }];
    expect(humanRunIntervals(short)).toEqual([{ start: "2026-08-25T02:00:00.000Z", end: "2026-08-25T02:19:00.000Z" }]);
    expect(unattendedIntervals(short)).toEqual([]);
  });
  it("an 11-hour autonomous loop replied to at the end cannot bill 11 hours of presence", () => {
    const loop = [{ t: "2026-08-25T00:00:00Z", branch: "main", runEnd: "2026-08-25T11:00:00Z" }, { t: "2026-08-25T11:05:00Z", branch: "main", runEnd: "2026-08-25T11:06:00Z" }];
    const rows = computeDayHoursV2([{ repoId: "web", intervals: humanRunIntervals(loop), turns: loop, unattended: unattendedIntervals(loop) }], 0);
    expect(rows[0].fullHours).toBeCloseTo(10 / 60 + 16 / 60, 2); // first 10 min + last 10 min + 6 min to the reply
    expect(rows[0].unattendedHours).toBeCloseTo(10 + 40 / 60, 2);
    // 00:10–10:50 on the curve: 50% to the one-hour mark, then falling to about
    // 10% at the ten-hour mark. The bands are heaviest first and sum to the runtime.
    const bands = rows[0].unattendedBands;
    expect(bands[0]).toEqual({ weight: 0.5, hours: 0.83 });
    expect(bands.every((b, i) => i === 0 || b.weight <= bands[i - 1].weight)).toBe(true);
    expect(bands.reduce((a, b) => a + b.hours, 0)).toBeCloseTo(10 + 40 / 60, 1);
    const credited = curveCredit(10, 10 * 60 + 50);
    expect(rows[0].unattendedCredited).toBeCloseTo(credited, 1);
    expect(rows[0].dayTotal).toBeCloseTo(26 / 60 + credited, 1);
  });
  it("the day credits unattended time at the weight, net of full-rate overlap from another session", () => {
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(loneRun), turns: loneRun, unattended: unattendedIntervals(loneRun) },
        // meanwhile the person typed in another repo 02:20–02:30: that slice is full rate, not unattended
        { repoId: "api", intervals: [{ start: "2026-08-25T02:20:00Z", end: "2026-08-25T02:30:00Z" }], turns: [{ t: "2026-08-25T02:20:00Z", branch: "x" }] },
      ],
      VN,
    );
    const web = rows.find((r) => r.repoId === "web")!;
    // Keyboard: 02:00–02:10 + 02:20–02:30 + 03:30–03:31 = 21 min. The api line at
    // 02:20 is 20 min after the web line at 02:00, so the person was present for
    // that gap and the job's 02:10–02:20 is bridged to full rate: 31 min = 0.52 h.
    // Unattended net of all that: 02:30–02:40 = 10 min = 0.1667 h.
    expect(web.attendedByActivityHours).toBeCloseTo(10 / 60, 2);
    expect(web.fullHours).toBeCloseTo(31 / 60, 2);
    expect(web.unattendedHours).toBeCloseTo(10 / 60, 2);
    expect(web.dayTotal).toBeCloseTo(31 / 60 + UNATTENDED_WEIGHT * (10 / 60), 2);
    expect(UNATTENDED_WEIGHT).toBe(0.5);
  });

  // ─── The taper (decision 2026-09-07, third revision) ──────────────────────
  it("the curve: 50% held for the first hour, twelve points off per doubling, a 7% floor from twelve hours", () => {
    const h = 60 * 60 * 1000;
    expect(UNATTENDED_HOLD_MS).toBe(h);
    expect(UNATTENDED_FLOOR).toBe(0.07);
    expect(UNATTENDED_FLOOR_AT_MS).toBe(12 * h);
    expect(unattendedWeightAt(10 * 60 * 1000)).toBe(0.5);
    expect(unattendedWeightAt(h)).toBe(0.5);
    expect(unattendedWeightAt(2 * h)).toBeCloseTo(0.38, 2);
    expect(unattendedWeightAt(4 * h)).toBeCloseTo(0.26, 2);
    expect(unattendedWeightAt(8 * h)).toBeCloseTo(0.14, 2);
    expect(unattendedWeightAt(12 * h)).toBeCloseTo(0.07, 5);
    expect(unattendedWeightAt(24 * h)).toBe(0.07);
    // Monotone: deeper is never worth more.
    for (let d = h; d < 30 * h; d += 7 * 60 * 1000) expect(unattendedWeightAt(d + 60_000)).toBeLessThanOrEqual(unattendedWeightAt(d));
  });
  it("the weight falls with depth into the run, marginally: slices, heaviest first, no cliff", () => {
    const long = [{ t: "2026-08-25T00:00:00Z", branch: "main", runEnd: "2026-08-25T05:00:00Z" }];
    const pieces = unattendedIntervals(long);
    expect(pieces[0]).toEqual({ start: "2026-08-25T00:10:00.000Z", end: "2026-08-25T01:00:00.000Z", weight: 0.5 });
    expect(pieces[pieces.length - 1].end).toBe("2026-08-25T05:00:00.000Z");
    // Contiguous, non-increasing, and each slice carries the curve at its midpoint.
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].start).toBe(pieces[i - 1].end);
      expect(pieces[i].weight).toBeLessThanOrEqual(pieces[i - 1].weight);
      const mid = (Date.parse(pieces[i].start) + Date.parse(pieces[i].end)) / 2 - Date.parse(long[0].t);
      expect(pieces[i].weight).toBeCloseTo(unattendedWeightAt(mid), 2);
    }
  });
  it("a run that ends inside the one-hour hold is never touched by the taper", () => {
    const under = [{ t: "2026-08-25T00:00:00Z", branch: "main", runEnd: "2026-08-25T00:59:00Z" }];
    expect(unattendedIntervals(under)).toEqual([
      { start: "2026-08-25T00:10:00.000Z", end: "2026-08-25T00:59:00.000Z", weight: 0.5 },
    ]);
  });
  it("a run one minute longer never bills less than a run one minute shorter", () => {
    const at = (endIso: string) => {
      const turns = [{ t: "2026-08-25T00:00:00Z", branch: "main", runEnd: endIso }];
      const rows = computeDayHoursV2([{ repoId: "web", intervals: humanRunIntervals(turns), turns, unattended: unattendedIntervals(turns) }], 0);
      return rows[0].dayTotal;
    };
    expect(at("2026-08-25T03:01:00Z")).toBeGreaterThan(at("2026-08-25T02:59:00Z"));
  });
  it("overlapping runs at different depths: the second is credited once, at the better weight", () => {
    // A 6-hour loop in one repo; in another the person prompts at 04:00 and walks
    // away. 04:10–05:00 is deep in the loop (about 25%) but shallow in the new run
    // (50%) — a person running two agents should not be charged less for it.
    const loop = [{ t: "2026-08-25T00:00:00Z", branch: "a", runEnd: "2026-08-25T06:00:00Z" }];
    const fresh = [{ t: "2026-08-25T04:00:00Z", branch: "b", runEnd: "2026-08-25T05:00:00Z" }];
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(loop), turns: loop, unattended: unattendedIntervals(loop) },
        { repoId: "api", intervals: humanRunIntervals(fresh), turns: fresh, unattended: unattendedIntervals(fresh) },
      ],
      0,
    );
    const bands = rows[0].unattendedBands;
    // 50% band: 00:10–01:00 (50m) from the loop plus 04:10–05:00 (50m) from the fresh run.
    expect(bands.find((b) => b.weight === 0.5)?.hours).toBeCloseTo(50 / 60 + 50 / 60, 2);
    // The loop's own 04:00–05:00 slices are gone from the deeper bands: they were
    // claimed at 50% (04:10–05:00) or at full rate (04:00–04:10).
    const deepInFour = bands.filter((b) => b.weight < 0.5).reduce((a, b) => a + b.hours, 0);
    expect(deepInFour).toBeCloseTo(5 - 1, 1); // 01:00–06:00 minus the hour the fresh run covered
    // No second is billed twice: the bands sum to the wall clock 00:10–06:00
    // minus the full-rate slices at 00:00–00:10 and 04:00–04:10.
    expect(rows[0].unattendedHours).toBeCloseTo(350 / 60 - 10 / 60, 2);
  });
  it("the taper survives the person's midnight: an overnight loop splits across two days", () => {
    const loop = [{ t: "2026-08-25T14:00:00Z", branch: "main", runEnd: "2026-08-26T01:00:00Z" }]; // 21:00–08:00 in VN
    const rows = computeDayHoursV2([{ repoId: "web", intervals: humanRunIntervals(loop), turns: loop, unattended: unattendedIntervals(loop) }], VN);
    expect(rows.map((r) => r.day)).toEqual(["2026-08-25", "2026-08-26"]);
    // 21:10–24:00 on day one: the 50-minute hold at 50%, then the curve down to 3 h deep.
    const day1 = rows[0].unattendedBands;
    expect(day1[0]).toEqual({ weight: 0.5, hours: 0.83 });
    expect(day1.reduce((a, b) => a + b.hours, 0)).toBeCloseTo(170 / 60, 1);
    // Day two runs from 3 h to 11 h deep: every band is below the 3-hour weight and at or above the floor.
    const day2 = rows[1].unattendedBands;
    expect(day2.reduce((a, b) => a + b.hours, 0)).toBeCloseTo(8, 1);
    for (const b of day2) {
      expect(b.weight).toBeLessThanOrEqual(unattendedWeightAt(3 * 60 * 60 * 1000) + 0.001);
      expect(b.weight).toBeGreaterThanOrEqual(UNATTENDED_FLOOR);
    }
  });
  it("two clients share an overlapping hour in proportion to their own clocks", () => {
    // Eight hours typing for client B (a line every 8 min, so the clock never
    // stops), while a four-hour job for client A runs 10:00–14:00 in the background.
    const b = Array.from({ length: 61 }, (_, i) => {
      const t = Date.UTC(2026, 7, 25, 8) + i * 8 * 60_000;
      return { t: new Date(t).toISOString(), branch: "b", runEnd: new Date(t + 2 * 60_000).toISOString() };
    });
    const a = [{ t: "2026-08-25T10:00:00Z", branch: "a", runEnd: "2026-08-25T14:00:00Z" }];
    const rows = computeDayHoursV2(
      [
        { repoId: "clientA", intervals: humanRunIntervals(a), turns: a, unattended: unattendedIntervals(a) },
        { repoId: "clientB", intervals: humanRunIntervals(b), turns: b, unattended: unattendedIntervals(b) },
      ],
      0,
    );
    const A = rows.find((r) => r.repoId === "clientA")!;
    const B = rows.find((r) => r.repoId === "clientB")!;
    // The person's day is the union: 08:00–16:02, no double count.
    expect(A.dayTotal).toBeCloseTo(8 + 2 / 60, 1);
    // A's job was bridged to full rate (lines every 30 min prove presence), so A
    // claims ~4 h; B claims its 8 h of watched lines. The day is shared by claim,
    // and A gets real hours instead of a one-line floor.
    expect(A.final).toBeGreaterThan(2);
    expect(A.final).toBeLessThanOrEqual(A.ceiling + 0.01);
    expect(A.final + B.final).toBeCloseTo(A.dayTotal, 1);
    // And nobody is billed an hour the person did not have.
    expect(A.final + B.final).toBeLessThanOrEqual(A.dayTotal + 0.01);
  });

  it("a repo never bills more than its own clock can justify", () => {
    // web has ONE long turn (little hands-on time, no unattended runtime);
    // api has many short turns. Turn share alone would hand web most of the day
    // even though web's own clock covers only ten minutes.
    const webTurns = [{ t: "2026-08-25T02:00:00Z", branch: "a", runEnd: "2026-08-25T02:05:00Z" }];
    const apiTurns = Array.from({ length: 9 }, (_, i) => ({
      t: `2026-08-25T0${3 + i}:00:00Z`,
      branch: "b",
      runEnd: `2026-08-25T0${3 + i}:30:00Z`,
    }));
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(webTurns), turns: webTurns, unattended: unattendedIntervals(webTurns) },
        { repoId: "api", intervals: humanRunIntervals(apiTurns), turns: apiTurns, unattended: unattendedIntervals(apiTurns) },
      ],
      0,
    );
    const web = rows.find((r) => r.repoId === "web")!;
    expect(web.ceiling).toBeCloseTo(5 / 60, 2); // its whole run sat inside the watching allowance
    // web's claim is five minutes of a day that is mostly api's, so its share is
    // tiny; MIN_DAY_HOURS is the one thing allowed to win over the clock — a repo
    // that got a real turn still earns a line on the ledger.
    expect(web.final).toBe(MIN_DAY_HOURS);
    expect(web.final).toBeLessThanOrEqual(Math.max(MIN_DAY_HOURS, web.ceiling));
  });

  it("the floor: past twelve hours a run is an overnight batch at 7%, and a 24-hour loop bills under four hours", () => {
    const loop = [{ t: "2026-08-25T00:00:00Z", branch: "main", runEnd: "2026-08-26T00:00:00Z" }];
    const pieces = unattendedIntervals(loop);
    const tail = pieces[pieces.length - 1];
    expect(tail.weight).toBe(UNATTENDED_FLOOR);
    expect(tail.start).toBe("2026-08-25T12:00:00.000Z");
    expect(tail.end).toBe("2026-08-26T00:00:00.000Z");
    const rows = computeDayHoursV2([{ repoId: "web", intervals: humanRunIntervals(loop), turns: loop, unattended: unattendedIntervals(loop) }], 0);
    expect(rows[0].unattendedCredited).toBeCloseTo(curveCredit(10, 24 * 60), 1);
    expect(rows[0].dayTotal).toBeCloseTo(3.67, 1); // 5.65 h under the v2.2 steps, 12.08 h at a flat 50%
  });

  // ─── The bridge review flag (decision 2026-09-08) ────────────────────────
  const dayRow = (turns: HumanTurn[], repoId = "web") => {
    const rows = computeDayHoursV2([{ repoId, intervals: humanRunIntervals(turns), turns, unattended: unattendedIntervals(turns) }], 0);
    return rows[0];
  };
  it("one keystroke every 59 minutes through the night bills the night in full — and is flagged", () => {
    // Nine lines 00:00–08:00, each starting an 8-hour-deep run that is still going.
    const night = Array.from({ length: 9 }, (_, i) => {
      const t = Date.UTC(2026, 7, 25, 0) + i * 59 * 60_000;
      return { t: new Date(t).toISOString(), branch: "a", runEnd: "2026-08-25T08:00:00Z" };
    });
    const row = dayRow(night);
    expect(row.attendedByActivityHours).toBeGreaterThan(BRIDGE_REVIEW_MIN_HOURS);
    expect(row.dayTurns).toBe(9);
    expect(bridgeNeedsReview(row)).toBe(true);
  });
  it("a four-hour job with the person typing every 45 minutes elsewhere is not flagged", () => {
    const job = [{ t: "2026-08-25T09:00:00Z", branch: "a", runEnd: "2026-08-25T13:00:00Z" }];
    const elsewhere = Array.from({ length: 6 }, (_, i) => {
      const t = Date.UTC(2026, 7, 25, 9) + i * 45 * 60_000;
      return { t: new Date(t).toISOString(), branch: "b", runEnd: new Date(t + 5 * 60_000).toISOString() };
    });
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(job), turns: job, unattended: unattendedIntervals(job) },
        { repoId: "api", intervals: humanRunIntervals(elsewhere), turns: elsewhere, unattended: unattendedIntervals(elsewhere) },
      ],
      0,
    );
    for (const r of rows) expect(bridgeNeedsReview(r)).toBe(false);
  });
  it("an all-day job beside a normal day of typing is not flagged", () => {
    // Eight-hour job; 24 lines typed elsewhere every 20 minutes. Lots bridged, but
    // well under half an hour per line: the person was plainly working.
    const job = [{ t: "2026-08-25T08:00:00Z", branch: "a", runEnd: "2026-08-25T16:00:00Z" }];
    const typing = Array.from({ length: 24 }, (_, i) => {
      const t = Date.UTC(2026, 7, 25, 8) + i * 20 * 60_000;
      return { t: new Date(t).toISOString(), branch: "b", runEnd: new Date(t + 60_000).toISOString() };
    });
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(job), turns: job, unattended: unattendedIntervals(job) },
        { repoId: "api", intervals: humanRunIntervals(typing), turns: typing, unattended: unattendedIntervals(typing) },
      ],
      0,
    );
    const web = rows.find((r) => r.repoId === "web")!;
    expect(web.attendedByActivityHours).toBeGreaterThan(BRIDGE_REVIEW_MIN_HOURS);
    expect(bridgeNeedsReview(web)).toBe(false);
  });
  it("a day with no bridged time is never flagged, however few lines it has", () => {
    expect(bridgeNeedsReview(dayRow([{ t: "2026-08-25T00:00:00Z", branch: "a", runEnd: "2026-08-25T11:00:00Z" }]))).toBe(false);
  });

  // ─── The presence bridge (decision 2026-09-07, fourth revision) ──────────
  it("a job left running while the person types elsewhere bills in full", () => {
    // A four-hour job on web at 09:00; meanwhile the person types on api every
    // 45 minutes from 09:00 to 13:00. They were at their desk the whole time.
    const job = [{ t: "2026-08-25T09:00:00Z", branch: "a", runEnd: "2026-08-25T13:00:00Z" }];
    const elsewhere = Array.from({ length: 6 }, (_, i) => {
      const t = Date.UTC(2026, 7, 25, 9) + i * 45 * 60_000;
      return { t: new Date(t).toISOString(), branch: "b", runEnd: new Date(t + 5 * 60_000).toISOString() };
    });
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(job), turns: job, unattended: unattendedIntervals(job) },
        { repoId: "api", intervals: humanRunIntervals(elsewhere), turns: elsewhere, unattended: unattendedIntervals(elsewhere) },
      ],
      0,
    );
    const web = rows.find((r) => r.repoId === "web")!;
    // Presence spans 09:00–12:45 (six lines 45 min apart). The job's machine time
    // 09:10–12:45 is bridged to full rate; only 12:45–13:00 stays on the taper.
    // Bridged 09:10–12:45 = 3 h 35, net of the four 5-minute api keyboard slices inside it = 3 h 15.
    expect(web.attendedByActivityHours).toBeCloseTo(3.25, 2);
    // Left on the taper: 12:50–13:00 (the api line at 12:45 covers to 12:50 at full rate).
    expect(web.unattendedHours).toBeCloseTo(10 / 60, 2);
    expect(web.fullHours + web.unattendedHours).toBeCloseTo(4, 2);
    expect(web.ceiling).toBeGreaterThan(3.5); // the repo's own clock now includes its bridged job
  });
  it("an overnight loop with nothing typed around it bridges nothing", () => {
    const loop = [{ t: "2026-08-25T00:00:00Z", branch: "main", runEnd: "2026-08-25T11:00:00Z" }, { t: "2026-08-25T11:05:00Z", branch: "main", runEnd: "2026-08-25T11:06:00Z" }];
    const rows = computeDayHoursV2([{ repoId: "web", intervals: humanRunIntervals(loop), turns: loop, unattended: unattendedIntervals(loop) }], 0);
    expect(rows[0].attendedByActivityHours).toBe(0);
    expect(rows[0].unattendedHours).toBeCloseTo(10 + 40 / 60, 2);
  });
  it("the bridge upgrades machine time but never invents time: lunch stays unbilled", () => {
    // Two typed lines 50 minutes apart with NO job running in between.
    const turns = [
      { t: "2026-08-25T12:00:00Z", branch: "a", runEnd: "2026-08-25T12:02:00Z" },
      { t: "2026-08-25T12:50:00Z", branch: "a", runEnd: "2026-08-25T12:52:00Z" },
    ];
    expect(presenceIntervals(turns)).toEqual([[Date.parse("2026-08-25T12:00:00Z"), Date.parse("2026-08-25T12:50:00Z")]]);
    const rows = computeDayHoursV2([{ repoId: "web", intervals: humanRunIntervals(turns), turns, unattended: unattendedIntervals(turns) }], 0);
    expect(rows[0].attendedByActivityHours).toBe(0);
    expect(rows[0].fullHours).toBeCloseTo(4 / 60, 2); // two two-minute runs, nothing else
    expect(PRESENCE_GAP_MS).toBe(3_600_000);
  });
  it("lines further apart than the presence gap do not bridge", () => {
    const job = [{ t: "2026-08-25T09:00:00Z", branch: "a", runEnd: "2026-08-25T13:00:00Z" }];
    // 09:00 → 10:30 → 12:30: every gap is over an hour, so nothing proves presence in between.
    const far = [{ t: "2026-08-25T10:30:00Z", branch: "b", runEnd: "2026-08-25T10:31:00Z" }, { t: "2026-08-25T12:30:00Z", branch: "b", runEnd: "2026-08-25T12:31:00Z" }];
    const rows = computeDayHoursV2(
      [
        { repoId: "web", intervals: humanRunIntervals(job), turns: job, unattended: unattendedIntervals(job) },
        { repoId: "api", intervals: humanRunIntervals(far), turns: far, unattended: unattendedIntervals(far) },
      ],
      0,
    );
    expect(rows.find((r) => r.repoId === "web")!.attendedByActivityHours).toBe(0);
  });

  it("no second is ever billed twice: full-rate and every band are disjoint", () => {
    // Four heavily overlapping sessions across three repos, each leaving runs
    // going while the person types elsewhere — the shape that would double count
    // if the bands were summed rather than netted against a running cover.
    const mk = (h: number, endH: number) => [{ t: `2026-08-25T${String(h).padStart(2, "0")}:00:00Z`, branch: "x", runEnd: `2026-08-25T${String(endH).padStart(2, "0")}:00:00Z` }];
    const sessions = [
      { repoId: "web", turns: mk(0, 11) },
      { repoId: "api", turns: mk(2, 9) },
      { repoId: "ops", turns: mk(3, 6) },
      { repoId: "web", turns: mk(4, 12) },
    ].map((x) => ({ repoId: x.repoId, intervals: humanRunIntervals(x.turns), turns: x.turns, unattended: unattendedIntervals(x.turns) }));
    const row = computeDayHoursV2(sessions, 0)[0];
    // Together they span 00:00–12:00 of wall clock and no more, even though the
    // four runs sum to 33 hours. This is the invariant the daily cap backstops:
    // when a day still exceeds a person's budget it is because the clock covered
    // hours they were not awake for, NOT because an hour was counted twice.
    expect(row.fullHours + row.unattendedHours).toBeCloseTo(12, 2);
    expect(row.fullHours + row.unattendedHours).toBeLessThanOrEqual(24);
    expect(row.unattendedCredited).toBeLessThanOrEqual(row.unattendedHours);
  });

  it("subtractIntervals removes covered stretches", () => {
    expect(subtractIntervals([[0, 100]], [[20, 30], [50, 120]])).toEqual([[0, 20], [30, 50]]);
    expect(subtractIntervals([[0, 10]], [])).toEqual([[0, 10]]);
  });
});


// ─── The invariant sweep ────────────────────────────────────────────────────
//
// Every number the ledger puts on screen has to hold together: the day cannot
// bill more than the person works, a repo cannot bill more than its own clock,
// a second cannot be counted twice, and the figures in the note have to add up
// to the figures in the columns. Spot tests prove one shape each; this proves
// the identities over many shapes at once, so a future change to the rule that
// breaks arithmetic fails here rather than on an invoice.
describe("hours rule invariants", () => {
  // Deterministic PRNG: a failure is reproducible, and CI never flakes.
  function rng(seed: number) {
    let x = seed;
    return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  }

  function scenario(seed: number) {
    const r = rng(seed);
    const repos = ["web", "api", "ops"].slice(0, 1 + Math.floor(r() * 3));
    const sessions: Parameters<typeof computeDayHoursV2>[0] = [];
    for (const repoId of repos) {
      for (let s = 0; s < 1 + Math.floor(r() * 3); s++) {
        const turns: Array<{ t: string; branch: string; runEnd: string }> = [];
        let cursor = Math.floor(r() * 20) * 3_600_000; // somewhere in the day
        for (let i = 0; i < 1 + Math.floor(r() * 6); i++) {
          const runMs = Math.floor(r() * 11 * 3_600_000); // 0 to 11 hours
          const t = cursor;
          const end = t + runMs;
          turns.push({
            t: new Date(Date.UTC(2026, 7, 25) + t).toISOString(),
            branch: repoId,
            runEnd: new Date(Date.UTC(2026, 7, 25) + end).toISOString(),
          });
          cursor = end + Math.floor(r() * 45 * 60_000); // idle before the next turn
        }
        sessions.push({ repoId, intervals: humanRunIntervals(turns), turns, unattended: unattendedIntervals(turns) });
      }
    }
    return sessions;
  }

  const BUDGETS = [0, 6, 12, 16];
  it("holds over 200 generated days", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const budget = BUDGETS[seed % BUDGETS.length];
      const rows = computeDayHoursV2(scenario(seed), VN, budget);
      const byDay = new Map<string, typeof rows>();
      for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);

      for (const [day, dayRows] of byDay) {
        const where = `seed ${seed}, budget ${budget}, day ${day}`;
        const [a] = dayRows;

        // 1. No second is billed twice: full-rate time and every unattended
        //    band are disjoint, so together they fit inside one calendar day.
        expect(a.fullHours + a.unattendedHours, `${where}: clock over 24h`).toBeLessThanOrEqual(24.001);

        // 2. The taper only ever reduces: credit can never exceed the top weight.
        expect(a.unattendedCredited, `${where}: credit above the top weight`).toBeLessThanOrEqual(0.5 * a.unattendedHours + 0.02); // both sides are round2'd
        expect(a.unattendedHours, `${where}: bands do not sum to the total`).toBeCloseTo(a.unattendedBands.reduce((s, b) => s + b.hours, 0), 1);

        // 3. The pre-cap total is exactly what it claims to be.
        expect(a.rawDayTotal, `${where}: rawDayTotal is not full + credit`).toBeCloseTo(a.fullHours + a.unattendedCredited, 1);

        // 4. The cap is applied, flagged, and never silently exceeded.
        expect(a.capped, `${where}: capped flag disagrees with the budget`).toBe(budget > 0 && a.rawDayTotal > budget);
        expect(a.dayTotal, `${where}: dayTotal is neither the raw figure nor the cap`).toBeCloseTo(a.capped ? budget : a.rawDayTotal, 1);
        if (budget > 0) expect(a.dayTotal, `${where}: day billed over the cap`).toBeLessThanOrEqual(budget + 0.001);

        for (const row of dayRows) {
          // Every row of a day agrees about the day.
          expect(row.dayTotal, `${where}: rows disagree on dayTotal`).toBe(a.dayTotal);

          // 5. A repo never bills more than its own clock justifies — except
          //    MIN_DAY_HOURS, the one floor allowed to win.
          expect(row.final, `${where}/${row.repoId}: over its ceiling`).toBeLessThanOrEqual(Math.max(MIN_DAY_HOURS, row.ceiling) + 0.001);

          // 6. `others` is exactly the other rows' finals — the ledger's
          //    "other projects that day" column cannot drift from the rows.
          const expected = Object.fromEntries(dayRows.filter((o) => o.repoId !== row.repoId).map((o) => [o.repoId, o.final]));
          expect(row.others, `${where}/${row.repoId}: others column disagrees`).toEqual(expected);
        }

        // 7. The ledger's note has to equal the ledger's columns: what a reader
        //    adds up from `final` + `others` is the number the note names.
        for (const row of dayRows) {
          const asRead = row.final + Object.values(row.others).reduce((x, y) => x + y, 0);
          const billedAll = dayRows.reduce((x, r2) => x + r2.final, 0);
          expect(asRead, `${where}/${row.repoId}: note would not match the columns`).toBeCloseTo(billedAll, 5);
        }

        // 8. Shares partition the day.
        expect(dayRows.reduce((s, r2) => s + r2.share, 0), `${where}: shares do not sum to 1`).toBeCloseTo(1, 2);

        // 9. The day's billed hours never exceed the day total, beyond the
        //    floor each repo is allowed to round up to.
        const billed = dayRows.reduce((s, r2) => s + r2.final, 0);
        expect(billed, `${where}: billed over the day total`).toBeLessThanOrEqual(a.dayTotal + MIN_DAY_HOURS * dayRows.length + 0.001);
      }
    }
  });
});
