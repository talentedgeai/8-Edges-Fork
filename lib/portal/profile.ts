// Account section: the signed-in person's own profile, and their company's
// profile. Two different trust levels, deliberately kept in one file so the
// difference is impossible to miss:
//
//   personal  self-scoped. The person id comes from the JWT-derived actor,
//             never from the client, so a caller can only ever read or write
//             their own company_os.people row. Every role may do this.
//   company   admin-only, per company (lib/portal/roles.ts). Non-admins never
//             see the nav item and a direct visit 404s. Only the client-owned
//             fields are writable here: Edge8-internal CRM columns (priority,
//             lifecycle_stage, notes, owner, client_types) are never exposed.
//
// Company writes are audit-logged like the admin surface, so a client-side edit
// to a shared CRM row is always attributable.

import { companyOs } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import { isPortalAdmin, ROLE_DENIED } from "@/lib/portal/roles";
import { recordAudit } from "@/lib/admin/audit";

type Result = { ok: true } | { ok: false; error: string };

const MAX_LEN = 400;
const clean = (v: string | undefined): string | null => (v?.trim() ? v.trim() : null);

function tooLong(input: Record<string, string>): boolean {
  return Object.values(input).some((v) => typeof v === "string" && v.length > MAX_LEN);
}

/* ---------------------------------- personal --------------------------------- */

export type PersonalProfile = {
  fullName: string;
  preferredName: string;
  phone: string;
  jobTitle: string;
  city: string;
  stateProvince: string;
  country: string;
  timezone: string;
  linkedinUrl: string;
};

export type PersonalProfileView = PersonalProfile & {
  email: string; // identity, read-only
  memberships: Array<{ companyName: string; role: string }>;
};

// Job title lives on the CRM link (person_companies), not on the person, so it
// is only editable when the actor has exactly one company. With more than one,
// the title is ambiguous and Edge8 maintains it.
async function titleLink(actor: PortalActor): Promise<{ id: string; title: string | null } | null> {
  if (actor.companyScope.length !== 1) return null;
  const { data } = await companyOs
    .from("person_companies")
    .select("id, title")
    .eq("person_id", actor.personId)
    .eq("company_id", actor.companyScope[0])
    .limit(1)
    .maybeSingle();
  return (data as { id: string; title: string | null } | null) ?? null;
}

export async function getPersonalProfile(actor: PortalActor): Promise<PersonalProfileView | null> {
  const { data } = await companyOs
    .from("people")
    .select("full_name, preferred_name, phone, city, state_province, country, timezone, linkedin_url, email")
    .eq("id", actor.personId)
    .maybeSingle();
  if (!data) return null;
  const link = await titleLink(actor);
  const p = data as Record<string, string | null>;
  return {
    fullName: p.full_name ?? "",
    preferredName: p.preferred_name ?? "",
    phone: p.phone ?? "",
    jobTitle: link?.title ?? "",
    city: p.city ?? "",
    stateProvince: p.state_province ?? "",
    country: p.country ?? "",
    timezone: p.timezone ?? "",
    linkedinUrl: p.linkedin_url ?? "",
    email: p.email ?? actor.email,
    memberships: actor.memberships.map((m) => ({
      companyName: m.companyName ?? "Your company",
      role: m.role,
    })),
  };
}

export async function updatePersonalProfile(
  actor: PortalActor,
  input: PersonalProfile,
): Promise<Result> {
  if (tooLong(input as unknown as Record<string, string>)) {
    return { ok: false, error: "One of your entries is too long." };
  }
  if (!input.fullName?.trim()) return { ok: false, error: "Your name can't be empty." };

  const { error } = await companyOs
    .from("people")
    .update({
      full_name: input.fullName.trim(),
      preferred_name: clean(input.preferredName),
      phone: clean(input.phone),
      city: clean(input.city),
      state_province: clean(input.stateProvince),
      country: clean(input.country),
      timezone: clean(input.timezone),
      linkedin_url: clean(input.linkedinUrl),
      updated_at: new Date().toISOString(),
    })
    .eq("id", actor.personId);
  if (error) return { ok: false, error: "Could not save your details." };

  const link = await titleLink(actor);
  if (link) {
    await companyOs
      .from("person_companies")
      .update({ title: clean(input.jobTitle), updated_at: new Date().toISOString() })
      .eq("id", link.id);
  }
  return { ok: true };
}

/* ---------------------------------- company ---------------------------------- */

export const SIZE_BANDS = ["0-50", "51-250", "251-5000", "5000+"] as const;

export type CompanyProfile = {
  name: string;
  industry: string;
  sizeBand: string;
  country: string;
  websiteUrl: string;
  headOffice: string;
  generalEmail: string;
  registrationNumber: string; // metadata.abn
  billingAddress: string;
};

export type CompanyProfileView = CompanyProfile & {
  companyId: string;
  clientSince: string | null;
  clientTypes: string[];
};

type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  size_band: string | null;
  country: string | null;
  website_url: string | null;
  billing_address: string | null;
  client_types: string[] | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const metaString = (meta: Record<string, unknown> | null, key: string): string =>
  typeof meta?.[key] === "string" ? (meta[key] as string) : "";

export async function getCompanyProfile(
  actor: PortalActor,
  companyId: string,
): Promise<CompanyProfileView | null> {
  if (!isPortalAdmin(actor, companyId)) return null;
  const { data } = await companyOs
    .from("companies")
    .select("id, name, industry, size_band, country, website_url, billing_address, client_types, created_at, metadata")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  const c = data as CompanyRow;
  return {
    companyId: c.id,
    name: c.name,
    industry: c.industry ?? "",
    sizeBand: c.size_band ?? "",
    country: c.country ?? "",
    websiteUrl: c.website_url ?? "",
    headOffice: metaString(c.metadata, "head_office"),
    generalEmail: metaString(c.metadata, "general_email"),
    registrationNumber: metaString(c.metadata, "abn"),
    billingAddress: c.billing_address ?? "",
    clientSince: c.created_at ?? null,
    clientTypes: c.client_types ?? [],
  };
}

export async function updateCompanyProfile(
  actor: PortalActor,
  companyId: string,
  input: CompanyProfile,
): Promise<Result> {
  if (!isPortalAdmin(actor, companyId)) return { ok: false, error: ROLE_DENIED };
  if (tooLong(input as unknown as Record<string, string>)) {
    return { ok: false, error: "One of your entries is too long." };
  }
  if (!input.name?.trim()) return { ok: false, error: "Company name can't be empty." };
  if (input.sizeBand && !(SIZE_BANDS as readonly string[]).includes(input.sizeBand)) {
    return { ok: false, error: "Pick a team size from the list." };
  }
  const generalEmail = clean(input.generalEmail);
  if (generalEmail && !generalEmail.includes("@")) {
    return { ok: false, error: "The general email doesn't look like an email address." };
  }

  // metadata is shared with Edge8 (qbo ids, research links): merge our three
  // keys into the stored object rather than replacing it.
  const { data: current } = await companyOs
    .from("companies")
    .select("metadata")
    .eq("id", companyId)
    .maybeSingle();
  const metadata = {
    ...(((current as { metadata: Record<string, unknown> | null } | null)?.metadata) ?? {}),
    head_office: clean(input.headOffice),
    general_email: generalEmail,
    abn: clean(input.registrationNumber),
  };

  const patch = {
    name: input.name.trim(),
    industry: clean(input.industry),
    size_band: clean(input.sizeBand),
    country: clean(input.country),
    website_url: clean(input.websiteUrl),
    billing_address: clean(input.billingAddress),
    metadata,
    updated_at: new Date().toISOString(),
  };
  const { error } = await companyOs.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, error: "Could not save the company details." };

  const via = actor.impersonation
    ? `${actor.impersonation.adminEmail} (assume: ${actor.email})`
    : actor.email;
  await recordAudit({
    table: "companies",
    recordId: companyId,
    operation: "update",
    actor: via,
    newData: patch,
    context: { action: "portal_company_profile", via: "portal_ui" },
  });
  return { ok: true };
}
