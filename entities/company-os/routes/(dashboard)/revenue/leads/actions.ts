"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import {
  bumpPersonCompanies,
  getLead,
  promotePersonToLead,
  recordTransition,
} from "@/entities/company-os/lib/lifecycle";
import { recordAudit } from "@/kernel/audit/audit";
import { guardedDelete } from "@/entities/company-os/lib/mutations";
import { insertInteractions } from "@/kernel/messaging/writes";

type Result = { ok: true } | { ok: false; error: string };

const DISQUALIFY_REASONS = new Set([
  "no_budget",
  "no_need",
  "bad_timing",
  "no_authority",
  "unresponsive",
  "competitor",
  "not_icp",
  "other",
]);

function refresh() {
  revalidatePath("/admin/revenue/leads");
  revalidatePath("/admin/contacts");
}

export async function promoteLead(personId: string): Promise<Result> {
  await requireAdmin();
  const r = await promotePersonToLead(personId, { reason: "promoted_manually" });
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

// Safe exit: take the person off the SDR queue (into nurture) without erasing
// anything. The person stays on /admin/contacts. Distinct from Delete person.
export async function removeFromQueue(personId: string): Promise<Result> {
  const admin = await requireAdmin();

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not in the queue." };

  const { error } = await companyOs
    .from("lead")
    .update({ status: "nurture", sla_due_at: null, updated_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: "nurture",
    reason: "removed_from_queue",
  });
  await recordAudit({
    table: "lead",
    recordId: personId,
    operation: "update",
    actor: admin.email,
    context: { action: "removed_from_queue" },
  });
  refresh();
  return { ok: true };
}

// Destructive: permanently erase the person (GDPR), guarded by the schema's
// foreign keys. The lead row follows via ON DELETE CASCADE. Clearly separated
// from the safe "remove from queue".
export async function deleteLeadPerson(personId: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await guardedDelete("people", personId, admin.email, { via: "leads" });
  if (r.ok) refresh();
  return r;
}

// Log an SDR call attempt: an interactions row + attempt counter. First
// attempt clears the speed-to-lead SLA and moves new → attempting.
export async function logCall(personId: string, note: string): Promise<Result> {
  await requireAdmin();

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error: iErr } = await insertInteractions({
    kind: "call",
    subject: "SDR call attempt",
    body: note || null,
    person_id: personId,
    occurred_at: new Date().toISOString(),
    metadata: { source: "leads_queue" },
  });
  if (iErr) return { ok: false, error: iErr.message };

  const updates: Record<string, unknown> = {
    attempt_count: (lead.attempt_count ?? 0) + 1,
    sla_due_at: null,
    updated_at: new Date().toISOString(),
  };
  if (lead.status === "new") updates.status = "attempting";

  const { error: uErr } = await companyOs.from("lead").update(updates).eq("person_id", personId);
  if (uErr) return { ok: false, error: uErr.message };

  if (lead.status === "new") {
    await recordTransition({
      personId,
      fromStatus: "new",
      toStatus: "attempting",
      reason: "call_logged",
    });
  }
  refresh();
  return { ok: true };
}

// Manual boost above the SLA-ordered queue — for a lead that needs working
// now regardless of where SLA/age would otherwise place it. SLA still governs
// order among pinned leads' unpinned peers and among each other's ties.
export async function pinLead(personId: string): Promise<Result> {
  await requireAdmin();

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error } = await companyOs
    .from("lead")
    .update({ pinned_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function unpinLead(personId: string): Promise<Result> {
  await requireAdmin();

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error } = await companyOs.from("lead").update({ pinned_at: null }).eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function markConnected(personId: string): Promise<Result> {
  await requireAdmin();

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not an active lead." };
  if (lead.status === "connected") return { ok: true };

  const { error } = await companyOs
    .from("lead")
    .update({ status: "connected", sla_due_at: null, updated_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: "connected",
    reason: "connected",
  });
  refresh();
  return { ok: true };
}

export async function saveQualification(
  personId: string,
  fields: {
    goal: string;
    plan: string;
    challenge: string;
    timeline: string;
    budget: string;
    authority: string;
  },
): Promise<Result> {
  await requireAdmin();

  const clean = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v.trim() || null]),
  );
  const { error } = await companyOs
    .from("person_qualifications")
    .upsert({ person_id: personId, ...clean }, { onConflict: "person_id" });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

// Enumerated exit. mode 'nurture' keeps the person warm for re-engagement;
// 'unqualified' is a hard no. Either way the lead row stays and the transition
// log keeps this cycle queryable.
export async function disqualifyLead(
  personId: string,
  reason: string,
  mode: "unqualified" | "nurture",
  note: string,
): Promise<Result> {
  await requireAdmin();
  if (!DISQUALIFY_REASONS.has(reason)) return { ok: false, error: "Pick a reason." };

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error } = await companyOs
    .from("lead")
    .update({
      status: mode,
      sla_due_at: null,
      disqualified_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: mode,
    reason,
    note: note.trim() || null,
  });
  refresh();
  return { ok: true };
}

// The SDR→closer handoff: create a pending deal on the default pipeline's
// first stage, move the lead to open_deal, and raise the account to
// opportunity. The closer accepts or rejects it on the Deals board.
export async function bookMeetingAndHandOff(personId: string): Promise<Result> {
  await requireAdmin();

  const { data: person, error: pErr } = await companyOs
    .from("people")
    .select("full_name, email, person_companies(company_id, companies(name))")
    .eq("id", personId)
    .maybeSingle();
  if (pErr || !person) return { ok: false, error: pErr?.message ?? "Person not found." };

  const lead = await getLead(personId);
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { data: pipeline, error: plErr } = await companyOs
    .from("pipelines")
    .select("id, pipeline_stages(id, position)")
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (plErr || !pipeline) return { ok: false, error: plErr?.message ?? "No active pipeline." };

  const stages = (pipeline.pipeline_stages ?? []) as { id: string; position: number }[];
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];
  if (!firstStage) return { ok: false, error: "Pipeline has no stages." };

  const pcs = (person.person_companies ?? []) as {
    company_id: string;
    companies: { name: string | null } | { name: string | null }[] | null;
  }[];
  const companyId = pcs[0]?.company_id ?? null;

  // New deals land at the bottom of the destination stage's priority order —
  // the closer can drag it up from there.
  const { count: stageDealCount } = await companyOs
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", firstStage.id);

  const name = person.full_name || person.email;
  const { error: dErr } = await companyOs.from("deals").insert({
    title: `${name} — SDR handoff`,
    person_id: personId,
    company_id: companyId,
    pipeline_id: pipeline.id,
    stage_id: firstStage.id,
    position: stageDealCount ?? 0,
    status: "open",
    source: "sdr_handoff",
    handoff_status: "pending",
  });
  if (dErr) return { ok: false, error: dErr.message };

  const { error: uErr } = await companyOs
    .from("lead")
    .update({ status: "open_deal", sla_due_at: null, updated_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (uErr) return { ok: false, error: uErr.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: "open_deal",
    reason: "meeting_booked",
  });
  await bumpPersonCompanies(personId, "opportunity", { reason: "meeting_booked" });

  refresh();
  revalidatePath("/admin/revenue/deals");
  return { ok: true };
}
