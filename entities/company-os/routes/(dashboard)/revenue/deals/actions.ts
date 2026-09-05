"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { bumpCompanyLifecycle, bumpPersonCompanies, getLead, recordTransition } from "@/entities/company-os/lib/lifecycle";
import { recordAudit, recordAuditMany } from "@/kernel/audit/audit";
import { archiveRecord, guardedDelete, restoreRecord } from "@/entities/company-os/lib/mutations";
import { convertToUsdCents } from "@/entities/company-os/lib/fx";
import { insertPeople } from "@/kernel/identity/writes";
import { insertInteractions } from "@/kernel/messaging/writes";

type Result = { ok: true } | { ok: false; error: string };
type BulkResult = { ok: true; message?: string } | { ok: false; error: string };

const LOST_REASONS = new Set([
  "price",
  "competitor",
  "no_decision",
  "bad_fit",
  "bad_timing",
  "ghosted",
  "other",
]);
const HANDOFF_REJECT_REASONS = new Set([
  "not_qualified",
  "bad_fit",
  "duplicate",
  "bad_timing",
  "other",
]);

// Moving a deal into this stage (contract out, awaiting payment) auto-sets its
// forecast probability — the deal is effectively 90% sure by this point. It's the
// only stage that touches probability on entry; every other stage leaves it alone.
const CONTRACT_SENT_STAGE = "Contract Sent";
const CONTRACT_SENT_PROBABILITY = 90;

function refresh() {
  revalidatePath("/admin/revenue/deals");
  revalidatePath("/admin/revenue/leads");
}

// Accept a pasted link and store a canonical URL. Empty → null; a bare host
// like "docs.google.com/x" gets an https:// scheme so the stored value is
// always clickable.
function normalizeUrl(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// When a deal closes, the lead journey follows: won → the account becomes a
// customer and the lead row retires (deleted — the person is no longer being
// worked; transitions keep the history); lost → back to nurture unless they
// have another open deal or a won one (already a customer).
async function syncPersonAfterClose(dealId: string, personId: string | null, won: boolean) {
  if (!personId) return;
  const lead = await getLead(personId);

  if (won) {
    await bumpPersonCompanies(personId, "customer", { reason: "deal_won" });
    if (lead) {
      await companyOs.from("lead").delete().eq("person_id", personId);
      await recordTransition({
        personId,
        fromStatus: lead.status,
        toStatus: null,
        reason: "deal_won",
      });
    }
    return;
  }

  const { count: otherActive } = await companyOs
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .in("status", ["open", "won"])
    .neq("id", dealId);
  if ((otherActive ?? 0) > 0) return;

  const { error } = await companyOs.from("lead").upsert(
    {
      person_id: personId,
      status: "nurture",
      sla_due_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id" },
  );
  if (error) {
    console.error("lead nurture sync failed:", error.message);
    return;
  }
  await recordTransition({
    personId,
    fromStatus: lead?.status ?? null,
    toStatus: "nurture",
    reason: "deal_lost",
  });
}

// Move a deal to a pipeline stage. Landing on a won/lost stage also flips the
// deal's status and stamps closed_at, so the close-rate metrics stay truthful.
// Losing a deal requires an enumerated reason; winning one requires the final
// deal amount (in the deal's own currency), so won revenue is never a guess.
export async function moveDealStage(
  dealId: string,
  toStageId: string,
  lostReason?: string,
  wonAmount?: number,
): Promise<Result> {
  await requireAdmin();

  const { data: stage, error: stageErr } = await companyOs
    .from("pipeline_stages")
    .select("name, is_won, is_lost")
    .eq("id", toStageId)
    .maybeSingle();
  if (stageErr || !stage) return { ok: false, error: stageErr?.message ?? "Unknown stage." };

  if (stage.is_lost && (!lostReason || !LOST_REASONS.has(lostReason))) {
    return { ok: false, error: "Losing a deal needs a reason." };
  }
  if (stage.is_won && (wonAmount == null || !Number.isFinite(wonAmount) || wonAmount <= 0)) {
    return { ok: false, error: "Marking a deal won needs the final deal amount." };
  }

  const status = stage.is_won ? "won" : stage.is_lost ? "lost" : "open";
  const closed_at = stage.is_won || stage.is_lost ? new Date().toISOString() : null;

  const updates: Record<string, unknown> = { stage_id: toStageId, status, closed_at };
  if (stage.is_lost) updates.lost_reason = lostReason;
  if (stage.is_won && wonAmount != null) {
    const cents = Math.round(wonAmount * 100);
    updates.amount_cents = cents;
    // Same best-effort USD normalization as updateDeal — a flaky FX lookup
    // shouldn't block closing the deal.
    const { data: existing } = await companyOs
      .from("deals")
      .select("currency")
      .eq("id", dealId)
      .maybeSingle();
    try {
      const fx = await convertToUsdCents(cents, existing?.currency ?? "usd");
      updates.amount_usd_cents = fx.amountUsdCents;
      updates.fx_rate = fx.rate;
      updates.fx_rate_fetched_at = new Date().toISOString();
    } catch (err) {
      console.error(`FX conversion failed for deal ${dealId}:`, err);
    }
  }
  // Reaching "Contract Sent" bumps the deal to 90% (awaiting payment). Set only
  // on entry so a rep's later manual override sticks.
  if (!stage.is_won && !stage.is_lost && stage.name === CONTRACT_SENT_STAGE) {
    updates.probability = CONTRACT_SENT_PROBABILITY;
  }

  const { data: deal, error } = await companyOs
    .from("deals")
    .update(updates)
    .eq("id", dealId)
    .select("person_id, company_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  if (stage.is_won || stage.is_lost) {
    await syncPersonAfterClose(dealId, deal?.person_id ?? null, stage.is_won);
  }
  // The person-side sync only bumps companies linked via person_companies;
  // the deal's own account becomes a customer regardless (raise-only).
  if (stage.is_won && deal?.company_id) {
    await bumpCompanyLifecycle(deal.company_id, "customer", { reason: "deal_won" });
  }

  refresh();
  return { ok: true };
}

// Send an open deal back to being a lead — it was accepted or created
// prematurely and needs more qualification before it's worth a closer's time.
// Archives the deal (kept, reversible, out of the board/forecast — the same
// mechanism the manual Archive button uses) and reopens the person's lead row
// at 'connected', since a deal implies real contact already happened, so
// there's no fresh SLA clock to start.
export async function demoteDealToLead(dealId: string, reason: string): Promise<Result> {
  const admin = await requireAdmin();

  const { data: deal, error: dErr } = await companyOs
    .from("deals")
    .select("person_id, status, handoff_status, archived_at")
    .eq("id", dealId)
    .maybeSingle();
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? "Deal not found." };
  if (deal.archived_at) return { ok: false, error: "This deal is already archived." };
  if (deal.status !== "open") return { ok: false, error: "Only open deals can be demoted." };
  if (deal.handoff_status === "pending") {
    return { ok: false, error: "This deal is still a pending handoff — accept or reject it instead." };
  }
  if (!deal.person_id) return { ok: false, error: "This deal isn't linked to a contact." };

  const { error: aErr } = await companyOs
    .from("deals")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .eq("id", dealId);
  if (aErr) return { ok: false, error: aErr.message };

  const lead = await getLead(deal.person_id);
  const { error: lErr } = await companyOs.from("lead").upsert(
    {
      person_id: deal.person_id,
      status: "connected",
      sla_due_at: null,
      disqualified_reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id" },
  );
  if (lErr) return { ok: false, error: lErr.message };

  await recordTransition({
    personId: deal.person_id,
    fromStatus: lead?.status ?? null,
    toStatus: "connected",
    reason: "demoted_from_deal",
    note: reason.trim() || null,
  });
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    context: { action: "demoted_to_lead", reason: reason.trim() || null },
  });

  refresh();
  return { ok: true };
}

// Rewrites `position` (0..n-1) for a full ordered set of deal ids — the new
// rank of a single stage/column after a drag. Called after the stage-change
// side effects (if any) so a rejected move never leaves positions dangling.
export async function reorderDeals(orderedIds: string[]): Promise<Result> {
  await requireAdmin();
  if (orderedIds.length === 0) return { ok: true };

  // One set-based UPDATE (unnest ... WITH ORDINALITY) instead of one round-trip
  // per card — a full-column drag was previously N HTTP calls.
  const { error } = await companyOs.rpc("set_deal_positions", { p_ids: orderedIds, p_start: 0 });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

// The closer's side of the SDR handoff contract. Reject sends the person back
// to the SDR queue and closes the deal; the reason feeds SDR coaching.
export async function decideHandoff(
  dealId: string,
  decision: "accepted" | "rejected",
  reason?: string,
  note?: string,
): Promise<Result> {
  await requireAdmin();

  if (decision === "rejected" && (!reason || !HANDOFF_REJECT_REASONS.has(reason))) {
    return { ok: false, error: "Rejecting a handoff needs a reason." };
  }

  const { data: deal, error: dErr } = await companyOs
    .from("deals")
    .select("person_id, handoff_status")
    .eq("id", dealId)
    .maybeSingle();
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? "Deal not found." };
  if (deal.handoff_status !== "pending") return { ok: false, error: "Handoff already decided." };

  const updates: Record<string, unknown> = {
    handoff_status: decision,
    handoff_decided_at: new Date().toISOString(),
    handoff_note: note?.trim() || null,
  };
  if (decision === "rejected") {
    updates.handoff_rejected_reason = reason;
    updates.status = "lost";
    updates.closed_at = new Date().toISOString();
    updates.lost_reason = "bad_fit";
  }

  const { error } = await companyOs.from("deals").update(updates).eq("id", dealId);
  if (error) return { ok: false, error: error.message };

  if (decision === "rejected" && deal.person_id) {
    // Back to the SDR queue: the lead resumes at connected (they had a real
    // conversation; the deal just wasn't ready for a closer).
    const lead = await getLead(deal.person_id);
    const { error: lErr } = await companyOs.from("lead").upsert(
      {
        person_id: deal.person_id,
        status: "connected",
        sla_due_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "person_id" },
    );
    if (lErr) console.error("handoff-reject lead sync failed:", lErr.message);
    await recordTransition({
      personId: deal.person_id,
      fromStatus: lead?.status ?? null,
      toStatus: "connected",
      reason: "handoff_rejected",
      note: reason,
    });
  }

  refresh();
  return { ok: true };
}

// ─── Full deal edit ──────────────────────────────────────────────────────────
// `amount` is dollars from the form; it's the only place we convert to the
// integer-cents storage. Only keys present in the patch are written.
export type DealPatch = {
  title?: string;
  amount?: number | null;
  currency?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
  next_step?: string | null;
  next_step_date?: string | null;
  proposal_url?: string | null;
  contract_url?: string | null;
};

export async function updateDeal(dealId: string, patch: DealPatch): Promise<Result> {
  const admin = await requireAdmin();
  const updates: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty." };
    updates.title = t;
  }
  if (patch.amount !== undefined) {
    const amt = patch.amount ?? 0;
    if (!Number.isFinite(amt) || amt < 0) return { ok: false, error: "Amount must be zero or more." };
    updates.amount_cents = Math.round(amt * 100);
  }
  if (patch.currency !== undefined) {
    const c = patch.currency.trim().toLowerCase();
    if (!c) return { ok: false, error: "Currency is required." };
    updates.currency = c;
  }
  if (patch.probability !== undefined) {
    if (patch.probability == null) updates.probability = null;
    else {
      const p = Math.round(patch.probability);
      if (p < 0 || p > 100) return { ok: false, error: "Probability must be between 0 and 100." };
      updates.probability = p;
    }
  }
  if (patch.expected_close_date !== undefined) updates.expected_close_date = patch.expected_close_date || null;
  if (patch.source !== undefined) updates.source = patch.source?.trim() || null;
  if (patch.next_step !== undefined) updates.next_step = patch.next_step?.trim() || null;
  if (patch.next_step_date !== undefined) updates.next_step_date = patch.next_step_date || null;
  if (patch.proposal_url !== undefined) updates.proposal_url = normalizeUrl(patch.proposal_url);
  if (patch.contract_url !== undefined) updates.contract_url = normalizeUrl(patch.contract_url);

  // Reporting/list views always show USD (amount_cents/currency stay the
  // original transaction). Re-fetch the rate whenever amount or currency
  // changes; a flaky FX lookup shouldn't block the deal save.
  if (updates.amount_cents !== undefined || updates.currency !== undefined) {
    let amountCents = updates.amount_cents as number | undefined;
    let currency = updates.currency as string | undefined;
    if (amountCents === undefined || currency === undefined) {
      const { data: existing } = await companyOs
        .from("deals")
        .select("amount_cents, currency")
        .eq("id", dealId)
        .maybeSingle();
      amountCents ??= existing?.amount_cents ?? 0;
      currency ??= existing?.currency ?? "usd";
    }
    try {
      const fx = await convertToUsdCents(amountCents ?? 0, currency ?? "usd");
      updates.amount_usd_cents = fx.amountUsdCents;
      updates.fx_rate = fx.rate;
      updates.fx_rate_fetched_at = new Date().toISOString();
      // Keep the shared fx_rates table fresh from real usage, so the trigger that
      // normalizes orders/products/bookings (company_os.set_amount_usd_cents) uses a
      // current rate too. Best-effort — never block the deal save.
      await companyOs
        .from("fx_rates")
        .upsert(
          { currency: (currency ?? "usd").toLowerCase(), rate_to_usd: fx.rate, updated_at: new Date().toISOString() },
          { onConflict: "currency" },
        );
    } catch (err) {
      console.error(`FX conversion failed for deal ${dealId}:`, err);
    }
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("deals").update(updates).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "deals", recordId: dealId, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}

export async function archiveDeal(dealId: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await archiveRecord("deals", dealId, admin.email);
  if (r.ok) refresh();
  return r;
}

export async function restoreDeal(dealId: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await restoreRecord("deals", dealId, admin.email);
  if (r.ok) refresh();
  return r;
}

export async function deleteDeal(dealId: string): Promise<Result> {
  const admin = await requireAdmin();
  const r = await guardedDelete("deals", dealId, admin.email, { via: "deals" });
  if (r.ok) refresh();
  return r;
}

// ─── Bulk (list view multi-select) ───────────────────────────────────────────
export type BulkDealPatch = {
  stage_id?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
};

export async function bulkUpdateDeals(ids: string[], patch: BulkDealPatch): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const updates: Record<string, unknown> = {};
  if (patch.stage_id !== undefined) {
    const { data: stage, error } = await companyOs
      .from("pipeline_stages")
      .select("is_won, is_lost")
      .eq("id", patch.stage_id)
      .maybeSingle();
    if (error || !stage) return { ok: false, error: error?.message ?? "Unknown stage." };
    if (stage.is_won || stage.is_lost) {
      return { ok: false, error: "Bulk move is limited to open stages. Close won/lost deals one at a time." };
    }
    updates.stage_id = patch.stage_id;
    updates.status = "open";
    updates.closed_at = null;
  }
  if (patch.probability !== undefined) {
    if (patch.probability == null) updates.probability = null;
    else {
      const p = Math.round(patch.probability);
      if (p < 0 || p > 100) return { ok: false, error: "Probability must be between 0 and 100." };
      updates.probability = p;
    }
  }
  if (patch.expected_close_date !== undefined) updates.expected_close_date = patch.expected_close_date || null;
  if (patch.source !== undefined) updates.source = patch.source?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "Nothing to change. Fill at least one field." };
  }

  const { error } = await companyOs.from("deals").update(updates).in("id", ids);
  if (error) return { ok: false, error: error.message };

  // Bulk-moved deals land at the bottom of the destination stage's priority
  // order, appended after whatever was already there.
  if (updates.stage_id) {
    const { count: existing } = await companyOs
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", updates.stage_id as string)
      .not("id", "in", `(${ids.join(",")})`);
    // Append after the existing rows in one set-based call, not one per id.
    await companyOs.rpc("set_deal_positions", { p_ids: ids, p_start: existing ?? 0 });
  }

  await recordAuditMany(
    ids.map((id) => ({ table: "deals", recordId: id, operation: "bulk_update" as const, actor: admin.email, newData: updates })),
  );
  refresh();
  return { ok: true, message: `Updated ${ids.length} deal${ids.length === 1 ? "" : "s"}.` };
}

export async function bulkArchiveDeals(ids: string[]): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const { error } = await companyOs
    .from("deals")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .in("id", ids)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAuditMany(
    ids.map((id) => ({ table: "deals", recordId: id, operation: "bulk_archive" as const, actor: admin.email })),
  );
  refresh();
  return { ok: true, message: `Archived ${ids.length} deal${ids.length === 1 ? "" : "s"}.` };
}

type BulkDeleteResult =
  | { ok: true; message?: string; deletedIds: string[] }
  | { ok: false; error: string };

export async function bulkDeleteDeals(ids: string[]): Promise<BulkDeleteResult> {
  const admin = await requireAdmin();
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const deletedIds: string[] = [];
  let blocked = 0;
  for (const id of ids) {
    const r = await guardedDelete("deals", id, admin.email, { via: "deals_bulk" });
    if (r.ok) deletedIds.push(id);
    else blocked += 1;
  }
  refresh();
  if (deletedIds.length === 0) {
    return { ok: false, error: `None deleted — ${blocked} still referenced by inquiries or projects. Archive them instead.` };
  }
  return {
    ok: true,
    deletedIds,
    message:
      blocked > 0
        ? `Deleted ${deletedIds.length}, kept ${blocked} still referenced.`
        : `Deleted ${deletedIds.length} deal${deletedIds.length === 1 ? "" : "s"}.`,
  };
}

// ─── Communications ──────────────────────────────────────────────────────────
// Deal communications live in the shared interactions activity log, scoped with
// subject_type='deal' + subject_id. We surface the manual entries (notes, calls,
// emails, meetings) and hide the automatic 'status_change' rows the pipeline
// writes on every stage move, so the list reads as a human conversation history.
export type Communication = {
  id: string;
  kind: string;
  subject: string | null;
  body: string | null;
  occurredAt: string | null;
};

const AUTO_INTERACTION_KINDS = ["status_change"];

export async function getDealCommunications(
  dealId: string,
): Promise<{ ok: true; items: Communication[] } | { ok: false; error: string }> {
  await requireAdmin();

  const { data, error } = await companyOs
    .from("interactions")
    .select("id, kind, subject, body, occurred_at")
    .eq("subject_type", "deal")
    .eq("subject_id", dealId)
    .not("kind", "in", `(${AUTO_INTERACTION_KINDS.join(",")})`)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const items: Communication[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: (r.kind as string) ?? "note",
    subject: (r.subject as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    occurredAt: (r.occurred_at as string | null) ?? null,
  }));
  return { ok: true, items };
}

export async function addDealCommunication(
  dealId: string,
  body: string,
): Promise<{ ok: true; item: Communication } | { ok: false; error: string }> {
  await requireAdmin();

  const text = body.trim();
  if (!text) return { ok: false, error: "Write something before saving." };

  // Copy the deal's person/company onto the log entry so the note also lands on
  // the contact's 360 timeline (which filters interactions by person_id).
  const { data: deal, error: dErr } = await companyOs
    .from("deals")
    .select("person_id, company_id")
    .eq("id", dealId)
    .maybeSingle();
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? "Deal not found." };

  const occurredAt = new Date().toISOString();
  const { data, error } = await insertInteractions({
      kind: "note",
      body: text,
      person_id: deal.person_id,
      company_id: deal.company_id,
      subject_type: "deal",
      subject_id: dealId,
      occurred_at: occurredAt,
      metadata: { source: "deal_drawer" },
    })
    .select("id, kind, subject, body, occurred_at")
    .single();
  if (error) return { ok: false, error: error.message };

  refresh();
  return {
    ok: true,
    item: {
      id: data.id as string,
      kind: (data.kind as string) ?? "note",
      subject: (data.subject as string | null) ?? null,
      body: (data.body as string | null) ?? null,
      occurredAt: (data.occurred_at as string | null) ?? occurredAt,
    },
  };
}

// ─── Referrer ────────────────────────────────────────────────────────────────
// A deal credits one referrer, stored as a real people row via deals.referrer_id.
export type PersonHit = { id: string; name: string; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function personHit(row: { id: string; full_name: string | null; email: string }): PersonHit {
  return { id: row.id, name: row.full_name?.trim() || row.email, email: row.email };
}

// Typeahead for the referrer picker. Strips PostgREST filter metacharacters from
// the raw term so a stray comma or paren can't break (or inject into) the `or`.
export async function searchPeople(query: string): Promise<PersonHit[]> {
  await requireAdmin();

  const term = query.trim().replace(/[,%()*\\]/g, "");
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const { data, error } = await companyOs
    .from("people")
    .select("id, full_name, email")
    .is("archived_at", null)
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order("full_name")
    .limit(8);
  if (error) return [];
  return (data ?? []).map(personHit);
}

// Link an existing contact as the deal's referrer, or clear it with null.
export async function setDealReferrer(
  dealId: string,
  referrerId: string | null,
): Promise<{ ok: true; referrer: PersonHit | null } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  let referrer: PersonHit | null = null;
  if (referrerId) {
    const { data: person, error: pErr } = await companyOs
      .from("people")
      .select("id, full_name, email")
      .eq("id", referrerId)
      .maybeSingle();
    if (pErr) return { ok: false, error: pErr.message };
    if (!person) return { ok: false, error: "That contact no longer exists." };
    referrer = personHit(person);
  }

  const { error } = await companyOs.from("deals").update({ referrer_id: referrerId }).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    newData: { referrer_id: referrerId },
  });
  refresh();
  return { ok: true, referrer };
}

// Create a brand-new contact (name + email) and link them as the referrer.
// Matches on email first so a referrer who is already in the CRM is reused
// rather than duplicated (people.email is a unique citext).
export async function createReferrerForDeal(
  dealId: string,
  name: string,
  email: string,
): Promise<{ ok: true; referrer: PersonHit; created: boolean } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  const fullName = name.trim();
  const addr = email.trim();
  if (!fullName) return { ok: false, error: "Referrer name is required." };
  if (!EMAIL_RE.test(addr)) return { ok: false, error: "Enter a valid email." };

  const { data: existing, error: exErr } = await companyOs
    .from("people")
    .select("id, full_name, email")
    .eq("email", addr)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  let person = existing;
  let created = false;
  if (!person) {
    const { data: inserted, error: insErr } = await insertPeople({ full_name: fullName, email: addr, source: "referral" })
      .select("id, full_name, email")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    person = inserted;
    created = true;
    await recordAudit({
      table: "people",
      recordId: person.id,
      operation: "insert",
      actor: admin.email,
      newData: { full_name: fullName, email: addr, source: "referral" },
    });
  }

  const { error } = await companyOs.from("deals").update({ referrer_id: person.id }).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    newData: { referrer_id: person.id },
  });

  refresh();
  return { ok: true, referrer: personHit(person), created };
}

// ─── Referring company ───────────────────────────────────────────────────────
// A deal can also credit a referring company directly, via deals.referrer_company_id.
// This is a separate field from the person referrer above — companies are picked,
// never created here.
export type CompanyHit = { id: string; name: string | null };

// Typeahead for the referring-company picker. Strips PostgREST filter
// metacharacters from the raw term exactly like searchPeople.
export async function searchCompanies(query: string): Promise<CompanyHit[]> {
  await requireAdmin();

  const term = query.trim().replace(/[,%()*\\]/g, "");
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const { data, error } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .ilike("name", like)
    .order("name")
    .limit(8);
  if (error) return [];
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

// Link an existing company as the deal's referring company, or clear it with null.
export async function setDealReferrerCompany(
  dealId: string,
  referrerCompanyId: string | null,
): Promise<{ ok: true; referrerCompany: CompanyHit | null } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  let referrerCompany: CompanyHit | null = null;
  if (referrerCompanyId) {
    const { data: company, error: cErr } = await companyOs
      .from("companies")
      .select("id, name, archived_at")
      .eq("id", referrerCompanyId)
      .maybeSingle();
    if (cErr) return { ok: false, error: cErr.message };
    if (!company || company.archived_at) return { ok: false, error: "That company no longer exists." };
    referrerCompany = { id: company.id, name: company.name };
  }

  const { error } = await companyOs
    .from("deals")
    .update({ referrer_company_id: referrerCompanyId })
    .eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    newData: { referrer_company_id: referrerCompanyId },
  });
  refresh();
  return { ok: true, referrerCompany };
}
