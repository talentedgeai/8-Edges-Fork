import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

// What happens around a deal's stage move, shared by every path that moves one
// (the board drag, the detail page, the bulk editor, the lead hand-off that
// creates a deal): the forecast gate and the stage log (RH-2).
//
// The gate: an open deal entering Proposal, or any open stage after it, must
// carry an amount and an expected close date. Both feed the forecast; a deal
// missing either sat on the pipeline board looking real and was missing from
// every forecast chart. The rule is on the deal, not the person: it says what
// the deal is missing, and nothing here counts refusals.
//
// The log: one append-only row per move, the pattern task_stage_log follows.
// Aging in stage and conversion by stage read it; the deal detail shows it.
// moved_by is the audit label and is never grouped for a figure.

export const FORECAST_GATE_STAGE = "Proposal";

export type StageRow = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
export type ForecastInputs = { amount_cents: number | null; expected_close_date: string | null };

// The message when the deal may not enter the stage, or null when it may.
// `incoming` is what the same request is about to write, so a form that fills
// the amount and moves the stage in one save is not refused for the old row.
export function forecastInputsError(
  stages: StageRow[],
  toStageId: string,
  deal: ForecastInputs,
  incoming: Partial<ForecastInputs> = {},
): string | null {
  const to = stages.find((s) => s.id === toStageId);
  if (!to || to.is_won || to.is_lost) return null;
  const gate = stages.find((s) => s.name === FORECAST_GATE_STAGE && !s.is_won && !s.is_lost);
  if (!gate || to.position < gate.position) return null;
  const amount = incoming.amount_cents !== undefined ? incoming.amount_cents : deal.amount_cents;
  const close = incoming.expected_close_date !== undefined ? incoming.expected_close_date : deal.expected_close_date;
  const missing: string[] = [];
  if (!amount || amount <= 0) missing.push("an amount");
  if (!close) missing.push("an expected close date");
  if (missing.length === 0) return null;
  return `${to.name} needs ${missing.join(" and ")} on the deal first, so the forecast can count it.`;
}

export type StageContext = { stageId: string | null } & ForecastInputs;

// The deal's current stage and forecast inputs, read once before a move so the
// gate can judge and the log can record where the deal came from.
export async function loadStageContext(dealId: string): Promise<{ ok: true; deal: StageContext; stages: StageRow[] } | { ok: false; error: string }> {
  const [dealRes, stagesRes] = await Promise.all([
    companyOs.from("deals").select("stage_id, amount_cents, expected_close_date").eq("id", dealId).maybeSingle(),
    companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position"),
  ]);
  if (dealRes.error) return { ok: false, error: dealRes.error.message };
  if (stagesRes.error) return { ok: false, error: stagesRes.error.message };
  const d = (dealRes.data ?? { stage_id: null, amount_cents: null, expected_close_date: null }) as { stage_id: string | null; amount_cents: number | null; expected_close_date: string | null };
  return { ok: true, deal: { stageId: d.stage_id, amount_cents: d.amount_cents, expected_close_date: d.expected_close_date }, stages: (stagesRes.data ?? []) as StageRow[] };
}

export type StageMove = {
  dealId: string;
  fromStageId: string | null;
  toStageId: string;
  kind?: "move" | "create";
  movedBy: string | null;
  note?: string | null;
};

// Append the move. The deal's own update has already persisted when this runs,
// so a failure here is logged and reported to the caller as a message about
// the history, never as a failed move.
export async function recordDealStageMove(moves: StageMove | StageMove[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = Array.isArray(moves) ? moves : [moves];
  const rows = list
    .filter((m) => m.fromStageId !== m.toStageId)
    .map((m) => ({ deal_id: m.dealId, from_stage_id: m.fromStageId, to_stage_id: m.toStageId, kind: m.kind ?? "move", moved_by: m.movedBy, note: m.note ?? null }));
  if (rows.length === 0) return { ok: true };
  const { error } = await companyOs.from("deal_stage_log").insert(rows);
  if (error) {
    console.error("[crm] deal_stage_log", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// What a deal takes on when it enters a stage: the stage's default probability,
// when the stage has one. Applied on entry only, so a rep's later override
// sticks. Pure, so the rule is testable without a database.
export function stageEntryPatch(stage: { is_won: boolean; is_lost: boolean; default_probability: number | null }): { probability?: number } {
  if (stage.is_won || stage.is_lost) return {};
  return stage.default_probability == null ? {} : { probability: stage.default_probability };
}

export type NewDealRow = TablesInsert<{ schema: "company_os" }, "deals"> & { stage_id: string };

// The one way to create a deal. Every path that used to insert a row itself
// (the SDR hand-off, the portal's Build Your Team request) goes through here,
// so the stage log's first row is written by construction rather than by each
// caller remembering to. The insert's failure is the caller's to handle; the
// log's failure is reported but never undoes the deal.
export async function createDeal(row: NewDealRow, meta: { movedBy: string | null; note?: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("deals").insert(row).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "The deal was not created." };
  await recordDealStageMove({ dealId: data.id, fromStageId: null, toStageId: row.stage_id, kind: "create", movedBy: meta.movedBy, note: meta.note ?? null });
  return { ok: true, id: data.id };
}

export type StageHistoryRow = { id: string; from_stage_id: string | null; to_stage_id: string | null; kind: string; moved_at: string; note: string | null };

export async function readDealStageHistory(dealId: string): Promise<StageHistoryRow[]> {
  const { data, error } = await companyOs
    .from("deal_stage_log")
    .select("id, from_stage_id, to_stage_id, kind, moved_at, note")
    .eq("deal_id", dealId)
    .order("moved_at", { ascending: false });
  if (error) {
    console.error("[crm] deal_stage_log", error);
    return [];
  }
  return (data ?? []) as StageHistoryRow[];
}
