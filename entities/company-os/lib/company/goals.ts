import { companyOs } from "@/kernel/data/supabase";
import {
  KR_SELECT,
  OBJECTIVE_SELECT,
  BRAND_LABELS,
  currentQuarter,
  personInitials,
  type KrRow,
  type ObjectiveRow,
} from "@/entities/company-os/lib/company/edges-shared";
import type { ObjectiveGroup, PersonGroup } from "@/entities/company-os/ui/company/TeamGoalsPanel";

// Shared derivation for the Company Goals view (/team/company-goals and the
// admin Company section). Same data as /admin/edges/goals but flattened: the
// company-level objectives with their key results, plus every active employee's
// FAST goals laddered back to the company objective each ultimately serves.
export type ObjectiveWithKrs = ObjectiveRow & { krs: KrRow[] };

export type LadderedPerson = { teamMemberId: string; name: string; avatarUrl: string | null };

export type CompanyGoals = {
  quarter: ReturnType<typeof currentQuarter>;
  tree: ObjectiveWithKrs[];
  initialsById: Record<string, string>;
  ladderedByKr: Record<string, LadderedPerson[]>;
  byPerson: PersonGroup[];
  byObjective: ObjectiveGroup[];
  withGoal: number;
};

export async function getCompanyGoals(): Promise<CompanyGoals> {
  const q = currentQuarter();

  const [objRes, krRes, rosterRes, teamGoalsRes] = await Promise.all([
    // All levels this quarter: company-level objectives render as cards, the
    // lower levels only feed the FAST-goal ladder rollup below.
    companyOs
      .from("objectives")
      .select(OBJECTIVE_SELECT)
      .eq("quarter", q.label)
      .neq("status", "dropped")
      .order("sort_order"),
    companyOs.from("key_results").select(KR_SELECT).order("sort_order"),
    // Employees only: contractors don't carry FAST goals.
    companyOs
      .from("team_members")
      .select(
        "id, people:people!person_id(full_name, preferred_name, avatar_url), coaching_profiles:coaching_profiles!team_member_id(id)",
      )
      .eq("status", "active")
      .neq("employment_type", "contract"),
    companyOs
      .from("goals")
      .select("coaching_profile_id, title, objective_id, key_result_id")
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const objectives = (objRes.data ?? []) as ObjectiveRow[];
  const allKrs = (krRes.data ?? []) as KrRow[];
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const krs = allKrs.filter((kr) => objectiveIds.has(kr.objective_id));
  const companyObjectives = objectives.filter((o) => o.level === "company");
  const companyObjectiveIds = new Set(companyObjectives.map((o) => o.id));
  const krsByObjective = new Map<string, KrRow[]>();
  for (const kr of krs) {
    krsByObjective.set(kr.objective_id, [...(krsByObjective.get(kr.objective_id) ?? []), kr]);
  }
  const tree: ObjectiveWithKrs[] = companyObjectives.map((o) => ({ ...o, krs: krsByObjective.get(o.id) ?? [] }));

  const personIds = Array.from(new Set(tree.flatMap((o) => o.krs.map((kr) => kr.accountable_person_id))));
  const peopleRes = personIds.length
    ? await companyOs.from("people").select("id, full_name").in("id", personIds)
    : { data: [] };
  const initialsById: Record<string, string> = {};
  for (const p of (peopleRes.data ?? []) as { id: string; full_name: string }[]) {
    initialsById[p.id] = personInitials(p.full_name);
  }

  // Every active employee with their FAST goals, laddered into the tree.
  type PersonEmbed = { full_name: string | null; preferred_name: string | null; avatar_url: string | null };
  type ProfileEmbed = { id: string };
  type RosterRow = {
    id: string;
    people: PersonEmbed | PersonEmbed[] | null;
    coaching_profiles: ProfileEmbed | ProfileEmbed[] | null;
  };
  type TeamGoalRow = {
    coaching_profile_id: string;
    title: string;
    objective_id: string | null;
    key_result_id: string | null;
  };
  const many = <T,>(e: T | T[] | null): T[] => (Array.isArray(e) ? e : e ? [e] : []);
  const first = <T,>(e: T | T[] | null): T | null => (Array.isArray(e) ? e[0] ?? null : e);
  const roster = (rosterRes.data ?? []) as unknown as RosterRow[];
  const teamGoals = (teamGoalsRes.data ?? []) as TeamGoalRow[];

  const krLabel = new Map(krs.map((kr) => [kr.id, kr.title] as const));
  const objLabel = new Map(objectives.map((o) => [o.id, o.title] as const));

  // Resolve a goal to the COMPANY objective it ultimately ladders to, or null.
  // A KR resolves to its objective; a lower-level objective rolls up through its
  // parent KR. Anything that doesn't land on a company objective (no ladder, or
  // an orphan) returns null.
  const objById = new Map(objectives.map((o) => [o.id, o] as const));
  const krObjective = new Map(allKrs.map((kr) => [kr.id, kr.objective_id] as const));
  function resolveCompanyObjectiveId(g: TeamGoalRow): string | null {
    let objId: string | null = null;
    if (g.key_result_id) objId = krObjective.get(g.key_result_id) ?? null;
    else if (g.objective_id) objId = g.objective_id;
    for (let guard = 0; objId && guard < 10; guard++) {
      const obj = objById.get(objId);
      if (!obj || obj.level === "company") break;
      objId = obj.parent_kr_id ? krObjective.get(obj.parent_kr_id) ?? null : null;
    }
    return objId && companyObjectiveIds.has(objId) ? objId : null;
  }

  // profile -> the member who owns it (a member may hold more than one profile).
  const profileToMember = new Map<string, { teamMemberId: string; name: string; avatarUrl: string | null }>();
  for (const tm of roster) {
    const person = first(tm.people);
    const name = person?.preferred_name || person?.full_name || "Unknown";
    for (const p of many(tm.coaching_profiles))
      profileToMember.set(p.id, { teamMemberId: tm.id, name, avatarUrl: person?.avatar_url ?? null });
  }

  // Members laddered to each KR, for the avatar stack on the KR row. One entry
  // per member per KR.
  const ladderedByKr: Record<string, LadderedPerson[]> = {};
  for (const g of teamGoals) {
    const krId = g.key_result_id;
    const m = krId ? profileToMember.get(g.coaching_profile_id) : null;
    if (!krId || !m) continue;
    const list = (ladderedByKr[krId] ??= []);
    if (!list.some((x) => x.teamMemberId === m.teamMemberId)) list.push(m);
  }
  for (const list of Object.values(ladderedByKr)) list.sort((a, b) => a.name.localeCompare(b.name));

  // One flat list of resolved goals (only those owned by a roster member), then
  // both groupings derive from it.
  const resolved = teamGoals.flatMap((g) => {
    const m = profileToMember.get(g.coaching_profile_id);
    if (!m) return [];
    const ladder = g.key_result_id
      ? krLabel.get(g.key_result_id) ?? null
      : g.objective_id
        ? objLabel.get(g.objective_id) ?? null
        : null;
    return [{ ...m, goalTitle: g.title, ladder, objId: resolveCompanyObjectiveId(g) }];
  });

  const byPerson: PersonGroup[] = roster
    .map((tm) => {
      const person = first(tm.people);
      return {
        teamMemberId: tm.id,
        name: person?.preferred_name || person?.full_name || "Unknown",
        goals: resolved
          .filter((r) => r.teamMemberId === tm.id)
          .map((r) => ({ title: r.goalTitle, ladder: r.ladder })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const withGoal = byPerson.filter((p) => p.goals.length > 0).length;

  const byObjective: ObjectiveGroup[] = tree.map((o, oi) => ({
    objectiveId: o.id,
    label: `O${oi + 1} · ${o.title}`,
    lineTag: o.brand ?? "company",
    lineLabel: BRAND_LABELS[o.brand ?? "company"],
    items: resolved
      .filter((r) => r.objId === o.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ teamMemberId: r.teamMemberId, name: r.name, goalTitle: r.goalTitle, ladder: r.ladder })),
  }));
  const unaligned = resolved.filter((r) => r.objId === null).sort((a, b) => a.name.localeCompare(b.name));
  if (unaligned.length) {
    byObjective.push({
      objectiveId: null,
      label: "Not yet aligned to a company objective",
      lineTag: "company",
      lineLabel: "",
      items: unaligned.map((r) => ({
        teamMemberId: r.teamMemberId,
        name: r.name,
        goalTitle: r.goalTitle,
        ladder: r.ladder,
      })),
    });
  }

  return { quarter: q, tree, initialsById, ladderedByKr, byPerson, byObjective, withGoal };
}
