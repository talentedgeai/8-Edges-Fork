import { describe, expect, it } from "vitest";
import { rowActions, type RowActionState } from "./row-actions";

// One test per row state in doc §C.3's table, plus the two invariants the bar
// must never break: at most one filled control, and the escape hatch always
// present. The subjects are placeholders, never real colleagues — a test that
// names a person would put a person's name in a repository that ships.

const base: RowActionState = {
  profileId: "p1",
  name: "Coachee One",
  proposedOn: null,
  proposedBy: null,
  nextOneOnOneOn: null,
  agendaWritten: false,
  todayISO: "2026-09-22",
  missedOn: null,
  missedMeetingId: null,
  hasHeldOneOnOne: false,
};

const ids = (bar: ReturnType<typeof rowActions>) => bar.quiet.map((a) => a.id);

describe("rowActions", () => {
  it("names the day on the filled button when the member has proposed one", () => {
    const bar = rowActions({ ...base, proposedOn: "2026-09-24", proposedBy: "member" });
    expect(bar.filled?.id).toBe("confirm");
    // "Confirm Thu 24 Sep", not "Confirm": the label carries the decision.
    expect(bar.filled?.label).toContain("24 Sep");
    expect(bar.filled?.href).toBeNull();
    expect(ids(bar)).toEqual(["decline", "open"]);
  });

  it("answers the member's proposal before a booking that passed unmarked", () => {
    const bar = rowActions({
      ...base,
      proposedOn: "2026-09-24",
      proposedBy: "member",
      missedOn: "2026-09-10",
      missedMeetingId: "m1",
    });
    expect(bar.filled?.id).toBe("confirm");
  });

  it("offers Mark it held when a booked day passed without the 1-1 being closed", () => {
    const bar = rowActions({ ...base, missedOn: "2026-09-10", missedMeetingId: "m1" });
    expect(bar.filled?.id).toBe("mark-held");
    expect(bar.filled?.href).toBeNull();
    expect(ids(bar)).toEqual(["rebook", "open"]);
  });

  it("does not offer Mark it held without the meeting row it would write", () => {
    // The roster can know a day passed and still not have the booking's id, and
    // an action with nothing to write is worse than no action at all.
    const bar = rowActions({ ...base, missedOn: "2026-09-10", nextOneOnOneOn: "2026-09-23" });
    expect(bar.filled?.id).toBe("write-agenda");
  });

  it("asks for the agenda when the next 1-1 is within the lead window and nothing is written", () => {
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-24" });
    expect(bar.filled?.id).toBe("write-agenda");
    expect(bar.filled?.href).toBe("/team/coaching/p1?tab=next");
  });

  it("fills nothing for a booked 1-1 still far off, and keeps the prep reachable", () => {
    // The help list only mentions a blank agenda two days out; a row that
    // shouted "Write the agenda" thirteen days out contradicted it.
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-10-05" });
    expect(bar.filled).toBeNull();
    expect(bar.quiet[0]?.id).toBe("open-prep");
  });

  it("opens the prep when the booked 1-1 already carries an agenda", () => {
    const bar = rowActions({ ...base, nextOneOnOneOn: "2026-09-24", agendaWritten: true });
    expect(bar.filled?.id).toBe("open-prep");
  });

  it("asks the coach to propose a day when there is no date at all", () => {
    expect(rowActions(base).filled?.id).toBe("propose");
  });

  it("fills nothing while the coach's own proposal is with the member", () => {
    const bar = rowActions({ ...base, proposedOn: "2026-09-24", proposedBy: "coach" });
    expect(bar.filled).toBeNull();
    expect(ids(bar)).toEqual(["open"]);
  });

  it("adds Last recap only once a 1-1 has been held", () => {
    expect(ids(rowActions({ ...base, hasHeldOneOnOne: true }))).toEqual(["last-recap", "open"]);
  });

  it("always ends the bar with the person's own page", () => {
    const states: RowActionState[] = [
      base,
      { ...base, nextOneOnOneOn: "2026-09-24" },
      { ...base, missedOn: "2026-09-10", missedMeetingId: "m1" },
      { ...base, proposedOn: "2026-09-24", proposedBy: "member" },
      { ...base, proposedOn: "2026-09-24", proposedBy: "coach" },
    ];
    for (const s of states) {
      const bar = rowActions(s);
      const last = bar.quiet[bar.quiet.length - 1];
      expect(last.id).toBe("open");
      expect(last.label).toBe("Open Coachee One");
      expect(last.href).toBe("/team/coaching/p1?tab=next");
      // "One dominant element", per row: never two filled controls.
      expect(bar.quiet.filter((a) => a.id === bar.filled?.id)).toHaveLength(0);
    }
  });
});

// BH-2: the coach's side of L.2. The member's page stayed quiet about a 1-1
// missed over a holiday; the coach's roster did not — and the coach is the one
// who might chase.
describe("a 1-1 missed while the person was away", () => {
  const AWAY = [{ startDate: "2026-09-21", endDate: "2026-09-23" }];
  const base = {
    profileId: "p1",
    name: "Robin",
    proposedOn: null,
    proposedBy: null,
    nextOneOnOneOn: null,
    agendaWritten: false,
    todayISO: "2026-09-28",
    missedOn: "2026-09-23",
    missedMeetingId: "m1",
    hasHeldOneOnOne: true,
  };

  it("leads with Rebook, not Mark it held", () => {
    // "Mark it held" as the one filled action would be the page asking a coach
    // to record a holiday as a meeting.
    const bar = rowActions({ ...base, leave: AWAY });
    expect(bar.filled?.id).toBe("rebook");
    expect(bar.quiet.map((q) => q.id)).toContain("mark-held");
  });

  it("still leads with Mark it held when the day was a working day", () => {
    const bar = rowActions({ ...base, leave: [] });
    expect(bar.filled?.id).toBe("mark-held");
  });

  it("behaves exactly as before for a caller that passes no leave", () => {
    const { leave: _drop, ...noLeave } = { ...base, leave: undefined };
    expect(rowActions(noLeave).filled?.id).toBe("mark-held");
  });
});
