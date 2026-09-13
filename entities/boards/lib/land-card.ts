// What happens when a card lands in a column, written once.
//
// A same-board move and a cross-board move used to each spell this out: the
// position, the done state, closing the card's open children, the stage log,
// the audit row, the completion event, and the order the follow-up failures
// are reported in. The done-column half was fixed in one copy (W.4) and again
// in the other a week later (W.8), which is what a rule with two homes costs.
// Now the callers resolve WHERE the card lands — a column on this board, or a
// board and its same-named column — and this module owns what landing means.
//
// What this module deliberately does NOT do is close a linked coaching
// commitment. `coaching_commitments` is coaching's table, and an entity that
// creates board cards cannot also be one the board imports, or neither installs
// without the other. So a landing in a done column publishes
// `board.card.completed` and whoever cares subscribes (RS-13, docs/adr/0003).
// A deployment without coaching has no subscriber and the move is unaffected.
import { recordAudit } from "@/kernel/audit/audit";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { publish } from "@/kernel/events";
import type { BoardActor } from "./access";
import { endPosition, refresh } from "./card-helpers";
import { insertTaskStageLog, updateTasks } from "./writes";

export type CardMoveOutcome = { ok: false; error: string } | { ok: true };

export type Landing = {
  taskId: string;
  // Already gated by the caller: the same-board move through boardMutation,
  // the cross-board move through boardMutation and boardActorFor on the target.
  actor: BoardActor;
  from: { boardId: string; columnId: string | null };
  to: { boardId: string; boardSlug: string; columnId: string; isDone: boolean };
  subject: { type: string | null; id: string | null };
  // Columns the caller wants written in the same update as the landing: the
  // cross-board move clears what belonged to the old board.
  also?: TablesUpdate<{ schema: "company_os" }, "tasks">;
  // The stage-log note and any extra audit fields (the old board, say).
  logNote: string | null;
  auditExtra?: Record<string, unknown>;
  // The board slugs whose pages the landing invalidates.
  refreshSlugs: string[];
};

export async function landCard(l: Landing): Promise<CardMoveOutcome> {
  const { taskId, actor, to } = l;
  const completedAt = to.isDone ? new Date().toISOString() : null;
  const updates = {
    board_id: to.boardId,
    board_column_id: to.columnId,
    position: await endPosition(to.boardId, to.columnId),
    status: to.isDone ? "done" : "open",
    completed_at: completedAt,
    ...(l.also ?? {}),
  };
  const { error } = await updateTasks(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };

  // Done means done: when a card reaches a done column its open children —
  // blockers and subtasks are both child tasks — close with it. The person
  // dragging decided the card is finished; the board does not second-guess
  // that with a hard block, it makes the children agree with the parent so
  // the open-blocker badge cannot outlive the card it was on (W.4).
  // The card's own move has persisted whatever happens here, so a failure to
  // close the children is remembered and reported at the end — after the stage
  // log, the audit row and the completion event, which the move still earned.
  let childErr: string | null = null;
  if (to.isDone) {
    const { error: cErr } = await updateTasks({ status: "done", completed_at: completedAt })
      .eq("parent_task_id", taskId)
      .neq("status", "done")
      .is("archived_at", null);
    if (cErr) childErr = cErr.message;
  }

  // From here on the move itself has persisted. There is no transaction (that
  // needs an RPC and a migration, deferred), so each follow-up write reports
  // its own failure — after every follow-up has had its turn — and the
  // message says what did land, so the user does not retry the move and does
  // know the history needs a look.
  const { error: logErr } = await insertTaskStageLog({
    task_id: taskId,
    from_column_id: l.from.columnId,
    to_column_id: to.columnId,
    kind: "move",
    moved_by: actor.personId,
    note: l.logNote,
  });

  // The move has persisted and been logged, so it is audited here even when a
  // follow-up fails: the card really did move and the trail should say so.
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { ...updates, ...(l.auditExtra ?? {}) } });
  for (const slug of l.refreshSlugs) refresh(slug);

  // Published after the move has persisted and been audited, so a subscriber
  // never acts on a move that did not land, and under the board the card now
  // lives on, so a subscriber that links back links to where the card is.
  // Handler failures are the bus's to log and audit; they cannot fail this.
  if (to.isDone) {
    await publish("board.card.completed", { taskId, boardSlug: to.boardSlug, subjectType: l.subject.type, subjectId: l.subject.id });
  }
  // A failed stage log is reported after the audit row and the completion
  // event, which the move earned by persisting: returning on it first left a
  // done move with no audit row and a commitment nobody marked kept.
  if (logErr) return { ok: false, error: `Card moved, but the stage history could not be written: ${logErr.message}` };
  if (childErr) return { ok: false, error: `Card moved, but its open blockers and subtasks could not be closed: ${childErr}` };
  return { ok: true };
}
