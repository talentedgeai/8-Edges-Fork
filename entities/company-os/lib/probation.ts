// Probation tracking: the people on probation, how long they have left, and who
// reviews them. Powers the admin surface and the daily cron that nudges managers
// two weeks before probation ends.

import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";

export type ProbationRow = {
  teamMemberId: string;
  personId: string | null;
  name: string;
  position: string | null;
  department: string | null;
  startDate: string | null;
  endsOn: string | null;
  daysLeft: number | null;
  managerName: string | null;
  managerEmail: string | null;
};

type NameEmail = { full_name: string | null; preferred_name: string | null; email: string | null };
const displayName = (n: NameEmail | null) => (n ? n.preferred_name || n.full_name || n.email : null);

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISO + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

// Batch-resolve managers by their team_members id (forward lookup — never the
// reverse-resolving PostgREST embed on the self-referencing manager_id FK).
async function resolveManagers(ids: string[]): Promise<Map<string, NameEmail>> {
  const map = new Map<string, NameEmail>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data } = await companyOs
    .from("team_members")
    .select("id, people:people!person_id(full_name, preferred_name, email)")
    .in("id", unique);
  for (const r of (data ?? []) as Array<{ id: string; people: NameEmail | NameEmail[] | null }>) {
    const person = Array.isArray(r.people) ? r.people[0] ?? null : r.people;
    if (person) map.set(r.id, person);
  }
  return map;
}

// `todayISO` (YYYY-MM-DD, Saigon date) is passed so the caller controls the
// reference day — the route computes it, keeping this function pure of clocks.
export async function getProbationRows(todayISO: string): Promise<ProbationRow[]> {
  const { data } = await companyOs
    .from("team_members")
    .select(
      "id, person_id, start_date, probation_ends_on, manager_id, " +
        "people:people!person_id(full_name, preferred_name), " +
        "positions:positions!position_id(title), " +
        "departments:departments!department_id(name)",
    )
    .eq("employment_stage", "probation")
    .in("status", ["active", "pre_start", "on_leave"]);

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const managers = await resolveManagers(
    rows.map((r) => r.manager_id as string | null).filter((x): x is string => !!x),
  );

  return rows
    .map((r): ProbationRow => {
      const person = one(r.people as NameEmail | NameEmail[] | null);
      const pos = one(r.positions as { title: string | null } | { title: string | null }[] | null);
      const dept = one(r.departments as { name: string | null } | { name: string | null }[] | null);
      const mgr = r.manager_id ? managers.get(r.manager_id as string) ?? null : null;
      const endsOn = (r.probation_ends_on as string | null) ?? null;
      return {
        teamMemberId: r.id as string,
        personId: (r.person_id as string | null) ?? null,
        name: displayName(person) ?? "—",
        position: pos?.title ?? null,
        department: dept?.name ?? null,
        startDate: (r.start_date as string | null) ?? null,
        endsOn,
        daysLeft: endsOn ? daysBetween(todayISO, endsOn) : null,
        managerName: displayName(mgr),
        managerEmail: mgr?.email ?? null,
      };
    })
    .sort((a, b) => (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999"));
}
