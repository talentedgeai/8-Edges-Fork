"use server";

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/entities/company-os/lib/mutations";
import { boardActorFor } from "./access";
import { boardMutation } from "./mutation";
import { DENIED, endPosition, refresh } from "./card-helpers";
import { SUBJECT_BACKLOG_ITEM } from "./types";

// Move a card to another board: the Workboard list's "client" edit (WB-03).
// The card lands in the target's same-named column (its first column when the
// name is missing). Sprint and epic belong to the old board and are cleared;
// a roadmap link is cleared when the boards serve different clients, because
// the item belongs to the old client. The move is logged like a column move
// and the audit row names both boards. Both boards are gated: the source
// through boardMutation, the target through boardActorFor.
export async function moveCardToBoard(taskId: string, toBoardId: string): Promise<Result> {
  const gate = await boardMutation({
    table: "tasks",
    id: taskId,
    select: "board_id, board_column_id, sprint_id, epic_id, subject_type",
    label: "card",
  });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const t = gate.row as { board_id: string; board_column_id: string | null; sprint_id: string | null; epic_id: string | null; subject_type: string | null };
  if (t.board_id === toBoardId) return { ok: true };
  if (!(await boardActorFor(toBoardId))) return { ok: false, error: DENIED };

  const [boardsRes, columnsRes] = await Promise.all([
    companyOs.from("boards").select("id, slug, client_company_id").in("id", [t.board_id, toBoardId]).is("archived_at", null),
    companyOs.from("board_columns").select("id, board_id, name, position").in("board_id", [t.board_id, toBoardId]).order("position"),
  ]);
  if (boardsRes.error) return { ok: false, error: boardsRes.error.message };
  if (columnsRes.error) return { ok: false, error: columnsRes.error.message };
  const boards = (boardsRes.data ?? []) as { id: string; slug: string; client_company_id: string | null }[];
  const from = boards.find((b) => b.id === t.board_id);
  const to = boards.find((b) => b.id === toBoardId);
  if (!from || !to) return { ok: false, error: "That board is not available." };
  const columns = (columnsRes.data ?? []) as { id: string; board_id: string; name: string }[];
  const fromName = columns.find((c) => c.id === t.board_column_id)?.name;
  const targetColumns = columns.filter((c) => c.board_id === toBoardId);
  const toColumn = targetColumns.find((c) => c.name === fromName) ?? targetColumns[0];
  if (!toColumn) return { ok: false, error: "The target board has no columns." };

  const sameClient = from.client_company_id === to.client_company_id;
  const updates = {
    board_id: toBoardId,
    board_column_id: toColumn.id,
    position: await endPosition(toBoardId, toColumn.id),
    sprint_id: null,
    epic_id: null,
    ...(t.subject_type === SUBJECT_BACKLOG_ITEM && !sameClient ? { subject_type: null, subject_id: null } : {}),
  };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  // From here the move has persisted; a failed log says so rather than
  // inviting a retry that would find the card already moved.
  const { error: logErr } = await companyOs.from("task_stage_log").insert({
    task_id: taskId,
    from_column_id: t.board_column_id,
    to_column_id: toColumn.id,
    kind: "move",
    moved_by: actor.personId,
    note: `Moved from board ${from.slug} to ${to.slug}`,
  });
  refresh(from.slug);
  refresh(to.slug);
  if (logErr) return { ok: false, error: `Card moved, but the stage history could not be written: ${logErr.message}` };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { ...updates, from_board_id: t.board_id } });
  return { ok: true };
}
