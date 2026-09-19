import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The daily and hourly coaching routines against a scripted Supabase client.
// The fake is the one from entities/coaching/lib/ai.test.ts: every table
// carries a queue of responses, consumed one per awaited query, and every
// call is recorded so a test can assert what was and was not asked.
//
// Three behaviours are pinned here because production proved them wrong on
// 2026-09-16: the hourly drafter filtered on the retired transcript column
// and drafted nothing in 141 runs (K.1); the mid-cycle check-in and the trend
// refresh ran for paused profiles (K.3, B7).

type Response = { data?: unknown; error?: { message: string } | null; count?: number };
const scripts = new Map<string, Response[]>();
const calls: { table: string; ops: string[]; payloads: unknown[] }[] = [];

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const record = { table, ops: [] as string[], payloads: [] as unknown[] };
  calls.push(record);
  const respond = () => {
    const next = (scripts.get(table) ?? []).shift();
    return { data: next?.data ?? null, error: next?.error ?? null, count: next?.count ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "not", "or", "gte", "lte", "lt", "order", "limit", "range", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
const listRecentMinutes = vi.fn(async () => [] as { token: string; title: string | null; startTime: string | null }[]);
const sendLarkDm = vi.fn(async () => true);
vi.mock("@/kernel/messaging/lark-api", () => ({
  fetchMinutesTranscript: vi.fn(async () => null),
  larkConfigured: () => true,
  listRecentMinutes: (...a: unknown[]) => listRecentMinutes(...(a as [])),
  sendLarkDm: (...a: unknown[]) => sendLarkDm(...(a as [])),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.test" }));

const transcripts = new Map<string, string>();
vi.mock("@/entities/coaching/lib/transcript", () => ({
  readCoachingTranscript: vi.fn(async (meetingId: string | null) => (meetingId ? transcripts.get(meetingId) ?? null : null)),
  saveCoachingTranscript: vi.fn(async () => ({ ok: true, meetingId: "m" })),
}));

const summarizeMeeting = vi.fn(async () => ({ ok: true as const }));
const generateTrendReport = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/entities/coaching/lib/ai", () => ({
  summarizeMeeting: (...a: unknown[]) => summarizeMeeting(...(a as [])),
  generateTrendReport: (...a: unknown[]) => generateTrendReport(...(a as [])),
  generatePrep: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/entities/coaching/lib/markdown", () => ({ coachingMarkdownToHtml: async (s: string) => `<p>${s}</p>` }));

import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { midCycleCheckin, refreshTrendReport, type CoachingRunSummary } from "./cycle";
import { autoDetectMinutes } from "./cycle-minutes";
import { missedHold } from "./cycle-missed";
import { runAdoptionWatch } from "./adoption";
import { draftNextPendingRecap } from "./recap-drafter";

const PROFILE_EMBED = {
  id: "p1",
  coach_id: "coach-1",
  cadence_days: 14,
  next_one_on_one_on: null,
  one_on_ones_paused_at: null,
  team_members: { status: "active", people: { full_name: "Khoa", preferred_name: null, email: "khoa@example.test" } },
};

function freshSummary(): CoachingRunSummary {
  return { date: "2026-09-16", profiles: 1, prepsGenerated: 0, datesRolled: 0, checkinsSent: 0, trendsGenerated: 0, minutesMatched: 0, minutesUnmatched: 0, minutesAmbiguous: 0, transcriptsPulled: 0, recapsDrafted: 0, adoptionNudges: 0, missedStamped: 0 };
}

describe("draftNextPendingRecap", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
    transcripts.clear();
    summarizeMeeting.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("drafts the oldest held 1-1 whose transcript lives on the linked meeting", async () => {
    script("coaching_profiles", { data: [PROFILE_EMBED] });
    script("coaching_one_on_ones", {
      data: [
        { id: "o-old", coaching_profile_id: "p1", held_on: "2026-09-10", meeting_id: "m-old" },
        { id: "o-new", coaching_profile_id: "p1", held_on: "2026-09-15", meeting_id: "m-new" },
      ],
    });
    script("team_members", { data: [{ id: "coach-1", people: { full_name: "Dave", preferred_name: null, email: "dave@example.test" } }] });
    transcripts.set("m-old", "coach: hello\nmember: hi");
    transcripts.set("m-new", "coach: again");

    const res = await draftNextPendingRecap("2026-09-16");

    expect(summarizeMeeting).toHaveBeenCalledWith("o-old");
    expect(res).toMatchObject({ drafted: true, meetingId: "o-old", pendingAfter: 1 });
    const pending = calls.find((c) => c.table === "coaching_one_on_ones");
    // The retired column is no longer a filter; the transcript is read per row.
    expect(pending?.ops).not.toContain("not");
  });

  it("skips a held 1-1 that has no transcript anywhere and reports nothing pending", async () => {
    script("coaching_profiles", { data: [PROFILE_EMBED] });
    script("coaching_one_on_ones", {
      data: [{ id: "o-bare", coaching_profile_id: "p1", held_on: "2026-09-15", meeting_id: "m-bare" }],
    });

    const res = await draftNextPendingRecap("2026-09-16");

    expect(summarizeMeeting).not.toHaveBeenCalled();
    expect(res).toEqual({ drafted: false, pendingAfter: 0 });
  });

});

// 2026-09-18 is four days after 2026-09-14, the window the pre-meeting nudge
// fires in (K.15).
const PAUSED = {
  id: "p1",
  coach_id: "coach-1",
  cadence_days: 14,
  next_one_on_one_on: "2026-09-18",
  paused: true,
  memberName: "Khoa",
  memberEmail: "khoa@example.test",
  preferred_weekday: null,
  preferred_time: null,
};

describe("the pre-meeting nudge", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
    generateTrendReport.mockClear();
    sendLarkDm.mockClear();
  });

  it("leaves a paused profile alone", async () => {
    const summary = freshSummary();
    await midCycleCheckin(PAUSED, undefined, "2026-09-01", "2026-09-14", summary);
    expect(calls).toEqual([]);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(summary.checkinsSent).toBe(0);
  });

  it("gets no trend refresh while paused", async () => {
    const summary = freshSummary();
    await refreshTrendReport(PAUSED, summary);
    expect(calls).toEqual([]);
    expect(generateTrendReport).not.toHaveBeenCalled();
  });

  it("sends one link-only message four days out and opens the cycle's row", async () => {
    script("coaching_checkins", { data: [] }); // nothing sent this cycle yet
    script("coaching_checkins", { data: null, error: null }); // the insert
    const summary = freshSummary();

    await midCycleCheckin(
      { ...PAUSED, paused: false },
      { name: "Dave", email: "dave@example.test" },
      "2026-09-01",
      "2026-09-14",
      summary,
    );

    const insert = calls.filter((c) => c.table === "coaching_checkins").find((c) => c.ops.includes("insert"));
    // The row carries no message: the form the member fills is what it is for.
    expect(insert?.payloads[0]).toEqual([
      expect.objectContaining({ coaching_profile_id: "p1", sent_at: expect.any(String) }),
    ]);
    expect(insert?.payloads[0]).not.toEqual([expect.objectContaining({ message_markdown: expect.anything() })]);
    const [email, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(email).toBe("khoa@example.test");
    expect(text).toBe(
      "Friday's 1-1 with Dave: 90 seconds to set the agenda. https://example.test/team/my-coaching?tab=my",
    );
    expect(summary.checkinsSent).toBe(1);
  });

  it("names the time in the nudge once the member has set one (K.34)", async () => {
    script("coaching_checkins", { data: [] });
    script("coaching_checkins", { data: null, error: null });
    const summary = freshSummary();
    await midCycleCheckin(
      { ...PAUSED, paused: false, preferred_time: "15:00:00" },
      { name: "Dave", email: "dave@example.test" },
      "2026-09-01",
      "2026-09-14",
      summary,
    );
    const [, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(text.startsWith("Friday 15:00's 1-1 with Dave:")).toBe(true);
  });

  it("sends nothing twice: a row already stamped this cycle is the idempotence", async () => {
    script("coaching_checkins", { data: [{ id: "ck-1" }] });
    const summary = freshSummary();

    await midCycleCheckin({ ...PAUSED, paused: false }, undefined, "2026-09-01", "2026-09-14", summary);

    expect(calls.some((c) => c.table === "coaching_checkins" && c.ops.includes("insert"))).toBe(false);
    expect(sendLarkDm).not.toHaveBeenCalled();
    expect(summary.checkinsSent).toBe(0);
  });

  it("stays quiet earlier than four days out", async () => {
    const summary = freshSummary();
    await midCycleCheckin({ ...PAUSED, paused: false }, undefined, "2026-09-01", "2026-09-10", summary);
    expect(calls).toEqual([]);
    expect(summary.checkinsSent).toBe(0);
  });
});

// K.5 and B5: the trend report is keyed by the latest summarised 1-1 rather
// than by its month, so a second 1-1 inside one month refreshes it; and it is
// stored for the coach page without an email or a Lark DM, because a report
// nobody asked for is not news.
describe("refreshTrendReport", () => {
  const ACTIVE = { ...PAUSED, paused: false };

  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
    generateTrendReport.mockClear();
    vi.mocked(sendTransactionalEmail).mockClear();
    sendLarkDm.mockClear();
  });

  it("skips a profile whose latest summarised 1-1 already has a trends row", async () => {
    script("coaching_one_on_ones", {
      data: [
        { id: "o-latest", held_on: "2026-09-15" },
        { id: "o-prior", held_on: "2026-09-01" },
      ],
    });
    script("coaching_trends", { data: [{ report_markdown: "already written" }] });

    const summary = freshSummary();
    await refreshTrendReport(ACTIVE, summary);

    const trendQuery = calls.find((c) => c.table === "coaching_trends");
    // Keyed by the 1-1, not by its month: a month key made the second 1-1 in
    // September find the first one's row and skip forever.
    expect(trendQuery?.payloads).toContainEqual(["one_on_one_id", "o-latest"]);
    expect(trendQuery?.payloads.some((a) => Array.isArray(a) && a[0] === "period")).toBe(false);
    expect(generateTrendReport).not.toHaveBeenCalled();
    expect(summary.trendsGenerated).toBe(0);
  });

  it("generates for a new latest 1-1 in a month that already has an older report, and sends nothing", async () => {
    script("coaching_one_on_ones", {
      data: [
        { id: "o-second-this-month", held_on: "2026-09-15" },
        { id: "o-first-this-month", held_on: "2026-09-02" },
      ],
    });
    script("coaching_trends", { data: [] });

    const summary = freshSummary();
    await refreshTrendReport(ACTIVE, summary);

    expect(generateTrendReport).toHaveBeenCalledWith("p1");
    expect(summary.trendsGenerated).toBe(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(sendLarkDm).not.toHaveBeenCalled();
  });
});

// K.9: the weekly adoption watch. 2026-09-14 is a Monday; the step is a no-op
// on every other weekday, which is what makes "once a week" true without a
// per-coach stamp.
const ROSTER = [
  { id: "p1", coach_id: "coach-1", cadence_days: 14, next_one_on_one_on: "2026-09-20", paused: false, preferred_weekday: null, preferred_time: null, memberName: "My", memberEmail: "my@example.test" },
  { id: "p2", coach_id: "coach-1", cadence_days: 14, next_one_on_one_on: null, paused: false, preferred_weekday: null, preferred_time: null, memberName: "Mai", memberEmail: "mai@example.test" },
  { id: "p3", coach_id: "coach-2", cadence_days: 14, next_one_on_one_on: null, paused: false, preferred_weekday: null, preferred_time: null, memberName: "Viha", memberEmail: "viha@example.test" },
];
const COACHES = new Map([
  ["coach-1", { name: "Dave", email: "dave@example.test" }],
  ["coach-2", { name: "Thanh", email: "thanh@example.test" }],
]);

describe("runAdoptionWatch", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
    sendLarkDm.mockClear();
  });

  it("DMs a coach once with every member past cadence, and leaves the coach who is current alone", async () => {
    script("coaching_one_on_ones", {
      data: [
        { coaching_profile_id: "p1", held_on: "2026-08-01" }, // 44 days: overdue
        { coaching_profile_id: "p2", held_on: "2026-08-20" }, // 25 days: overdue
        { coaching_profile_id: "p3", held_on: "2026-09-10" }, // 4 days: current
      ],
    });
    script("coaching_profiles", {
      data: [
        { id: "p1", created_at: "2026-01-01T00:00:00Z" },
        { id: "p2", created_at: "2026-01-01T00:00:00Z" },
        { id: "p3", created_at: "2026-01-01T00:00:00Z" },
      ],
    });

    const sent = await runAdoptionWatch(ROSTER, COACHES, "https://example.test", "2026-09-14");

    expect(sent).toBe(1);
    expect(sendLarkDm).toHaveBeenCalledTimes(1);
    const [email, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(email).toBe("dave@example.test");
    expect(text).toContain("My: 44 days");
    expect(text).toContain("Mai: 25 days");
    expect(text).not.toContain("Viha");
  });

  it("does nothing on a day that is not a Monday", async () => {
    const sent = await runAdoptionWatch(ROSTER, COACHES, "https://example.test", "2026-09-16");
    expect(sent).toBe(0);
    expect(calls).toEqual([]);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });

  it("nudges a coach whose roster is older than thirty days and has never had a 1-1", async () => {
    script("coaching_one_on_ones", { data: [] });
    script("coaching_profiles", { data: [{ id: "p3", created_at: "2026-06-01T00:00:00Z" }] });

    const sent = await runAdoptionWatch([ROSTER[2]], COACHES, "https://example.test", "2026-09-14");

    expect(sent).toBe(1);
    const [email, text] = sendLarkDm.mock.calls[0] as unknown as [string, string];
    expect(email).toBe("thanh@example.test");
    expect(text).toContain("no 1-1 yet");
  });

  it("leaves a roster younger than thirty days alone", async () => {
    script("coaching_one_on_ones", { data: [] });
    script("coaching_profiles", { data: [{ id: "p3", created_at: "2026-09-07T00:00:00Z" }] });

    const sent = await runAdoptionWatch([ROSTER[2]], COACHES, "https://example.test", "2026-09-14");

    expect(sent).toBe(0);
    expect(sendLarkDm).not.toHaveBeenCalled();
  });
});

// K.10: the title heuristic is a suggestion, not an identification.
describe("autoDetectMinutes", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
    listRecentMinutes.mockClear();
  });

  it("writes nothing and counts the Minutes when two active profiles share the first name", async () => {
    listRecentMinutes.mockResolvedValueOnce([
      { token: "tok-1", title: "1-1 Minh / Dave", startTime: "2026-09-15T02:00:00.000Z" },
    ]);
    const summary = freshSummary();

    await autoDetectMinutes(
      [
        { ...ROSTER[0], id: "pa", memberName: "Minh Nguyen" },
        { ...ROSTER[0], id: "pb", memberName: "Minh Tran" },
      ],
      summary,
    );

    expect(summary.minutesAmbiguous).toBe(1);
    expect(summary.minutesMatched).toBe(0);
    expect(calls).toEqual([]);
  });

  it("counts a 1-1 recording that matches nobody", async () => {
    listRecentMinutes.mockResolvedValueOnce([
      { token: "tok-2", title: "1-1 with a client", startTime: "2026-09-15T02:00:00.000Z" },
    ]);
    const summary = freshSummary();

    await autoDetectMinutes([ROSTER[0]], summary);

    expect(summary.minutesUnmatched).toBe(1);
    expect(calls).toEqual([]);
  });
});

// K.36: a booking whose day went by is stamped once and holds the roll-forward
// while its grace window is open, so the meeting is still there to answer for.
describe("missedHold", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  // Only the three fields missedHold reads; the rest of ProfileRow is irrelevant.
  const profile = (next: string | null, paused = false) =>
    ({ id: "p1", paused, next_one_on_one_on: next }) as unknown as Parameters<typeof missedHold>[0];
  const summary = () => ({ missedStamped: 0 });

  it("stamps a booking whose day has passed and holds the roll", async () => {
    script("coaching_one_on_ones", { data: { id: "m1", status: "scheduled", missed_at: null } }, { data: null });
    const s = summary();
    expect(await missedHold(profile("2026-09-16"), "2026-09-17", s)).toBe(true);
    expect(s.missedStamped).toBe(1);
    expect(calls.some((c) => c.ops.includes("update"))).toBe(true);
  });

  it("stamps only once", async () => {
    script("coaching_one_on_ones", { data: { id: "m1", status: "scheduled", missed_at: "2026-09-17T01:00:00Z" } });
    const s = summary();
    expect(await missedHold(profile("2026-09-16"), "2026-09-17", s)).toBe(true);
    expect(s.missedStamped).toBe(0);
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("lets the roll through once the grace window has closed", async () => {
    script("coaching_one_on_ones", { data: { id: "m1", status: "scheduled", missed_at: "2026-09-17T01:00:00Z" } });
    expect(await missedHold(profile("2026-09-16"), "2026-09-25", summary())).toBe(false);
  });

  it("says nothing about a date that has not passed, or a paused profile", async () => {
    expect(await missedHold(profile("2026-09-20"), "2026-09-17", summary())).toBe(false);
    expect(await missedHold(profile("2026-09-01", true), "2026-09-17", summary())).toBe(false);
    expect(calls.length).toBe(0);
  });

  // A stale profile date with no row behind it is not a meeting anybody failed
  // to hold, so it rolls as it always did.
  it("rolls as before when no row sits on the date", async () => {
    script("coaching_one_on_ones", { data: null });
    expect(await missedHold(profile("2026-09-16"), "2026-09-17", summary())).toBe(false);
  });
});
