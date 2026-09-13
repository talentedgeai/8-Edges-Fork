import { describe, expect, it } from "vitest";
import { ROSTERS, buildCheckIn, lineFor, renderCheckIn, type RosterPerson } from "./check-in";
import type { WorkboardCard, WorkboardLane } from "@/entities/boards";

// The composer is where the workflow's promises live: what counts as activity,
// who is chased, who is never chased, and the fact that a person with no cards
// is named rather than dropped (/workflows/daily-check-in-agent/).

const NOW = new Date("2026-09-09T02:30:00Z");
const SINCE = NOW.getTime() - 24 * 60 * 60 * 1000;
const LANES: WorkboardLane[] = [
  { id: "Doing", name: "Doing", isDone: false },
  { id: "Done", name: "Done", isDone: true },
];

function card(over: Partial<WorkboardCard> & { id: string; assignee_id: string | null }): WorkboardCard {
  return {
    title: `card ${over.id}`,
    status: "open",
    laneId: "Doing",
    last_moved_at: "2026-09-01T00:00:00Z",
    comments: [],
    blockers: [],
    subtasks: [],
    ...over,
  } as unknown as WorkboardCard;
}

const person = (over: Partial<RosterPerson> = {}): RosterPerson => ({
  personId: "p1",
  name: "Alice",
  department: "Product Development",
  offReason: null,
  ...over,
});

describe("lineFor", () => {
  it("counts a card moved inside the window as activity, and a done card as done", () => {
    const line = lineFor(
      person(),
      [card({ id: "a", assignee_id: "p1", laneId: "Done", status: "done", last_moved_at: "2026-09-09T01:00:00Z" })],
      LANES,
      SINCE,
    );
    expect(line.quiet).toBe(false);
    expect(line.done).toEqual(["card a"]);
    expect(line.doing).toEqual([]);
  });

  it("counts a comment as activity even when the card never moved", () => {
    const line = lineFor(
      person(),
      [card({ id: "b", assignee_id: "p1", comments: [{ id: "c", author: "Bo", body: "note", createdAt: "2026-09-09T01:00:00Z" }] })],
      LANES,
      SINCE,
    );
    expect(line.quiet).toBe(false);
  });

  it("marks a person quiet when nothing moved or was said in 24 hours", () => {
    const line = lineFor(person(), [card({ id: "c", assignee_id: "p1" })], LANES, SINCE);
    expect(line.quiet).toBe(true);
    expect(line.doing).toEqual(["card c"]);
  });

  it("names unresolved blockers and ignores resolved ones", () => {
    const line = lineFor(
      person(),
      [
        card({
          id: "d",
          assignee_id: "p1",
          blockers: [
            { id: "1", body: "waiting on API key", assignee_id: null, assignee_name: null, resolved: false },
            { id: "2", body: "old", assignee_id: null, assignee_name: null, resolved: true },
          ],
        }),
      ],
      LANES,
      SINCE,
    );
    expect(line.blockers).toEqual(["card d: waiting on API key"]);
  });

  it("flags a person with no cards instead of dropping them", () => {
    const line = lineFor(person(), [card({ id: "e", assignee_id: "someone-else" })], LANES, SINCE);
    expect(line.noCards).toBe(true);
  });
});

describe("renderCheckIn", () => {
  const roster = ROSTERS[0];

  it("lists the off person under Off and never under Pending", () => {
    const people = [person({ personId: "p1", name: "Alice" }), person({ personId: "p2", name: "Bob", offReason: "annual leave" })];
    const text = renderCheckIn(buildCheckIn(roster, people, [card({ id: "a", assignee_id: "p1" })], LANES, NOW), "Tue 9 Sep");
    expect(text).toContain("Off: Bob (annual leave)");
    expect(text).toContain("Pending: Alice");
    expect(text).not.toContain("Pending: Alice, Bob");
  });

  it("says so plainly when the roster is empty", () => {
    const text = renderCheckIn(buildCheckIn(roster, [], [], LANES, NOW), "Tue 9 Sep");
    expect(text).toContain("Nobody on this roster today.");
  });

  it("caps the titles it names and counts the rest", () => {
    const cards = ["a", "b", "c", "d", "e"].map((id) => card({ id, assignee_id: "p1" }));
    const text = renderCheckIn(buildCheckIn(roster, [person()], cards, LANES, NOW), "Tue 9 Sep");
    expect(text).toContain("+2 more");
  });
});
