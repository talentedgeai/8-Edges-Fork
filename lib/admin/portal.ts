import { companyOs } from "@/lib/supabase";

// Admin-side reads for client-portal membership (company_os.portal_members).
// Admin surfaces only — /portal itself reads through lib/portal/data.ts.

export type PortalMembershipRow = {
  id: string;
  person_id: string;
  company_id: string | null;
  role: string;
  status: string;
  invited_at: string | null;
};

export async function getPortalMembershipsForCompany(
  companyId: string,
): Promise<Map<string, PortalMembershipRow>> {
  const { data } = await companyOs
    .from("portal_members")
    .select("id, person_id, company_id, role, status, invited_at")
    .eq("company_id", companyId);
  const byPerson = new Map<string, PortalMembershipRow>();
  for (const row of (data ?? []) as PortalMembershipRow[]) byPerson.set(row.person_id, row);
  return byPerson;
}

export async function getPortalMembershipsForPerson(
  personId: string,
): Promise<PortalMembershipRow[]> {
  const { data } = await companyOs
    .from("portal_members")
    .select("id, person_id, company_id, role, status, invited_at")
    .eq("person_id", personId);
  return (data ?? []) as PortalMembershipRow[];
}
