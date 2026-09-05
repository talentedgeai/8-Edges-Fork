import { companyOs } from "@/kernel/data/supabase";

// Lifecycle helpers for the sales model. Owned by company-os since Q2: the
// lead satellite, the companies row and lifecycle_transitions are all CRM
// tables, and the callers (the site's contact form and retreat signups, the
// retreats event actions, the admin inquiries and deals actions) sit on this
// layer or above it. The lead journey lives on the
// company_os.lead satellite — one row per person actively being worked as a
// lead — and lifecycle_stage is account-level on companies (B2B: the account
// advances while you talk to several of its contacts). Every change appends a
// row to company_os.lifecycle_transitions (person-scoped for status moves,
// company-scoped for stage moves) so funnel math and recycle history stay
// queryable. Server-only (companyOs uses the service key).

export type LifecycleStage =
  | "none"
  | "subscriber"
  | "lead"
  | "mql"
  | "sql"
  | "opportunity"
  | "customer"
  | "evangelist";

export type LeadStatus =
  | "new"
  | "attempting"
  | "connected"
  | "meeting_booked"
  | "open_deal"
  | "unqualified"
  | "nurture";

export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "attempting",
  "connected",
  "meeting_booked",
];

// Stage order for raise-only company bumps: an account never moves backwards
// automatically (a new lead at a customer account doesn't demote the account).
const STAGE_RANK: Record<LifecycleStage, number> = {
  none: 0,
  subscriber: 1,
  lead: 2,
  mql: 3,
  sql: 4,
  opportunity: 5,
  customer: 6,
  evangelist: 7,
};

export type LeadRow = {
  person_id: string;
  status: LeadStatus;
  sla_due_at: string | null;
  attempt_count: number;
  disqualified_reason: string | null;
};

export async function getLead(personId: string): Promise<LeadRow | null> {
  const { data } = await companyOs
    .from("lead")
    .select("person_id, status, sla_due_at, attempt_count, disqualified_reason")
    .eq("person_id", personId)
    .maybeSingle();
  return (data as LeadRow | null) ?? null;
}

type TransitionInput = {
  personId?: string | null;
  companyId?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  changedBy?: string | null;
};

export async function recordTransition(t: TransitionInput): Promise<void> {
  const { error } = await companyOs.from("lifecycle_transitions").insert({
    person_id: t.personId ?? null,
    company_id: t.companyId ?? null,
    from_stage: t.fromStage ?? null,
    to_stage: t.toStage ?? null,
    from_status: t.fromStatus ?? null,
    to_status: t.toStatus ?? null,
    reason: t.reason ?? null,
    note: t.note ?? null,
    changed_by: t.changedBy ?? null,
  });
  if (error) console.error("lifecycle_transitions insert failed:", error.message);
}

// Raise a company's lifecycle_stage (never lowers it) and log the transition.
export async function bumpCompanyLifecycle(
  companyId: string,
  toStage: LifecycleStage,
  opts: { reason?: string; changedBy?: string | null } = {},
): Promise<void> {
  const { data: company } = await companyOs
    .from("companies")
    .select("lifecycle_stage")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return;

  const current = (company.lifecycle_stage ?? "none") as LifecycleStage;
  if (STAGE_RANK[current] >= STAGE_RANK[toStage]) return;

  const { error } = await companyOs.from("companies").update({ lifecycle_stage: toStage })
    .eq("id", companyId);
  if (error) {
    console.error("company lifecycle bump failed:", error.message);
    return;
  }
  await recordTransition({
    companyId,
    fromStage: current,
    toStage,
    reason: opts.reason ?? null,
    changedBy: opts.changedBy ?? null,
  });
}

// Bump every company the person is linked to. Best-effort: a person with no
// company links (solo lead) simply advances nothing at the account level.
export async function bumpPersonCompanies(
  personId: string,
  toStage: LifecycleStage,
  opts: { reason?: string; changedBy?: string | null } = {},
): Promise<void> {
  const { data } = await companyOs
    .from("person_companies")
    .select("company_id")
    .eq("person_id", personId);
  for (const link of data ?? []) {
    await bumpCompanyLifecycle(link.company_id, toStage, opts);
  }
}

export type PromoteResult =
  | { ok: true; promoted: boolean }
  | { ok: false; error: string };

// Promote a person into the SDR queue: upsert their lead row and raise their
// companies to 'lead'. Idempotent: someone already being worked, already handed
// off (open_deal), or already a customer (an open/won deal) is left alone, so
// double submits and repeat inquiries never demote anyone or duplicate
// transitions.
export async function promotePersonToLead(
  personId: string,
  opts: { slaHours?: number; reason?: string; changedBy?: string | null } = {},
): Promise<PromoteResult> {
  const { data: person, error } = await companyOs
    .from("people")
    .select("id")
    .eq("id", personId)
    .maybeSingle();
  if (error || !person) return { ok: false, error: error?.message ?? "Person not found." };

  const lead = await getLead(personId);
  if (lead && (ACTIVE_LEAD_STATUSES.includes(lead.status) || lead.status === "open_deal")) {
    return { ok: true, promoted: false };
  }

  // Customer guard, satellite-era: "is a customer" is derived from deals, not
  // from a person-level stage.
  const { count: dealCount } = await companyOs
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .in("status", ["open", "won"])
    .is("archived_at", null);
  if ((dealCount ?? 0) > 0) return { ok: true, promoted: false };

  const slaHours = opts.slaHours ?? 4;
  const slaDueAt = new Date(Date.now() + slaHours * 3600_000).toISOString();

  const { error: upErr } = await companyOs.from("lead").upsert(
    {
      person_id: personId,
      status: "new",
      sla_due_at: slaDueAt,
      disqualified_reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id" },
  );
  if (upErr) return { ok: false, error: upErr.message };

  await recordTransition({
    personId,
    fromStatus: lead?.status ?? null,
    toStatus: "new",
    reason: opts.reason ?? "promoted",
    changedBy: opts.changedBy ?? null,
  });
  await bumpPersonCompanies(personId, "lead", {
    reason: opts.reason ?? "promoted",
    changedBy: opts.changedBy ?? null,
  });
  return { ok: true, promoted: true };
}
