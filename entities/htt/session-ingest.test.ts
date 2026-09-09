// The ingest's clock choice: with human turns present, only they build runs
// (10-minute gap); without them, the legacy all-lines intervals still work.
import { describe, expect, it } from "vitest";
import { humanTurnsFor, sessionIntervalsFor, unattendedIntervalsFor } from "./session-clock";
import type { TelemetryEntry } from "./session-ingest";

const base: TelemetryEntry = {
  session_id: "s1", github_login: "a", committer_login: "a", author_email: "a@edge8.ai",
  repo_full_name: "talentedgeai/x", started_at: "2026-08-25T02:00:00Z", ended_at: "2026-08-25T02:50:00Z",
  claude_tokens: 1, active_minutes: 50,
  active_intervals: [{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T02:50:00Z" }],
};

describe("sessionIntervalsFor", () => {
  it("human turns drive the clock: a 30-minute autonomous run after one prompt bills the 10-minute allowance", () => {
    const e: TelemetryEntry = {
      ...base,
      human_turns: [
        { t: "2026-08-25T02:00:00Z", branch: "feat/x", run_end: "2026-08-25T02:00:08Z" },
        { t: "2026-08-25T02:03:00Z", branch: "feat/x", run_end: "2026-08-25T02:33:00Z" }, // AI ran 30 min
        { t: "2026-08-25T02:49:00Z", branch: "main", run_end: "2026-08-25T02:50:00Z" }, // 46 min later: new run
      ],
    };
    expect(sessionIntervalsFor(e)).toEqual([
      { start: "2026-08-25T02:00:00.000Z", end: "2026-08-25T02:13:00.000Z" }, // 02:03 + 10 min cap
      { start: "2026-08-25T02:49:00.000Z", end: "2026-08-25T02:50:00.000Z" }, // watched 1-minute answer
    ]);
  });
  it("a 30-minute autonomous run nobody watched: 10 min full rate, 20 min unattended", () => {
    const e: TelemetryEntry = { ...base, human_turns: [{ t: "2026-08-25T02:03:00Z", run_end: "2026-08-25T02:33:00Z" }, { t: "2026-08-25T02:49:00Z", run_end: "2026-08-25T02:50:00Z" }] };
    expect(unattendedIntervalsFor(e)).toEqual([{ start: "2026-08-25T02:13:00.000Z", end: "2026-08-25T02:33:00.000Z", weight: 0.5 }]);
    expect(unattendedIntervalsFor(base)).toEqual([]);
  });
  it("a watched short run bills in full; a lone prompt with no run_end bills nothing", () => {
    const e: TelemetryEntry = { ...base, human_turns: [{ t: "2026-08-25T02:00:00Z", run_end: "2026-08-25T02:06:00Z" }, { t: "2026-08-25T03:00:00Z" }] };
    expect(sessionIntervalsFor(e)).toEqual([
      { start: "2026-08-25T02:00:00.000Z", end: "2026-08-25T02:06:00.000Z" },
      { start: "2026-08-25T03:00:00.000Z", end: "2026-08-25T03:00:00.000Z" },
    ]);
  });
  it("closes a run after 10 minutes of silence, not 30", () => {
    const e: TelemetryEntry = { ...base, human_turns: [{ t: "2026-08-25T02:00:00Z" }, { t: "2026-08-25T02:09:59Z" }, { t: "2026-08-25T02:20:00Z" }] };
    expect(sessionIntervalsFor(e)).toHaveLength(2);
  });
  it("keeps the legacy all-lines intervals for a pre-1.4.0 recorder", () => {
    expect(sessionIntervalsFor(base)).toEqual([{ start: "2026-08-25T02:00:00Z", end: "2026-08-25T02:50:00Z" }]);
  });
});

describe("humanTurnsFor", () => {
  it("drops malformed turns, normalises empty branch to null and sorts", () => {
    const e = { ...base, human_turns: [{ t: "2026-08-25T02:05:00Z", branch: "" }, { t: "nope" }, { t: "2026-08-25T02:00:00Z", branch: "main" }] } as TelemetryEntry;
    expect(humanTurnsFor(e)).toEqual([
      { t: "2026-08-25T02:00:00Z", branch: "main", runEnd: null },
      { t: "2026-08-25T02:05:00Z", branch: null, runEnd: null },
    ]);
  });
  it("is empty for a legacy entry", () => {
    expect(humanTurnsFor(base)).toEqual([]);
  });
});
