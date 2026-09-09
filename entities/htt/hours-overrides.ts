// Overrides on the human hours ledger: a person's correction of one day, its
// withdrawal, and the per-person daily focus budget. The rule and the
// recompute live in hours-ledger.ts; this file only writes the rows a human
// asked for, and audits each one.
import { companyOs, htt } from "@/kernel/data/supabase";
import { updatePeople } from "@/kernel/identity/writes";
import { recordAudit } from "@/kernel/audit/audit";
import { DEFAULT_FOCUS_HOURS } from "./day-hours";

type Result = { ok: true } | { ok: false; error: string };

/** A person's override for one day: a manual row keyed like the auto row, with
 *  the auto row excluded while the override stands. Audited. */
export async function setDayOverride(input: {
  repoId: string;
  personId: string;
  day: string;
  hours: number;
  reason: string;
  actor: string;
}): Promise<Result> {
  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) return { ok: false, error: "Hours must be between 0 and 24." };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { ok: false, error: "Bad day." };

  const { data: repo, error: repoErr } = await htt.from("repos").select("company_id").eq("id", input.repoId).maybeSingle();
  if (repoErr) return { ok: false, error: repoErr.message };
  if (!repo) return { ok: false, error: "Repo not found." };

  const { data: auto, error: autoErr } = await htt
    .from("man_hour_entries")
    .select("id, hours")
    .eq("source", "auto_session")
    .eq("person_id", input.personId)
    .eq("repo_id", input.repoId)
    .eq("occurred_on", input.day);
  if (autoErr) return { ok: false, error: autoErr.message };
  const { data: manual, error: manErr } = await htt
    .from("man_hour_entries")
    .select("id, hours")
    .eq("source", "manual")
    .eq("person_id", input.personId)
    .eq("repo_id", input.repoId)
    .eq("occurred_on", input.day)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (manErr) return { ok: false, error: manErr.message };

  const now = new Date().toISOString();
  const existing = (manual ?? [])[0];
  let recordId: string | null = existing?.id ?? null;
  if (existing) {
    const { error } = await htt
      .from("man_hour_entries")
      .update({ hours: Math.round(hours * 100) / 100, description: reason, created_by: input.actor, status: "recorded", updated_at: now })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: inserted, error } = await htt
      .from("man_hour_entries")
      .insert({
        person_id: input.personId,
        company_id: repo.company_id,
        repo_id: input.repoId,
        hours: Math.round(hours * 100) / 100,
        occurred_on: input.day,
        occurred_hour: 0,
        source: "manual",
        description: reason,
        created_by: input.actor,
        status: "recorded",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    recordId = inserted.id;
  }
  const autoIds = (auto ?? []).map((r) => r.id);
  if (autoIds.length > 0) {
    const { error } = await htt.from("man_hour_entries").update({ status: "excluded", needs_review: false, updated_at: now }).in("id", autoIds);
    if (error) return { ok: false, error: error.message };
  }
  await recordAudit({
    table: "man_hour_entries",
    recordId,
    operation: existing ? "update" : "insert",
    actor: input.actor,
    oldData: { hours: existing?.hours ?? (auto ?? [])[0]?.hours ?? null },
    newData: { hours, reason },
    context: { repoId: input.repoId, personId: input.personId, day: input.day, kind: "hours-override" },
  });
  return { ok: true };
}

/** Withdraw an override: the manual row is excluded and the auto row bills again. */
export async function clearDayOverride(input: { repoId: string; personId: string; day: string; actor: string }): Promise<Result> {
  const now = new Date().toISOString();
  const { data: manual, error: manErr } = await htt
    .from("man_hour_entries")
    .select("id, hours")
    .eq("source", "manual")
    .eq("person_id", input.personId)
    .eq("repo_id", input.repoId)
    .eq("occurred_on", input.day)
    .neq("status", "excluded");
  if (manErr) return { ok: false, error: manErr.message };
  const manualIds = (manual ?? []).map((r) => r.id);
  if (manualIds.length > 0) {
    const { error } = await htt.from("man_hour_entries").update({ status: "excluded", updated_at: now }).in("id", manualIds);
    if (error) return { ok: false, error: error.message };
  }
  const { error: autoErr } = await htt
    .from("man_hour_entries")
    .update({ status: "recorded", updated_at: now })
    .eq("source", "auto_session")
    .eq("person_id", input.personId)
    .eq("repo_id", input.repoId)
    .eq("occurred_on", input.day)
    .eq("status", "excluded");
  if (autoErr) return { ok: false, error: autoErr.message };
  await recordAudit({
    table: "man_hour_entries",
    recordId: manualIds[0] ?? null,
    operation: "update",
    actor: input.actor,
    oldData: { hours: (manual ?? [])[0]?.hours ?? null },
    newData: { override: null },
    context: { repoId: input.repoId, personId: input.personId, day: input.day, kind: "hours-override-cleared" },
  });
  return { ok: true };
}

/** The person's daily focus budget. Days already computed keep their split
 *  until they are next recomputed. */
export async function setPersonFocusHours(personId: string, hours: number, actor: string): Promise<Result> {
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) return { ok: false, error: "Budget must be between 0 and 24 hours." };
  const { error } = await updatePeople({ daily_focus_hours: Math.round(hours * 100) / 100 }).eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "people",
    recordId: personId,
    operation: "update",
    actor,
    newData: { daily_focus_hours: hours },
    context: { kind: "focus-budget" },
  });
  return { ok: true };
}

/** Budgets by person id, for the ledger header. */
export async function listFocusBudgets(personIds: string[]): Promise<Record<string, number>> {
  if (personIds.length === 0) return {};
  const { data, error } = await companyOs.from("people").select("id, daily_focus_hours").in("id", personIds);
  if (error) throw new Error(`people read failed: ${error.message}`);
  const out: Record<string, number> = {};
  for (const p of data ?? []) out[p.id] = Number(p.daily_focus_hours ?? DEFAULT_FOCUS_HOURS);
  return out;
}
