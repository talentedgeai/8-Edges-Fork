import type { WorkboardCard, WorkboardLane } from "@/entities/boards";

// The Daily Check-in Agent's composer (docs: /workflows/daily-check-in-agent/).
// Pure: it turns one roster's people plus the day's Workboard into the text
// that goes to that roster's Lark chat. The cron does the reading and sending,
// so every branch here is testable without a board or a webhook.

// A roster is a set of departments, because that is the only staff grouping the
// data actually carries (company_os.team_directory.team / departments.name).
// Anyone whose department is in no roster gets no check-in rather than being
// swept into the wrong team's post.
export type Roster = { key: "product" | "eo"; label: string; departments: string[] };

export const ROSTERS: Roster[] = [
  { key: "product", label: "Product Team", departments: ["Product Development", "Operations"] },
  { key: "eo", label: "EO", departments: ["EO"] },
];

export type RosterPerson = {
  personId: string;
  name: string;
  department: string | null;
  /** Leave that covers the run date, when the person is off. */
  offReason: string | null;
};

export type CheckInLine = {
  name: string;
  done: string[];
  doing: string[];
  blockers: string[];
  /** No card moved and no comment written inside the window. */
  quiet: boolean;
  noCards: boolean;
  offReason: string | null;
};

export type CheckIn = { roster: Roster; date: string; lines: CheckInLine[] };

const TITLES = 3; // titles named per line before it says "+N more"

function within(iso: string | null | undefined, since: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since;
}

function names(titles: string[]): string[] {
  return titles.length <= TITLES ? titles : [...titles.slice(0, TITLES), `+${titles.length - TITLES} more`];
}

/**
 * One person's three lines. `since` is the start of the activity window
 * (24 hours before the run); a card counts as active when it moved or picked up
 * a comment inside it, whoever did the moving — the workflow counts a move by a
 * colleague as activity too.
 */
export function lineFor(person: RosterPerson, cards: WorkboardCard[], lanes: WorkboardLane[], since: number): CheckInLine {
  const doneLanes = new Set(lanes.filter((l) => l.isDone).map((l) => l.id));
  const mine = cards.filter((c) => c.assignee_id === person.personId);
  const moved = mine.filter((c) => within(c.last_moved_at, since));
  const commented = mine.filter((c) => c.comments.some((m) => within(m.createdAt, since)));
  const done = moved.filter((c) => c.status === "done" || doneLanes.has(c.laneId));
  const doing = mine.filter((c) => c.status !== "done" && !doneLanes.has(c.laneId));
  const blockers = mine.flatMap((c) => c.blockers.filter((b) => !b.resolved).map((b) => `${c.title}: ${b.body}`));
  return {
    name: person.name,
    done: names(done.map((c) => c.title)),
    doing: names(doing.map((c) => c.title)),
    blockers: names(blockers),
    quiet: moved.length === 0 && commented.length === 0,
    noCards: mine.length === 0,
    offReason: person.offReason,
  };
}

export function buildCheckIn(
  roster: Roster,
  people: RosterPerson[],
  cards: WorkboardCard[],
  lanes: WorkboardLane[],
  now: Date,
): CheckIn {
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const date = now.toISOString().slice(0, 10);
  const lines = people.map((p) => lineFor(p, cards, lanes, since));
  return { roster, date, lines };
}

/** The Lark text. Plain text because the incoming webhook takes plain text. */
export function renderCheckIn(checkIn: CheckIn, dateLabel: string): string {
  const { roster, lines } = checkIn;
  const out: string[] = [`Check-in · ${roster.label} · ${dateLabel}`];
  const working = lines.filter((l) => !l.offReason && !l.noCards);
  for (const l of working) {
    out.push("", l.name + (l.quiet ? "  (no card moved in 24h)" : ""));
    out.push(`  Done: ${l.done.join(", ") || "nothing closed"}`);
    out.push(`  Doing: ${l.doing.join(", ") || "nothing open"}`);
    out.push(`  Blockers: ${l.blockers.join("; ") || "none"}`);
  }
  const pending = working.filter((l) => l.quiet).map((l) => l.name);
  const off = lines.filter((l) => l.offReason).map((l) => `${l.name} (${l.offReason})`);
  const noCards = lines.filter((l) => !l.offReason && l.noCards).map((l) => l.name);
  if (pending.length) out.push("", `Pending: ${pending.join(", ")}`);
  if (off.length) out.push("", `Off: ${off.join(", ")}`);
  if (noCards.length) out.push("", `No cards: ${noCards.join(", ")}`);
  if (working.length === 0 && off.length === 0 && noCards.length === 0) out.push("", "Nobody on this roster today.");
  return out.join("\n");
}
