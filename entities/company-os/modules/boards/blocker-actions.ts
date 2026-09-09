"use server";

// Blocker actions, split from actions.ts for the file-size gate (BL-01).
//
// A blocker is a child task flagged metadata.kind === "blocker": its body is the
// title, the person it is tagged to (a team member or client contact) is the
// assignee, and "resolved" is the done status. It works exactly like a subtask,
// and never becomes a board member — a client contact tag is attribution, not
// access. Each action's first statement is `boardMutation`, so it is gated
// exactly as the actions in actions.ts (check-action-auth lists it as a guard).

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/entities/company-os/lib/mutations";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";

export async function addBlocker(parentTaskId: string, body: string, assigneeId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: parentTaskId, label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const boardId = gate.row.board_id;
  const text = body?.trim();
  if (!text) return { ok: false, error: "Describe the blocker." };
  const { data, error } = await companyOs
    .from("tasks")
    .insert({ board_id: boardId, parent_task_id: parentTaskId, title: text, assignee_id: assigneeId, status: "open", priority: "p3", position: 0, metadata: { kind: "blocker" } })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: data.id, operation: "insert", actor: actor.label, newData: { parent_task_id: parentTaskId, kind: "blocker", title: text, assignee_id: assigneeId } });
  refresh(boardSlug);
  return { ok: true };
}

export async function toggleBlocker(blockerId: string, resolved: boolean, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: blockerId, label: "blocker" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs
    .from("tasks")
    .update({ status: resolved ? "done" : "open", completed_at: resolved ? new Date().toISOString() : null })
    .eq("id", blockerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: blockerId, operation: "update", actor: actor.label, newData: { resolved } });
  refresh(boardSlug);
  return { ok: true };
}

export async function setBlockerAssignee(blockerId: string, assigneeId: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: blockerId, label: "blocker" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const { error } = await companyOs.from("tasks").update({ assignee_id: assigneeId }).eq("id", blockerId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: blockerId, operation: "update", actor: actor.label, newData: { assignee_id: assigneeId } });
  refresh(boardSlug);
  return { ok: true };
}
