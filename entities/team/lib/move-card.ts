"use server";

// Move a card between columns. Shared by the admin board, the team board views
// and the team "my tasks" strips: it re-checks board membership
// (boardActorFor), logs the stage move and syncs a linked coaching commitment,
// so every caller is presentation only. Lifted out of the admin route's
// actions.ts by ME-11 because an entity may not import route code under app/.
//
// It lives in team, not company-os, because the last step writes
// coaching_commitments, a team table: the entity layers (Q2) let team call
// down into company-os for the board pieces, while company-os's door graph may
// not reach team. Every board surface — the admin board page included, a mount
// that may import any entity — takes it from the team index and hands it to
// BoardView (or the "my tasks" strips) as the `onMove` prop.
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import {
  DENIED,
  SUBJECT_COMMITMENT,
  boardActorFor,
  endPosition,
  insertTaskStageLog,
  refresh,
  updateTasks,
} from "@/entities/company-os";

type Result = { ok: true } | { ok: false; error: string };

export async function moveCard(taskId: string, toColumnId: string, boardSlug: string): Promise<Result> {
  const { data: task, error: taskErr } = await companyOs
    .from("tasks")
    .select("id, board_id, board_column_id, subject_type, subject_id")
    .eq("id", taskId)
    .maybeSingle();
  // A failed lookup is not a missing card; saying "not found" would send the
  // user hunting for a card that is still there.
  if (taskErr) return { ok: false, error: `Could not load the card: ${taskErr.message}` };
  if (!task) return { ok: false, error: "Card not found." };
  const t = task as {
    id: string;
    board_id: string;
    board_column_id: string | null;
    subject_type: string | null;
    subject_id: string | null;
  };
  const actor = await boardActorFor(t.board_id);
  if (!actor) return { ok: false, error: DENIED };

  const { data: col } = await companyOs
    .from("board_columns")
    .select("id, is_done")
    .eq("id", toColumnId)
    .eq("board_id", t.board_id)
    .maybeSingle();
  if (!col) return { ok: false, error: "That column is not on this board." };
  const isDone = (col as { is_done: boolean }).is_done;
  if (t.board_column_id === toColumnId) return { ok: true };

  const updates = {
    board_column_id: toColumnId,
    position: await endPosition(t.board_id, toColumnId),
    status: isDone ? "done" : "open",
    completed_at: isDone ? new Date().toISOString() : null,
  };
  const { error } = await updateTasks(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  // From here on the move itself has persisted. There is no transaction (that
  // needs an RPC and a migration, deferred), so each follow-up write reports
  // its own failure and the message says what did land, so the user does not
  // retry the move and does know the history/commitment needs a look.
  const { error: logErr } = await insertTaskStageLog({
    task_id: taskId,
    from_column_id: t.board_column_id,
    to_column_id: toColumnId,
    kind: "move",
    moved_by: actor.personId,
    note: null,
  });
  if (logErr) {
    refresh(boardSlug);
    return { ok: false, error: `Card moved, but the stage history could not be written: ${logErr.message}` };
  }

  // One-way sync: moving a commitment-linked card into a done column marks the
  // coaching commitment kept. Never the reverse.
  if (isDone && t.subject_type === SUBJECT_COMMITMENT && t.subject_id) {
    const { error: commitErr } = await companyOs
      .from("coaching_commitments")
      .update({ status: "completed", closed_at: new Date().toISOString() })
      .eq("id", t.subject_id)
      .neq("status", "completed");
    if (commitErr) {
      refresh(boardSlug);
      return { ok: false, error: `Card moved, but the linked commitment could not be marked kept: ${commitErr.message}` };
    }
  }

  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}
