import { companyOs } from "@/kernel/data/supabase";
import { one, type Embedded } from "@/kernel/config/embedded";

// Reads for the admin "Assume" feature (view the client portal as a specific
// client company). Admin surfaces only.

export type AssumableMember = {
  personId: string;
  name: string;
  role: string;
};

export type AssumableClient = {
  companyId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  // Active portal members, so an admin can view as a specific person with that
  // person's real role. Empty for companies with no portal users yet — those
  // fall back to the legacy primary-contact persona (viewed as admin).
  members: AssumableMember[];
};

// Mirrors the admin Clients list (app/admin/(dashboard)/revenue/clients): the
// default set is active clients — lifecycle customer/evangelist, archived
// excluded. `showInactive` drops the lifecycle filter to reveal every
// non-archived company (leads, prospects, churned) so you can assume any of
// them. "View as" still needs a linked contact; startAssumeSession enforces it.
const CLIENT_STAGES = ["customer", "evangelist"];

export async function listAssumableClients(showInactive = false): Promise<AssumableClient[]> {
  let q = companyOs
    .from("companies")
    .select("id, name, person_companies(is_primary, people(full_name, email))")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (!showInactive) q = q.in("lifecycle_stage", CLIENT_STAGES);
  const [{ data }, { data: memberData }] = await Promise.all([
    q,
    companyOs
      .from("portal_members")
      .select("company_id, person_id, role, people!person_id(full_name, email)")
      .eq("status", "active"),
  ]);

  type Row = {
    id: string;
    name: string | null;
    person_companies: { is_primary: boolean; people: Embedded<{ full_name: string | null; email: string }> }[] | null;
  };
  type MemberRow = {
    company_id: string;
    person_id: string;
    role: string;
    people: Embedded<{ full_name: string | null; email: string }>;
  };

  const membersByCompany = new Map<string, AssumableMember[]>();
  for (const m of (memberData ?? []) as MemberRow[]) {
    const person = one(m.people);
    const list = membersByCompany.get(m.company_id) ?? [];
    list.push({
      personId: m.person_id,
      name: person?.full_name || person?.email || "Unknown member",
      role: m.role,
    });
    membersByCompany.set(m.company_id, list);
  }

  return ((data ?? []) as Row[]).map((c) => {
    const links = c.person_companies ?? [];
    const best = links.find((l) => l.is_primary) ?? links[0] ?? null;
    const person = best ? one(best.people) : null;
    return {
      companyId: c.id,
      companyName: c.name || "—",
      contactName: person?.full_name ?? null,
      contactEmail: person?.email ?? null,
      members: (membersByCompany.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
