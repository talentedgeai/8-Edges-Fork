"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { requireAdmin } from "@/kernel/identity/admin-auth";
import { type Result } from "@/entities/company-os/lib/mutations";
import { boardActorFor } from "@/entities/company-os/modules/boards/access";
import { notifyBoardAssignee } from "@/entities/company-os/modules/boards/notify";
import { DENIED, endPosition, refresh } from "@/entities/company-os/modules/boards/card-helpers";
import { TASK_PRIORITIES, SUBJECT_COMMITMENT, SUBJECT_BACKLOG_ITEM, EPIC_COLORS, type TaskPriority } from "@/entities/company-os/modules/boards/types";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { createCardInput, type CreateCardInput } from "./schemas";

async function boardIdForTask(taskId: string): Promise<string | null> {
  const { data } = await companyOs.from("tasks").select("board_id").eq("id", taskId).maybeSingle();
  return (data as { board_id: string | null } | null)?.board_id ?? null;
}

// Assigning a card to someone makes them a board member (they need to see it).
// Returns the DB error message, or null on success, so callers can tell the
// user the card itself was saved even when this follow-up write failed.
async function ensureMember(boardId: string, personId: string): Promise<string | null> {
  const { error } = await companyOs
    .from("board_members")
    .upsert({ board_id: boardId, person_id: personId, role: "member" }, { onConflict: "board_id,person_id", ignoreDuplicates: true });
  return error ? error.message : null;
}

function cleanPriority(p: string | undefined): TaskPriority {
  return TASK_PRIORITIES.includes(p as TaskPriority) ? (p as TaskPriority) : "p3";
}

// Human Tokens are whole non-negative hours; anything else stores as null.
function cleanTokens(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 ? n : null;
}

export async function createCard(raw: CreateCardInput): Promise<Result & { id?: string }> {
  const actor = await boardActorFor(raw.boardId);
  if (!actor) return { ok: false, error: DENIED };
  // The guard stays first (the action-auth check insists on it); the schema
  // runs next so everything below sees a trimmed, well-typed input.
  const parsed = createCardInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const input = parsed.data;
  const title = input.title;

  const { data: col } = await companyOs
    .from("board_columns")
    .select("id, is_done")
    .eq("id", input.columnId)
    .eq("board_id", input.boardId)
    .maybeSingle();
  if (!col) return { ok: false, error: "That column is not on this board." };
  const isDone = (col as { is_done: boolean }).is_done;

  const row = {
    board_id: input.boardId,
    board_column_id: input.columnId,
    title,
    description: input.description?.trim() || null,
    priority: cleanPriority(input.priority),
    assignee_id: input.assigneeId || null,
    created_by: actor.personId,
    due_date: input.dueDate || null,
    human_tokens: cleanTokens(input.humanTokens),
    internal: input.internal ?? false,
    status: isDone ? "done" : "open",
    completed_at: isDone ? new Date().toISOString() : null,
    position: await endPosition(input.boardId, input.columnId),
    // assigned_at drives the "New" chip the assignee sees on the board.
    metadata: input.assigneeId ? { assigned_at: new Date().toISOString() } : {},
  };
  const { data, error } = await companyOs.from("tasks").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  if (input.assigneeId) {
    const memberErr = await ensureMember(input.boardId, input.assigneeId);
    if (memberErr) {
      // The card row exists at this point. Hand the id back with the failure so
      // the client can turn its retry into an update instead of a second card.
      refresh();
      return { ok: false, error: `Card created, but the assignee could not be added to the board: ${memberErr}`, id: data.id };
    }
    await notifyBoardAssignee(input.boardId, input.assigneeId, title, actor.personId);
  }
  await recordAudit({ table: "tasks", recordId: data.id, operation: "insert", actor: actor.label, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

// Link (or clear) a card's roadmap item. Scoped to the board's client, and only
// when the card isn't already linked to a commitment (one link per card).
export async function setCardRoadmapItem(
  taskId: string,
  backlogItemId: string | null,
  boardSlug: string,
): Promise<Result> {
  const { data: task } = await companyOs
    .from("tasks")
    .select("id, board_id, subject_type")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Card not found." };
  const t = task as { id: string; board_id: string; subject_type: string | null };
  const actor = await boardActorFor(t.board_id);
  if (!actor) return { ok: false, error: DENIED };
  if (t.subject_type === SUBJECT_COMMITMENT) {
    return { ok: false, error: "This card is linked to a commitment. A card links to one thing." };
  }

  if (backlogItemId) {
    const { data: board } = await companyOs
      .from("boards")
      .select("client_company_id")
      .eq("id", t.board_id)
      .maybeSingle();
    const clientId = (board as { client_company_id: string | null } | null)?.client_company_id;
    if (!clientId) return { ok: false, error: "This board has no linked client." };
    const { data: item } = await companyOs
      .from("client_backlog_items")
      .select("id")
      .eq("id", backlogItemId)
      .eq("company_id", clientId)
      .maybeSingle();
    if (!item) return { ok: false, error: "That roadmap item is not on this client's roadmap." };
  }

  const updates = backlogItemId
    ? { subject_type: SUBJECT_BACKLOG_ITEM, subject_id: backlogItemId }
    : { subject_type: null, subject_id: null };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

export async function updateCard(
  taskId: string,
  patch: {
    title?: string;
    description?: string | null;
    priority?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    humanTokens?: number | null;
  },
  boardSlug: string,
): Promise<Result> {
  const { data: current } = await companyOs
    .from("tasks")
    .select("board_id, assignee_id, title, metadata")
    .eq("id", taskId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Card not found." };
  const c = current as { board_id: string; assignee_id: string | null; title: string; metadata: Record<string, unknown> };
  const boardId = c.board_id;
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };

  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The card needs a title." };
    updates.title = t;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) updates.priority = cleanPriority(patch.priority);
  if (patch.assigneeId !== undefined) updates.assignee_id = patch.assigneeId || null;
  if (patch.assigneeId && patch.assigneeId !== c.assignee_id) {
    // Restart the "New" window for the incoming assignee.
    updates.metadata = { ...(c.metadata ?? {}), assigned_at: new Date().toISOString() };
  }
  if (patch.dueDate !== undefined) updates.due_date = patch.dueDate || null;
  if (patch.humanTokens !== undefined) updates.human_tokens = cleanTokens(patch.humanTokens);
  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  if (patch.assigneeId) {
    const memberErr = await ensureMember(boardId, patch.assigneeId);
    if (memberErr) {
      refresh(boardSlug);
      return { ok: false, error: `Card saved, but the assignee could not be added to the board: ${memberErr}` };
    }
    if (patch.assigneeId !== c.assignee_id) {
      await notifyBoardAssignee(boardId, patch.assigneeId, (updates.title as string) ?? c.title, actor.personId);
    }
  }
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

export async function archiveCard(taskId: string, boardSlug: string): Promise<Result> {
  const boardId = await boardIdForTask(taskId);
  if (!boardId) return { ok: false, error: "Card not found." };
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const updates = { archived_at: new Date().toISOString(), archived_by: actor.label };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId).is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "archive", actor: actor.label });
  refresh(boardSlug);
  return { ok: true };
}

// Hide/show a card in the linked client's portal (client boards only in the UI).
export async function setCardInternal(taskId: string, internal: boolean, boardSlug: string): Promise<Result> {
  const boardId = await boardIdForTask(taskId);
  if (!boardId) return { ok: false, error: "Card not found." };
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const { error } = await companyOs.from("tasks").update({ internal }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { internal } });
  refresh(boardSlug);
  return { ok: true };
}

export async function createSprint(
  boardId: string,
  input: { name: string; startsOn?: string; endsOn?: string; goal?: string },
  boardSlug: string,
): Promise<Result & { id?: string }> {
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the sprint." };
  const row = {
    board_id: boardId,
    name,
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
    goal: input.goal?.trim() || null,
    status: "active",
  };
  const { data, error } = await companyOs.from("sprints").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: data.id, operation: "insert", actor: actor.label, newData: row });
  refresh(boardSlug);
  return { ok: true, id: data.id };
}

export async function setCardSprint(taskId: string, sprintId: string | null, boardSlug: string): Promise<Result> {
  const { data: task } = await companyOs.from("tasks").select("board_id, sprint_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, error: "Card not found." };
  const t = task as { board_id: string; sprint_id: string | null };
  const actor = await boardActorFor(t.board_id);
  if (!actor) return { ok: false, error: DENIED };
  if (sprintId) {
    const { data: sprint } = await companyOs
      .from("sprints")
      .select("id")
      .eq("id", sprintId)
      .eq("board_id", t.board_id)
      .maybeSingle();
    if (!sprint) return { ok: false, error: "That sprint is not on this board." };
  }
  if (t.sprint_id === sprintId) return { ok: true };
  const { error } = await companyOs.from("tasks").update({ sprint_id: sprintId }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  const { error: logErr } = await companyOs
    .from("task_stage_log")
    .insert({ task_id: taskId, from_sprint_id: t.sprint_id, to_sprint_id: sprintId, kind: "sprint_move", moved_by: actor.personId });
  if (logErr) {
    refresh(boardSlug);
    return { ok: false, error: `Sprint changed, but the stage history could not be written: ${logErr.message}` };
  }
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { sprint_id: sprintId } });
  refresh(boardSlug);
  return { ok: true };
}

// Close a sprint: roll its unfinished (not done, not archived) cards to the
// chosen next sprint or back to backlog (null), logging each rollover.
export async function closeSprint(
  sprintId: string,
  rolloverToSprintId: string | null,
  boardSlug: string,
): Promise<Result> {
  const { data: sprint } = await companyOs.from("sprints").select("board_id").eq("id", sprintId).maybeSingle();
  if (!sprint) return { ok: false, error: "Sprint not found." };
  const boardId = (sprint as { board_id: string }).board_id;
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  if (rolloverToSprintId) {
    const { data: target } = await companyOs
      .from("sprints")
      .select("id")
      .eq("id", rolloverToSprintId)
      .eq("board_id", boardId)
      .maybeSingle();
    if (!target) return { ok: false, error: "That sprint is not on this board." };
  }

  const { data: openCards, error: openErr } = await companyOs
    .from("tasks")
    .select("id")
    .eq("sprint_id", sprintId)
    .neq("status", "done")
    .is("archived_at", null);
  // If this read fails we must not go on to close the sprint: an empty list
  // here would silently strand every unfinished card in a closed sprint.
  if (openErr) return { ok: false, error: `Could not load the sprint's open cards: ${openErr.message}` };
  const ids = ((openCards ?? []) as { id: string }[]).map((c) => c.id);
  if (ids.length) {
    const { error: upErr } = await companyOs.from("tasks").update({ sprint_id: rolloverToSprintId }).in("id", ids);
    if (upErr) return { ok: false, error: upErr.message };
    const { error: logErr } = await companyOs.from("task_stage_log").insert(
      ids.map((id) => ({
        task_id: id,
        from_sprint_id: sprintId,
        to_sprint_id: rolloverToSprintId,
        kind: "sprint_rollover",
        moved_by: actor.personId,
      })),
    );
    // Cards have already rolled over; the sprint stays open so the user sees
    // the state is half-applied and can close it again once history writes.
    if (logErr) {
      refresh(boardSlug);
      return { ok: false, error: `Cards rolled over, but the stage history could not be written: ${logErr.message}` };
    }
  }
  const { error } = await companyOs
    .from("sprints")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "sprints",
    recordId: sprintId,
    operation: "update",
    actor: actor.label,
    newData: { status: "closed", rolled: ids.length, to: rolloverToSprintId },
  });
  refresh(boardSlug);
  return { ok: true };
}


// ── Epics (a board-scoped grouping of cards into a larger feature) ─────────
function cleanEpicColor(c: string | undefined | null): string | null {
  return c && EPIC_COLORS.includes(c as (typeof EPIC_COLORS)[number]) ? c : null;
}

export async function createEpic(
  boardId: string,
  input: { name: string; color?: string; description?: string },
  boardSlug: string,
): Promise<Result & { id?: string }> {
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name the epic." };
  // Next sort_order, and a default color cycling through the palette so new
  // epics look distinct without the user picking one.
  const { data: last } = await companyOs
    .from("epics")
    .select("sort_order")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;
  const row = {
    board_id: boardId,
    name,
    description: input.description?.trim() || null,
    color: cleanEpicColor(input.color) ?? EPIC_COLORS[nextOrder % EPIC_COLORS.length],
    status: "active",
    sort_order: nextOrder,
  };
  const { data, error } = await companyOs.from("epics").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "epics", recordId: data.id, operation: "insert", actor: actor.label, newData: row });
  refresh(boardSlug);
  return { ok: true, id: data.id };
}

export async function updateEpic(
  epicId: string,
  patch: { name?: string; description?: string | null; color?: string | null },
  boardSlug: string,
): Promise<Result> {
  const { data: epic } = await companyOs.from("epics").select("board_id").eq("id", epicId).maybeSingle();
  if (!epic) return { ok: false, error: "Epic not found." };
  const actor = await boardActorFor((epic as { board_id: string }).board_id);
  if (!actor) return { ok: false, error: DENIED };
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "The epic needs a name." };
    updates.name = n;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.color !== undefined) updates.color = cleanEpicColor(patch.color);
  if (Object.keys(updates).length === 0) return { ok: true };
  const { error } = await companyOs.from("epics").update(updates).eq("id", epicId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "epics", recordId: epicId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

// Archive (or restore) an epic. Cards keep their epic_id: an archived epic drops
// out of the toolbar filter but its name/color still resolve on any tagged card.
export async function setEpicArchived(epicId: string, archived: boolean, boardSlug: string): Promise<Result> {
  const { data: epic } = await companyOs.from("epics").select("board_id").eq("id", epicId).maybeSingle();
  if (!epic) return { ok: false, error: "Epic not found." };
  const actor = await boardActorFor((epic as { board_id: string }).board_id);
  if (!actor) return { ok: false, error: DENIED };
  const updates = archived
    ? { status: "archived", archived_at: new Date().toISOString(), archived_by: actor.label }
    : { status: "active", archived_at: null, archived_by: null };
  const { error } = await companyOs.from("epics").update(updates).eq("id", epicId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "epics",
    recordId: epicId,
    operation: archived ? "archive" : "restore",
    actor: actor.label,
  });
  refresh(boardSlug);
  return { ok: true };
}

// Link (or clear) a card's epic. Scoped to the card's board (an epic from another
// board never reaches the update).
export async function setCardEpic(taskId: string, epicId: string | null, boardSlug: string): Promise<Result> {
  const { data: task } = await companyOs.from("tasks").select("board_id, epic_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, error: "Card not found." };
  const t = task as { board_id: string; epic_id: string | null };
  const actor = await boardActorFor(t.board_id);
  if (!actor) return { ok: false, error: DENIED };
  if (epicId) {
    const { data: epic } = await companyOs
      .from("epics")
      .select("id")
      .eq("id", epicId)
      .eq("board_id", t.board_id)
      .maybeSingle();
    if (!epic) return { ok: false, error: "That epic is not on this board." };
  }
  if (t.epic_id === epicId) return { ok: true };
  const { error } = await companyOs.from("tasks").update({ epic_id: epicId }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { epic_id: epicId } });
  refresh(boardSlug);
  return { ok: true };
}

// ── Board management (admin only) ─────────────────────────────────────────
export async function addBoardMember(boardId: string, personId: string, boardSlug: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!personId) return { ok: false, error: "Pick a person." };
  const { error } = await companyOs
    .from("board_members")
    .upsert({ board_id: boardId, person_id: personId, role: "member" }, { onConflict: "board_id,person_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "board_members", recordId: boardId, operation: "insert", actor: admin.email, newData: { person_id: personId } });
  refresh(boardSlug);
  return { ok: true };
}

export async function removeBoardMember(boardId: string, personId: string, boardSlug: string): Promise<Result> {
  const admin = await requireAdmin();
  const { error } = await companyOs.from("board_members").delete().eq("board_id", boardId).eq("person_id", personId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "board_members", recordId: boardId, operation: "delete", actor: admin.email, context: { person_id: personId } });
  refresh(boardSlug);
  return { ok: true };
}

export async function updateBoard(
  boardId: string,
  patch: {
    name?: string;
    description?: string | null;
    clientCompanyId?: string | null;
    // Optional AI Program key. null = company-wide (the default state).
    aiProgramId?: string | null;
  },
  boardSlug: string,
): Promise<Result> {
  const admin = await requireAdmin();
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "The board needs a name." };
    updates.name = n;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.clientCompanyId !== undefined) updates.client_company_id = patch.clientCompanyId || null;
  if (patch.aiProgramId !== undefined) {
    const programId = patch.aiProgramId || null;
    if (programId) {
      // The program must belong to the board's (effective) client company.
      let clientCompanyId = (updates.client_company_id ?? null) as string | null;
      if (patch.clientCompanyId === undefined) {
        const { data: b } = await companyOs
          .from("boards")
          .select("client_company_id")
          .eq("id", boardId)
          .maybeSingle();
        clientCompanyId = (b as { client_company_id: string | null } | null)?.client_company_id ?? null;
      }
      const { data: program } = await companyOs
        .from("ai_programs")
        .select("id, company_id")
        .eq("id", programId)
        .maybeSingle();
      const programCompanyId = (program as { company_id: string } | null)?.company_id;
      if (!programCompanyId || programCompanyId !== clientCompanyId) {
        return { ok: false, error: "That AI Program belongs to a different client." };
      }
    }
    updates.ai_program_id = programId;
  } else if (patch.clientCompanyId !== undefined) {
    // The client changed but no program key was sent: a stale ai_program_id
    // must not keep pointing at the previous company's program (the FK does
    // not enforce the company match, and this action is callable directly).
    const { data: b } = await companyOs
      .from("boards")
      .select("ai_program_id")
      .eq("id", boardId)
      .maybeSingle();
    const currentProgramId = (b as { ai_program_id: string | null } | null)?.ai_program_id ?? null;
    if (currentProgramId) {
      const newClientId = (updates.client_company_id ?? null) as string | null;
      let keep = false;
      if (newClientId) {
        const { data: program } = await companyOs
          .from("ai_programs")
          .select("company_id")
          .eq("id", currentProgramId)
          .maybeSingle();
        keep = ((program as { company_id: string } | null)?.company_id ?? null) === newClientId;
      }
      if (!keep) updates.ai_program_id = null;
    }
  }
  if (Object.keys(updates).length === 0) return { ok: true };
  const { error } = await companyOs.from("boards").update(updates).eq("id", boardId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "update", actor: admin.email, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

export async function archiveBoard(boardId: string): Promise<Result> {
  const admin = await requireAdmin();
  const { error } = await companyOs
    .from("boards")
    .update({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .eq("id", boardId)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "archive", actor: admin.email });
  revalidatePath("/admin/boards", "layout");
  revalidatePath("/team/boards", "layout");
  return { ok: true };
}

// ── Subtasks (checklist under a card) ─────────────────────────────────────
export async function addSubtask(parentTaskId: string, title: string, boardSlug: string): Promise<Result> {
  const { data: parent } = await companyOs.from("tasks").select("board_id").eq("id", parentTaskId).maybeSingle();
  if (!parent) return { ok: false, error: "Card not found." };
  const boardId = (parent as { board_id: string }).board_id;
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const t = title?.trim();
  if (!t) return { ok: false, error: "Give the subtask a title." };
  const { data, error } = await companyOs
    .from("tasks")
    .insert({ board_id: boardId, parent_task_id: parentTaskId, title: t, status: "open", priority: "p3", position: 0 })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: data.id, operation: "insert", actor: actor.label, newData: { parent_task_id: parentTaskId, title: t } });
  refresh(boardSlug);
  return { ok: true };
}

export async function toggleSubtask(subtaskId: string, done: boolean, boardSlug: string): Promise<Result> {
  const { data: st } = await companyOs.from("tasks").select("board_id").eq("id", subtaskId).maybeSingle();
  if (!st) return { ok: false, error: "Subtask not found." };
  const actor = await boardActorFor((st as { board_id: string }).board_id);
  if (!actor) return { ok: false, error: DENIED };
  const { error } = await companyOs
    .from("tasks")
    .update({ status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null })
    .eq("id", subtaskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: subtaskId, operation: "update", actor: actor.label, newData: { status: done ? "done" : "open" } });
  refresh(boardSlug);
  return { ok: true };
}

// Update a sprint's brief: goal, the retro takeaways, and the client-specific
// meeting summary. Any board actor may edit (same gate as card writes).
export async function updateSprintBrief(
  sprintId: string,
  patch: { goal?: string | null; focusImprovement?: string | null; goingWell?: string | null; meetingSummary?: string | null },
  boardSlug: string,
): Promise<Result> {
  const { data: sp } = await companyOs.from("sprints").select("board_id").eq("id", sprintId).maybeSingle();
  if (!sp) return { ok: false, error: "Sprint not found." };
  const actor = await boardActorFor((sp as { board_id: string }).board_id);
  if (!actor) return { ok: false, error: DENIED };

  const updates: Record<string, unknown> = {};
  if (patch.goal !== undefined) updates.goal = patch.goal?.trim() || null;
  if (patch.focusImprovement !== undefined) updates.focus_improvement = patch.focusImprovement?.trim() || null;
  if (patch.goingWell !== undefined) updates.going_well = patch.goingWell?.trim() || null;
  if (patch.meetingSummary !== undefined) updates.meeting_summary = patch.meetingSummary?.trim() || null;
  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("sprints").update(updates).eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "update", actor: actor.label, newData: updates });
  refresh(boardSlug);
  return { ok: true };
}

// Attach (or detach) the planning/retro meeting for a sprint. The meeting is a
// company_os.meetings row; the same meeting may be attached to many sprints.
export async function setSprintMeeting(sprintId: string, meetingId: string | null, boardSlug: string): Promise<Result> {
  const { data: sp } = await companyOs.from("sprints").select("board_id").eq("id", sprintId).maybeSingle();
  if (!sp) return { ok: false, error: "Sprint not found." };
  const actor = await boardActorFor((sp as { board_id: string }).board_id);
  if (!actor) return { ok: false, error: DENIED };
  if (meetingId) {
    const { data: m } = await companyOs.from("meetings").select("id").eq("id", meetingId).maybeSingle();
    if (!m) return { ok: false, error: "Meeting not found." };
  }
  const { error } = await companyOs.from("sprints").update({ meeting_id: meetingId }).eq("id", sprintId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "sprints", recordId: sprintId, operation: "update", actor: actor.label, newData: { meeting_id: meetingId } });
  refresh(boardSlug);
  return { ok: true };
}

// Extract this client's slice of the attached meeting into a DRAFT brief. Reads
// the transcript, returns the draft for review; saving is a separate, explicit
// updateSprintBrief call by the user.
export async function pullSprintBriefFromMeeting(
  sprintId: string,
): Promise<{ ok: true; draft: { goal: string | null; focusImprovement: string | null; goingWell: string | null; meetingSummary: string | null } } | { ok: false; error: string }> {
  const { data: sp } = await companyOs
    .from("sprints")
    .select("board_id, meeting_id")
    .eq("id", sprintId)
    .maybeSingle();
  if (!sp) return { ok: false, error: "Sprint not found." };
  const s = sp as { board_id: string; meeting_id: string | null };
  const actor = await boardActorFor(s.board_id);
  if (!actor) return { ok: false, error: DENIED };
  if (!s.meeting_id) return { ok: false, error: "Attach a meeting first." };

  const { data: board } = await companyOs
    .from("boards")
    .select("client_company_id, name")
    .eq("id", s.board_id)
    .maybeSingle();
  const b = board as { client_company_id: string | null; name: string } | null;
  let clientName = b?.name ?? "";
  if (b?.client_company_id) {
    const { data: co } = await companyOs.from("companies").select("name").eq("id", b.client_company_id).maybeSingle();
    clientName = (co as { name: string } | null)?.name ?? clientName;
  }

  const { extractSprintBrief } = await import("@/entities/company-os/modules/boards/sprint-extract");
  const r = await extractSprintBrief(s.meeting_id, clientName);
  if (!r.ok) return r;
  return {
    ok: true,
    draft: {
      goal: r.draft.goal,
      focusImprovement: r.draft.focus_improvement,
      goingWell: r.draft.going_well,
      meetingSummary: r.draft.meeting_summary,
    },
  };
}

// Set the Human Tokens estimate on any task row (card or subtask).
export async function setTaskTokens(taskId: string, tokens: number | null, boardSlug: string): Promise<Result> {
  const { data: t } = await companyOs.from("tasks").select("board_id").eq("id", taskId).maybeSingle();
  if (!t) return { ok: false, error: "Task not found." };
  const actor = await boardActorFor((t as { board_id: string }).board_id);
  if (!actor) return { ok: false, error: DENIED };
  const human_tokens = cleanTokens(tokens);
  const { error } = await companyOs.from("tasks").update({ human_tokens }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { human_tokens } });
  refresh(boardSlug);
  return { ok: true };
}

// ── Comments ──────────────────────────────────────────────────────────────
export async function addComment(taskId: string, body: string, boardSlug: string): Promise<Result> {
  const boardId = await boardIdForTask(taskId);
  if (!boardId) return { ok: false, error: "Card not found." };
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const text = body?.trim();
  if (!text) return { ok: false, error: "Write a comment first." };
  const { error } = await companyOs
    .from("task_comments")
    .insert({ task_id: taskId, author_person_id: actor.personId, author_label: actor.label, body: text });
  if (error) return { ok: false, error: error.message };
  refresh(boardSlug);
  return { ok: true };
}

// Restore an archived card (bring it back to its board/column).
export async function restoreCard(taskId: string, boardSlug: string): Promise<Result> {
  const boardId = await boardIdForTask(taskId);
  if (!boardId) return { ok: false, error: "Card not found." };
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const { error } = await companyOs.from("tasks").update({ archived_at: null, archived_by: null }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "restore", actor: actor.label });
  refresh(boardSlug);
  return { ok: true };
}
