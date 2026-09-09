"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { recordRoutineRun } from "@/kernel/audit/routine-runs";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { loadCampaign, setWriterState } from "./data";
import { kickWriterStep, runWriterStep, WRITER_ROUTINE_ID } from "./run-step";
import type { AdvanceResult } from "./advance";
import { isWriterStep } from "./steps";
import { startWriterRun } from "./advance";

// The hub's four verbs on a writer run. Start executes the first step in this
// request so the operator sees movement at once; the run hands itself on from
// there. Retry clears the error on the current step and hands the run on;
// Continue hands on a run whose hand-off was dropped; Stop ends the run and
// keeps whatever the steps so far wrote on the assets.

type Result = { ok: true } | { ok: false; error: string };

const idSchema = z.string().uuid("Not a campaign id.");

function refresh(campaignId: string): void {
  revalidatePath(`/admin/revenue/marketing/campaigns/${campaignId}`);
}

export async function startWriter(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const loaded = await loadCampaign(parsed.data);
  if (!loaded.ok) return loaded;
  if (!loaded.data.brandId) return { ok: false, error: "Set a brand on this campaign first, so the writer knows the voice and process." };
  if (!loaded.data.idea?.trim()) return { ok: false, error: "Write the campaign idea first; it is the brief the writer works from." };
  if (isWriterStep(loaded.data.writerStep) && !loaded.data.writerError) {
    return { ok: false, error: "The writer is already running on this campaign." };
  }

  const started = await startWriterRun(parsed.data);
  if (!started.ok) return started;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "start" } });

  // The first step runs here, recorded like every other step so Settings ->
  // Agents shows it with its tokens; the run hands itself on from there.
  const holder: { result: AdvanceResult } = { result: { skipped: "not run", campaignId: parsed.data } };
  await recordRoutineRun(WRITER_ROUTINE_ID, async () => {
    holder.result = await runWriterStep(parsed.data);
    return Response.json(holder.result);
  });
  const first = holder.result;
  refresh(parsed.data);
  if ("skipped" in first) return { ok: false, error: first.skipped };
  if (!first.ok) return { ok: false, error: first.error };
  return { ok: true };
}

export async function retryWriterStep(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadCampaign(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isWriterStep(loaded.data.writerStep)) return { ok: false, error: "There is no step to retry." };

  const cleared = await setWriterState(parsed.data, { step: loaded.data.writerStep, error: null });
  if (!cleared.ok) return cleared;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "retry", step: loaded.data.writerStep } });
  await kickWriterStep(parsed.data);
  refresh(parsed.data);
  return { ok: true };
}

export async function continueWriter(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadCampaign(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isWriterStep(loaded.data.writerStep)) return { ok: false, error: "There is no run to continue." };
  if (loaded.data.writerError) return { ok: false, error: "The run stopped with an error; use Retry step." };

  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "continue", step: loaded.data.writerStep } });
  await kickWriterStep(parsed.data);
  return { ok: true };
}

export async function stopWriter(campaignId: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const stopped = await setWriterState(parsed.data, { step: null, error: null });
  if (!stopped.ok) return stopped;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "stop" } });
  refresh(parsed.data);
  return { ok: true };
}
