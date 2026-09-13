import { selectTeamDirectory } from "@/entities/org";
import { companyOs } from "@/kernel/data/supabase";
// time_off belongs to the time-off entity; its door hands back the builder so
// the filters below stay here (design §4).
import { selectTimeOff } from "@/entities/time-off";
import { notifyProduct, notifyEo } from "@/kernel/messaging/lark";
import { getWorkboard } from "@/entities/boards";
import { ROSTERS, buildCheckIn, renderCheckIn, type RosterPerson } from "./check-in";

// Steps 03 and 04 of the Daily Check-in Agent (/workflows/daily-check-in-agent/):
// read every person's cards off the Workboard, write one check-in per roster,
// post it to that roster's Lark chat. A failed board read aborts before any
// message, as the workflow's exceptions table requires.
//
// The run lives here rather than in the cron because two callers need it: the
// 09:30 cron and the Run now button on Settings -> Agents. Both record the same
// routine id, so the page shows one history whoever started the run.
const ROUTINE = "/api/cron/daily-check-in/";
const ZONE = "Asia/Ho_Chi_Minh";

const dayIn = (now: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, ...opts }).format(now);

/** The run date and its label in Vietnam time, where the working day is. */
function localDay(now: Date): { date: string; label: string; weekend: boolean } {
  const [d, m, y] = dayIn(now, { day: "2-digit", month: "2-digit", year: "numeric" }).split("/");
  const weekday = dayIn(now, { weekday: "short" });
  return {
    date: `${y}-${m}-${d}`,
    label: dayIn(now, { weekday: "short", day: "numeric", month: "short" }),
    weekend: weekday === "Sat" || weekday === "Sun",
  };
}

/** Active team members with the department the roster split reads. */
async function roster(): Promise<{ people: RosterPerson[]; byMemberId: Map<string, RosterPerson> } | null> {
  const { data, error } = await selectTeamDirectory("id, person_id, full_name, status, department_name")
    .eq("status", "active");
  if (error) {
    console.error("[company-os/daily-check-in] team_directory read failed:", error.message);
    return null;
  }
  const byMemberId = new Map<string, RosterPerson>();
  const people: RosterPerson[] = [];
  for (const r of (data ?? []) as { id: string; person_id: string | null; full_name: string | null; department_name: string | null }[]) {
    if (!r.person_id) continue;
    const person: RosterPerson = {
      personId: r.person_id,
      name: r.full_name || "Unnamed",
      department: r.department_name,
      offReason: null,
    };
    people.push(person);
    byMemberId.set(r.id, person);
  }
  return { people, byMemberId };
}

/** Mark whoever is on approved leave over the run date; they are never chased. */
async function markTimeOff(byMemberId: Map<string, RosterPerson>, date: string): Promise<void> {
  const ids = [...byMemberId.keys()];
  if (ids.length === 0) return;
  const { data, error } = await selectTimeOff("team_member_id, leave_type, start_date, end_date, status")
    .in("team_member_id", ids)
    .in("status", ["approved", "taken"])
    .lte("start_date", date)
    .gte("end_date", date);
  if (error) {
    console.error("[company-os/daily-check-in] time_off read failed:", error.message);
    return;
  }
  for (const row of (data ?? []) as unknown as { team_member_id: string; leave_type: string | null }[]) {
    const person = byMemberId.get(row.team_member_id);
    if (person) person.offReason = (row.leave_type || "leave").replace(/_/g, " ");
  }
}

/**
 * The roster keys already delivered today, gathered from every run on the
 * date rather than only the clean ones. A morning that reached the product
 * chat and failed on EO is recorded as an error run whose result still names
 * `product`, and the re-run has to send EO alone — filtering to status "ok"
 * would hide that and post the product check-in twice.
 */
async function postedToday(date: string): Promise<Set<string>> {
  const { data, error } = await companyOs
    .from("routine_runs")
    .select("id, result, started_at")
    .eq("routine_id", ROUTINE)
    .gte("started_at", `${date}T00:00:00Z`)
    .limit(50);
  const keys = new Set<string>();
  if (error) {
    console.error("[company-os/daily-check-in] routine_runs read failed:", error.message);
    return keys;
  }
  for (const row of (data ?? []) as { result: { posted?: unknown } | null }[]) {
    const posted = row.result?.posted;
    if (!Array.isArray(posted)) continue;
    for (const key of posted) if (typeof key === "string") keys.add(key);
  }
  return keys;
}

const SEND = { product: notifyProduct, eo: notifyEo } as const;

// Named in the failure so the run says what to fix, not just that it broke.
const WEBHOOK_ENV = { product: "LARK_PRODUCT_WEBHOOK_URL", eo: "LARK_EO_WEBHOOK_URL" } as const;

export const DAILY_CHECK_IN_ROUTINE = ROUTINE;

export type CheckInRunResult =
  | { date: string; skipped: string }
  // `posted` rides along on a failure too: a half-delivered morning has to
  // tell the next run which roster already has its check-in.
  | { date?: string; error: string; posted?: string[] }
  | { date: string; posted: string[]; people: Record<string, number>; cards: number };

/**
 * The run's HTTP shape, shared by the 09:30 cron and the Run now button. An
 * error result is a 500 because that is the only thing recordRoutineRun reads
 * to decide a run failed — a 200 carrying an `error` body was filed as "ok",
 * which is how three undelivered mornings looked green on Settings → Agents.
 */
export function checkInResponse(result: CheckInRunResult): Response {
  const failed = "error" in result && result.error;
  return Response.json(result, failed ? { status: 500 } : undefined);
}

/** One check-in run: read, compose, post. Safe to call twice — the second
 *  call on a date that already posted returns `skipped` and sends nothing. */
export async function runDailyCheckIn(now: Date = new Date()): Promise<CheckInRunResult> {
  const { date, label, weekend } = localDay(now);
  if (weekend) return { date, skipped: "weekend" };

  const done = await postedToday(date);
  if (ROSTERS.every((r) => done.has(r.key))) return { date, skipped: "already posted today" };

  const staff = await roster();
  if (!staff) return { error: "team directory read failed" };
  await markTimeOff(staff.byMemberId, date);

  const counts: Record<string, number> = {};
  const pending: { roster: (typeof ROSTERS)[number]; people: RosterPerson[] }[] = [];
  for (const r of ROSTERS) {
    const people = staff.people.filter((p) => p.department && r.departments.includes(p.department));
    counts[r.key] = people.length;
    if (people.length > 0 && !done.has(r.key)) pending.push({ roster: r, people });
  }
  if (pending.length === 0) {
    return { date, skipped: done.size > 0 ? "already posted today" : "no roster had anyone to report on" };
  }

  // The board read is the one that must not half-fail: getWorkboard throws
  // nothing, so an empty board is the signal to abort before any message.
  const board = await getWorkboard({ scope: { kind: "all" } });
  if (board.boards.length === 0) return { date, error: "workboard read returned no boards" };

  const posted: string[] = [];
  const undelivered: string[] = [];
  for (const { roster: r, people } of pending) {
    const text = renderCheckIn(buildCheckIn(r, people, board.cards, board.lanes, now), label);
    // A roster only counts as posted once Lark says it took the message.
    if (await SEND[r.key](text)) posted.push(r.key);
    else undelivered.push(`${r.label} (${WEBHOOK_ENV[r.key]})`);
  }
  if (undelivered.length > 0) {
    return { date, posted, error: `Lark did not accept the check-in for ${undelivered.join(" and ")}` };
  }
  return { date, posted, people: counts, cards: board.cards.length };
}
