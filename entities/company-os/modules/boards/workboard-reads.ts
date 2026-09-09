// The row reads behind getWorkboard: which boards a scope names, and their
// tasks in pages (PostgREST caps a read at 1000 rows and the company-wide task
// set outgrows that). Split out of workboard.ts for the file-size gate (WB-01).

import { companyOs } from "@/kernel/data/supabase";
import { BOARD_SELECT, TASK_SELECT, type BoardRow, type TaskRow } from "./types";
import type { WorkboardScope } from "./workboard";

const PAGE = 1000;

export async function hasClientBoard(companyIds: string[]): Promise<boolean> {
  if (companyIds.length === 0) return false;
  const { data, error } = await companyOs
    .from("boards")
    .select("id")
    .in("client_company_id", companyIds)
    .eq("status", "active")
    .is("archived_at", null)
    .limit(1);
  if (error) console.error("[company-os/boards] boards", error);
  return (data ?? []).length > 0;
}

export async function readBoards(scope: WorkboardScope): Promise<BoardRow[]> {
  if (scope.kind !== "all" && scope.ids.length === 0) return [];
  let qb = companyOs.from("boards").select(BOARD_SELECT).is("archived_at", null);
  if (scope.kind === "boards") qb = qb.in("id", scope.ids);
  else {
    qb = qb.eq("status", "active");
    if (scope.kind === "companies") {
      qb = qb.in("client_company_id", scope.ids);
      if (scope.untaggedOnly) qb = qb.is("ai_program_id", null);
    }
  }
  const { data, error } = await qb.order("sort_order");
  if (error) {
    console.error("[company-os/boards] boards", error);
    return [];
  }
  return (data ?? []) as BoardRow[];
}

export async function readTasks(boardIds: string[]): Promise<TaskRow[]> {
  const out: TaskRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await companyOs
      .from("tasks")
      .select(TASK_SELECT)
      .in("board_id", boardIds)
      .is("archived_at", null)
      .order("position")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[company-os/boards] tasks", error);
      return out;
    }
    const rows = (data ?? []) as TaskRow[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
