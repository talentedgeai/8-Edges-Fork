"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { requireRevenueAccess } from "@/kernel/identity/revenue-access";
import { recordAuditMany } from "@/kernel/audit/audit";
import { archiveRecord, guardedDelete } from "@/entities/crm/lib/mutations";
import { stageEntryPatch, forecastInputsError, recordDealStageMove, type StageRow } from "@/entities/crm/lib/deal-stage";

// The list view's multi-select actions, moved out of actions.ts when that file
// reached its size cap (RH-2). A bulk stage move obeys the same two rules a
// single move does: the forecast gate (Proposal and later need an amount and
// an expected close date on every selected deal) and one stage-log row per
// deal that actually changed stage.

type BulkResult = { ok: true; message?: string } | { ok: false; error: string };

function refresh() {
  revalidateSurfaces("/revenue/deals");
  revalidateSurfaces("/revenue/leads");
}

export type BulkDealPatch = {
  stage_id?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
};

export async function bulkUpdateDeals(ids: string[], patch: BulkDealPatch): Promise<BulkResult> {
  const admin = await requireRevenueAccess();
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const updates: CompanyOsUpdate<"deals"> = {};
  if (patch.stage_id !== undefined) {
    const { data: stage, error } = await companyOs.from("pipeline_stages").select("is_won, is_lost, default_probability")
      .eq("id", patch.stage_id)
      .maybeSingle();
    if (error || !stage) return { ok: false, error: error?.message ?? "Unknown stage." };
    if (stage.is_won || stage.is_lost) {
      return { ok: false, error: "Bulk move is limited to open stages. Close won/lost deals one at a time." };
    }
    updates.stage_id = patch.stage_id;
    updates.status = "open";
    updates.closed_at = null;
    // The stage's default probability, unless the same edit sets one.
    if (patch.probability === undefined) Object.assign(updates, stageEntryPatch({ ...stage, default_probability: stage.default_probability ?? null }));
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

  // Where each deal is now, so the log can say where it came from, and whether
  // every one of them may enter the stage.
  let before: { id: string; stage_id: string | null; amount_cents: number | null; expected_close_date: string | null }[] = [];
  if (updates.stage_id) {
    const [rowsRes, stagesRes] = await Promise.all([
      companyOs.from("deals").select("id, stage_id, amount_cents, expected_close_date").in("id", ids),
      companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position"),
    ]);
    if (rowsRes.error) return { ok: false, error: rowsRes.error.message };
    if (stagesRes.error) return { ok: false, error: stagesRes.error.message };
    before = (rowsRes.data ?? []) as typeof before;
    const stages = (stagesRes.data ?? []) as StageRow[];
    const refusals = before.map((d) => forecastInputsError(stages, updates.stage_id as string, d, updates)).filter((e): e is string => e !== null);
    if (refusals.length > 0) {
      // One message for the batch: the first deal's reason, which names the
      // stage and what it needs, prefixed with how many are held back.
      return { ok: false, error: `${refusals.length} of ${ids.length} selected deals cannot move. ${refusals[0]}` };
    }
  }

  const { error } = await companyOs.from("deals").update(updates).in("id", ids);
  if (error) return { ok: false, error: error.message };

  // Bulk-moved deals land at the bottom of the destination stage's priority
  // order, appended after whatever was already there.
  if (updates.stage_id) {
    const { count: existing, error: existingErr } = await companyOs.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", updates.stage_id as string).not("id", "in", `(${ids.join(",")})`);
    if (existingErr) return { ok: false, error: existingErr.message };
    // Append after the existing rows in one set-based call, not one per id.
    const { error: posErr } = await companyOs.rpc("set_deal_positions", { p_ids: ids, p_start: existing ?? 0 });
    if (posErr) return { ok: false, error: posErr.message };
    await recordDealStageMove(before.map((d) => ({ dealId: d.id, fromStageId: d.stage_id, toStageId: updates.stage_id as string, movedBy: admin.email, note: "bulk edit" })));
  }

  await recordAuditMany(
    ids.map((id) => ({ table: "deals", recordId: id, operation: "bulk_update" as const, actor: admin.email, newData: updates })),
  );
  refresh();
  return { ok: true, message: `Updated ${ids.length} deal${ids.length === 1 ? "" : "s"}.` };
}

export async function bulkArchiveDeals(ids: string[]): Promise<BulkResult> {
  const admin = await requireRevenueAccess();
  if (ids.length === 0) return { ok: false, error: "No deals selected." };

  const { error } = await companyOs.from("deals").update({ archived_at: new Date().toISOString(), archived_by: admin.email })
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
  const admin = await requireRevenueAccess();
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
