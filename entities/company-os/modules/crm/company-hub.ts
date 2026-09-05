// Company-scoped (not actor-scoped) loaders for the Client Hub embedded on the
// admin company 360. Authorization is the admin gate on the page (requireAdmin
// via the layout); these take a companyId directly and never widen scope.

import { companyOs } from "@/kernel/data/supabase";
import { getAssignmentsForCompany } from "@/entities/company-os/lib/staff-assignments";
import type { HubTeam } from "@/entities/team";

// Item ids that already have a live (non-archived) board card, for the roadmap
// editor's "on the board" markers.
export async function getLiveCardItemIds(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data } = await companyOs
    .from("tasks")
    .select("subject_id")
    .eq("subject_type", "client_backlog_item")
    .in("subject_id", itemIds)
    .is("archived_at", null);
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
    .map((a) => ({ name: a.full_name || a.email || "Edge8", roleTitle: a.role_title || a.position_title }));

  const rows = (peopleRows ?? []) as Array<{
    role: string | null;
    is_primary: boolean | null;
    people: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  }>;
  const client = rows
    .map((r) => {
      const p = Array.isArray(r.people) ? r.people[0] : r.people;
      return { name: p?.full_name || p?.email || "Unknown", title: r.role, isPrimary: !!r.is_primary };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
    .map(({ name, title }) => ({ name, title }));

  return { edge8, client };
}
