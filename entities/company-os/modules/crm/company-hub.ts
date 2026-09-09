// Company-scoped (not actor-scoped) loaders for the Client Hub embedded on the
// admin company 360. Authorization is the admin gate on the page (requireAdmin
// via the layout); these take a companyId directly and never widen scope.

import { companyOs } from "@/kernel/data/supabase";
import { getAssignmentsForCompany } from "@/entities/company-os/lib/staff-assignments";
import type { HubTeam } from "@/entities/company-os/lib/directory-shapes";

// Item ids that already have a live (non-archived) board card, for the roadmap
// editor's "on the board" markers.
export async function getLiveCardItemIds(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data, error: cardsErr } = await companyOs
    .from("tasks")
    .select("subject_id")
    .eq("subject_type", "client_backlog_item")
    .in("subject_id", itemIds)
    .is("archived_at", null);
  if (cardsErr) console.error("[company-os/crm] tasks", cardsErr);
  return new Set(((data ?? []) as { subject_id: string }[]).map((r) => r.subject_id));
}

// Both sides of the account for the Team tab (companyId-scoped mirror of
// getClientTeamForActor).
export async function getCompanyHubTeam(companyId: string): Promise<HubTeam> {
  const [assignments, { data: peopleRows }] = await Promise.all([
    getAssignmentsForCompany(companyId),
    companyOs
      .from("person_companies")
      .select("role, is_primary, people:people!person_id(full_name, email)")
      .eq("company_id", companyId),
  ]);

  const edge8 = assignments
    .filter((a) => a.client_visible)
    .map((a) => ({ name: a.full_name || a.email || "Edge8", roleTitle: a.role_title || a.position_title, email: a.email }));

  const rows = (peopleRows ?? []) as Array<{
    role: string | null;
    is_primary: boolean | null;
    people: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  }>;
  const client = rows
    .map((r) => {
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      return { name: p?.full_name || p?.email || "Unknown", title: r.role, email: p?.email ?? null, isPrimary: !!r.is_primary };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
    .map(({ name, title, email }) => ({ name, title, email }));

  return { edge8, client };
}

// The names a roadmap item can be assigned to: Edge8 people with an active
// staff assignment to the company, as they are shown across the OS (display
// name first). client_backlog_items.who stays free text so every reader keeps
// working; the editors offer this list instead of a blank box (Dave, 2026-09-07).
export async function listAssignableStaff(companyId: string): Promise<string[]> {
  const { data, error } = await companyOs
    .from("staff_assignments")
    .select("team_members!team_member_id(people:people!person_id(display_name, full_name, email))")
    .eq("company_id", companyId)
    .eq("status", "active");
  if (error) {
    console.error("[company-os/company-hub] staff_assignments", error);
    return [];
  }
  type Person = { display_name: string | null; full_name: string | null; email: string | null };
  const names = new Set<string>();
  for (const row of (data ?? []) as unknown[]) {
    const tm = (row as { team_members: { people: Person | Person[] | null } | { people: Person | Person[] | null }[] | null }).team_members;
    const t = Array.isArray(tm) ? tm[0] : tm;
    const p = t ? (Array.isArray(t.people) ? t.people[0] : t.people) : null;
    const name = p?.display_name || p?.full_name || p?.email;
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
