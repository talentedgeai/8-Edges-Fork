import { companyOs } from "@/lib/supabase";
import { one, type Embedded } from "@/lib/embedded";

// Reads for company_os.staff_assignments — the client-company -> dedicated-staff
// relation (docs/plans/2026-07-11-client-portal-design.md). Admin surfaces only;
// /portal reads through lib/portal/data.ts instead.

// Client-visible role titles offered in the assign dropdown. Curated so the
// label a client sees on their team is consistent; edit this list to change it.
export const ASSIGNMENT_ROLES = [
  "AI Officer",
  "AI Engineer",
  "Database Specialist",
  "Solutions Architect",
  "Project Lead",
  "Account Manager",
  "Designer",
  "QA Specialist",
] as const;

export type AssignmentForCompany = {
  id: string;
  team_member_id: string;
  role_title: string | null;
  // Person at the client who approves this placement's leave (null = the
  // Edge8 manager keeps it). See lib/time-off/approver.ts.
  client_manager_person_id: string | null;
  client_manager_name: string | null;
  client_visible: boolean;
  start_date: string | null;
  end_date: string | null;
  status: string;
  full_name: string | null;
  email: string | null;
  position_title: string | null;
};

export type AssignmentForTeamMember = {
  id: string;
  company_id: string;
  company_name: string | null;
  role_title: string | null;
  client_manager_person_id: string | null;
  client_manager_name: string | null;
  client_visible: boolean;
  start_date: string | null;
  end_date: string | null;
  status: string;
};

export async function getAssignmentsForCompany(companyId: string): Promise<AssignmentForCompany[]> {
  const { data } = await companyOs
    .from("staff_assignments")
    .select(
      "id, team_member_id, role_title, client_visible, start_date, end_date, status, client_manager_person_id, " +
        "client_manager:people!client_manager_person_id(full_name, email), " +
        "team_members!team_member_id(people:people!person_id(full_name, email), positions:positions!position_id(title))",
    )
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const tm = one(r.team_members as Embedded<Record<string, unknown>>);
    const person = tm ? one(tm.people as Embedded<{ full_name: string | null; email: string }>) : null;
    const position = tm ? one(tm.positions as Embedded<{ title: string | null }>) : null;
    const clientManager = one(
      r.client_manager as Embedded<{ full_name: string | null; email: string }>,
    );
    return {
      id: r.id as string,
      team_member_id: r.team_member_id as string,
      role_title: (r.role_title as string | null) ?? null,
      client_manager_person_id: (r.client_manager_person_id as string | null) ?? null,
      client_manager_name: clientManager?.full_name ?? clientManager?.email ?? null,
      client_visible: (r.client_visible as boolean | null) ?? true,
      start_date: (r.start_date as string | null) ?? null,
      end_date: (r.end_date as string | null) ?? null,
      status: r.status as string,
      full_name: person?.full_name ?? null,
      email: person?.email ?? null,
      position_title: position?.title ?? null,
    };
  });
}

export async function getAssignmentsForTeamMember(teamMemberId: string): Promise<AssignmentForTeamMember[]> {
  const { data } = await companyOs
    .from("staff_assignments")
    .select(
      "id, company_id, role_title, client_visible, start_date, end_date, status, client_manager_person_id, " +
        "companies:companies!company_id(name), client_manager:people!client_manager_person_id(full_name, email)",
    )
    .eq("team_member_id", teamMemberId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const company = one(r.companies as Embedded<{ name: string | null }>);
    const clientManager = one(
      r.client_manager as Embedded<{ full_name: string | null; email: string }>,
    );
    return {
      id: r.id as string,
      company_id: r.company_id as string,
      company_name: company?.name ?? null,
      role_title: (r.role_title as string | null) ?? null,
      client_manager_person_id: (r.client_manager_person_id as string | null) ?? null,
      client_manager_name: clientManager?.full_name ?? clientManager?.email ?? null,
      client_visible: (r.client_visible as boolean | null) ?? true,
      start_date: (r.start_date as string | null) ?? null,
      end_date: (r.end_date as string | null) ?? null,
      status: r.status as string,
    };
  });
}

export type CompanyOption = { id: string; name: string | null };

// Companies eligible to receive a staff assignment: active customers only
// (assigning staff to a lead/prospect makes no sense). Small list; the admin
// UI renders it as a plain <select>.
export async function listAssignableCompanies(): Promise<CompanyOption[]> {
  const { data } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .eq("lifecycle_stage", "customer")
    .order("name", { ascending: true });
  return (data ?? []) as CompanyOption[];
}

export type TeamMemberOption = { id: string; name: string };

export async function listActiveTeamMembers(): Promise<TeamMemberOption[]> {
  const { data } = await companyOs
    .from("team_members")
    .select("id, people!person_id(full_name, email)")
    .eq("status", "active");
  return ((data ?? []) as { id: string; people: Embedded<{ full_name: string | null; email: string }> }[])
    .map((t) => ({ id: t.id, name: one(t.people)?.full_name || one(t.people)?.email || "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ClientContactOption = { id: string; name: string };

// People at the client, for the "approves leave" picker. Sourced from the CRM
// link (person_companies), not from portal_members: naming someone approver is
// a record of who manages the placement, and does not by itself hand them a
// portal login.
export async function listClientContacts(companyId: string): Promise<ClientContactOption[]> {
  const { data } = await companyOs
    .from("person_companies")
    .select("person_id, people!person_id(full_name, email, archived_at)")
    .eq("company_id", companyId);

  return ((data ?? []) as unknown[])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const p = one(r.people as Embedded<{ full_name: string | null; email: string; archived_at: string | null }>);
      if (!p || p.archived_at) return null;
      return { id: r.person_id as string, name: p.full_name || p.email };
    })
    .filter((o): o is ClientContactOption => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
