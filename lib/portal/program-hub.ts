// Portal-facing AI Program hub loaders (Client Hub by AI Program, portal PR).
// Same discipline as the other lib/portal helpers: every read is scoped to the
// actor's own companyScope and cross-company ids resolve to null (IDOR guard).
//
// CLIENT-SAFE HARD LINE: these loaders return program name + counts + PR
// TITLES only. Repo org/name, author logins, PR URLs/numbers, and sync details
// never leave this module; the shapes below simply do not carry them.
//
// The aggregation itself (delivered hours, weekly buckets, roadmap rollups)
// lives in lib/hub/program.ts, shared with the admin Client Hub; this module
// only applies the portal scope and strips to client-safe fields.

import { companyOs, htt } from "@/lib/supabase";
import type { PortalActor } from "@/lib/portal-auth";
import {
  listProgramSummaries,
  getProgramDetail,
  fetchAll,
  isoWeekLabel,
  lastIsoWeeks,
  type ProgramStatus,
} from "@/lib/hub/program";
import { getTokenUsageForCompanies } from "@/lib/hub/tokens";
import type { ClientBoardColumn, ClientBoardCard } from "@/lib/boards/client-view";

// IDOR guard shared by the loaders below: resolve a program only when it
// belongs to one of the actor's companies; returns the owning company id.
async function ownedProgramCompany(actor: PortalActor, programId: string): Promise<string | null> {
  if (actor.companyScope.length === 0) return null;
  const { data } = await companyOs
    .from("ai_programs")
    .select("id, company_id")
    .eq("id", programId)
    .in("company_id", actor.companyScope)
    .maybeSingle();
  return (data as { company_id: string } | null)?.company_id ?? null;
}

export type PortalProgramSummary = {
  id: string;
  companyId: string;
  name: string;
  status: ProgramStatus;
  // One line derived from the program plan's 5Ds brief; null when no plan
  // brief exists yet.
  description: string | null;
  // True when delivery tracking is connected. The repo itself is internal;
  // only this boolean crosses to the portal.
  hasRepo: boolean;
  deliveredHours: number;
  prsMergedLast7d: number;
  roadmapDone: number;
  roadmapTotal: number;
  boardCount: number;
};

// Strip a brief's HTML down to one readable line. Headings and short label
// lines ("Dream", "AI Program Brief") are skipped; the first substantial text
// run wins, capped at a word boundary.
const MAX_DESCRIPTION = 160;
export function briefToOneLine(html: string): string | null {
  const text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(h1|h2|h3|h4)[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<(p|div|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 30) continue; // heading or label, not a description
    if (line.length <= MAX_DESCRIPTION) return line;
    const cut = line.slice(0, MAX_DESCRIPTION);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 100))}…`;
  }
  return null;
}

export async function listPortalProgramSummaries(actor: PortalActor): Promise<PortalProgramSummary[]> {
  if (actor.companyScope.length === 0) return [];
  const perCompany = await Promise.all(
    actor.companyScope.map(async (companyId) => ({
      companyId,
      summaries: await listProgramSummaries(companyId),
    })),
  );
  const rows = perCompany.flatMap(({ companyId, summaries }) =>
    summaries.map((s) => ({ companyId, s })),
  );
  if (rows.length === 0) return [];

  // First chat-plan brief per program feeds the one-line description.
  const { data: planData } = await companyOs
    .from("program_plans")
    .select("ai_program_id, brief_html")
    .in("ai_program_id", rows.map((r) => r.s.id))
    .eq("method", "chat")
    .not("brief_html", "is", null)
    .order("created_at", { ascending: true });
  const briefByProgram = new Map<string, string>();
  for (const p of (planData ?? []) as Array<{ ai_program_id: string; brief_html: string }>) {
    if (!briefByProgram.has(p.ai_program_id)) briefByProgram.set(p.ai_program_id, p.brief_html);
  }

  return rows.map(({ companyId, s }) => ({
    id: s.id,
    companyId,
    name: s.name,
    status: s.status,
    description: briefByProgram.has(s.id) ? briefToOneLine(briefByProgram.get(s.id) as string) : null,
    hasRepo: !!s.repoId,
    deliveredHours: s.deliveredHours,
    prsMergedLast7d: s.prsMergedLast7d,
    roadmapDone: s.roadmapDone,
    roadmapTotal: s.roadmapTotal,
    boardCount: s.boardCount,
  }));
}

// ── Company-grain overview ─────────────────────────────────────────────────

// Total merged pull requests across every repo of the actor's companies. Counts
// only; no repo names, PR numbers, or author logins ever leave the module.
async function countMergedPrsForCompanies(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  const repos = await fetchAll<{ id: string }>(() =>
    htt.from("repos").select("id").in("company_id", companyIds).order("id"),
  );
  const repoIds = repos.map((r) => r.id);
  if (repoIds.length === 0) return 0;
  const { count } = await htt
    .from("pull_requests")
    .select("id", { count: "exact", head: true })
    .in("repo_id", repoIds)
    .eq("state", "merged");
  return count ?? 0;
}

// The client-safe company overview for the AI Programs hub: the shared Human
// Token pool figures, the AI-token total, total merged PRs, and the normalized
// leverage multiple. Scalars only, scoped to the actor's companies.
export type PortalHubOverview = {
  boughtTokens: number;
  purchasedTokens: number;
  allocatedTokens: number;
  balanceTokens: number;
  aiTokens: number;
  deliveredHours: number;
  leverage: number | null;
  prsMergedTotal: number;
};

export async function getPortalHubOverview(actor: PortalActor): Promise<PortalHubOverview> {
  if (actor.companyScope.length === 0) {
    return {
      boughtTokens: 0,
      purchasedTokens: 0,
      allocatedTokens: 0,
      balanceTokens: 0,
      aiTokens: 0,
      deliveredHours: 0,
      leverage: null,
      prsMergedTotal: 0,
    };
  }
  const [usage, prsMergedTotal] = await Promise.all([
    getTokenUsageForCompanies(actor.companyScope),
    countMergedPrsForCompanies(actor.companyScope),
  ]);
  return {
    boughtTokens: usage.boughtTokens,
    purchasedTokens: usage.purchasedTokens,
    allocatedTokens: usage.allocatedTokens,
    balanceTokens: usage.balanceTokens,
    aiTokens: usage.aiTokens,
    deliveredHours: usage.deliveredHours,
    leverage: usage.leverage,
    prsMergedTotal,
  };
}

// ── Boards ───────────────────────────────────────────────────────────────

export type PortalHubBoard = {
  id: string;
  name: string;
  slug: string;
  aiProgramId: string | null;
};

// Every active board for the actor's companies, with its program tag, so the
// hub can pick the first UNTAGGED one and the program page its own boards.
export async function listHubBoardsForActor(actor: PortalActor): Promise<PortalHubBoard[]> {
  if (actor.companyScope.length === 0) return [];
  const { data } = await companyOs
    .from("boards")
    .select("id, name, slug, ai_program_id")
    .in("client_company_id", actor.companyScope)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as Array<{ id: string; name: string; slug: string; ai_program_id: string | null }>).map(
    (b) => ({ id: b.id, name: b.name, slug: b.slug, aiProgramId: b.ai_program_id }),
  );
}

export type PortalBoardView = {
  boardName: string;
  columns: ClientBoardColumn[];
  cards: ClientBoardCard[];
};

// One specific board's client-visible slice, by id. Mirrors the queries and
// PRIVACY HARD LINE of lib/boards/client-view.ts getClientBoardView (only
// non-internal, non-archived, top-level cards; explicit safe columns), which
// only supports "first board of the company" and so cannot serve a chosen
// board. Keep the two in lockstep; folding this into client-view.ts is a
// follow-up once the parallel team-mirror branch lands.
export async function getBoardViewForActor(actor: PortalActor, boardId: string): Promise<PortalBoardView | null> {
  if (actor.companyScope.length === 0) return null;
  const { data: boardRow } = await companyOs
    .from("boards")
    .select("id, name")
    .eq("id", boardId)
    .in("client_company_id", actor.companyScope)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!boardRow) return null;
  const board = boardRow as { id: string; name: string };

  const [colsRes, tasksRes] = await Promise.all([
    companyOs.from("board_columns").select("id, name, is_done").eq("board_id", board.id).order("position"),
    companyOs
      .from("tasks")
      .select("id, title, priority, due_date, status, board_column_id, assignee_id, sprint_id, created_at")
      .eq("board_id", board.id)
      .eq("internal", false)
      .is("parent_task_id", null)
      .is("archived_at", null)
      .order("position"),
  ]);

  const columns: ClientBoardColumn[] = ((colsRes.data ?? []) as { id: string; name: string; is_done: boolean }[]).map(
    (c) => ({ id: c.id, name: c.name, isDone: c.is_done }),
  );
  const tasks = (tasksRes.data ?? []) as {
    id: string;
    title: string;
    priority: ClientBoardCard["priority"];
    due_date: string | null;
    status: string;
    board_column_id: string | null;
    assignee_id: string | null;
    sprint_id: string | null;
    created_at: string;
  }[];

  const personIds = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean) as string[])];
  const sprintIds = [...new Set(tasks.map((t) => t.sprint_id).filter(Boolean) as string[])];
  const [peopleRes, sprintsRes] = await Promise.all([
    personIds.length
      ? companyOs.from("people").select("id, display_name, full_name, email").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; full_name: string | null; email: string }[] }),
    sprintIds.length
      ? companyOs.from("sprints").select("id, name").in("id", sprintIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const nameById = new Map(
    (peopleRes.data ?? []).map((p) => [p.id, p.display_name || p.full_name || p.email]),
  );
  const sprintById = new Map((sprintsRes.data ?? []).map((s) => [s.id, s.name]));

  const cards: ClientBoardCard[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueDate: t.due_date,
    columnId: t.board_column_id,
    done: t.status === "done",
    assigneeId: t.assignee_id,
    assigneeName: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    sprintName: t.sprint_id ? sprintById.get(t.sprint_id) ?? null : null,
    createdAt: t.created_at,
  }));

  return { boardName: board.name, columns, cards };
}

// ── Delivery projection ──────────────────────────────────────────────────

// The client-safe slice of a program's delivery stats. This projection is the
// STRUCTURAL boundary: lib/hub/program.ts's admin-grade ProgramDetail (repo
// org/name, PR rows with author logins and URLs, admin meeting rows) is
// consumed here and only these fields ever leave the module, so unsafe fields
// never enter a portal page module at all.
export type PortalProgramDelivery = {
  companyId: string;
  hasRepo: boolean;
  deliveredHours: number;
  aiTokens: number; // token_entries, kind claude/app
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
  prsMerged7d: number;
  prsMerged30d: number;
  prsMergedTotal: number; // merged to date, this program's repo
  weeklyHours: Array<{ isoWeek: string; hours: number }>; // last 8 ISO weeks, oldest first
};

export async function getPortalProgramDelivery(
  actor: PortalActor,
  programId: string,
): Promise<PortalProgramDelivery | null> {
  const companyId = await ownedProgramCompany(actor, programId);
  if (!companyId) return null;
  const detail = await getProgramDetail(companyId, programId);
  if (!detail) return null;

  // Total merged PRs for this program's repo (count only; no numbers/URLs/logins).
  let prsMergedTotal = 0;
  if (detail.repoId) {
    const { count } = await htt
      .from("pull_requests")
      .select("id", { count: "exact", head: true })
      .eq("repo_id", detail.repoId)
      .eq("state", "merged");
    prsMergedTotal = count ?? 0;
  }

  return {
    companyId,
    hasRepo: !!detail.repoId,
    deliveredHours: detail.deliveredHours,
    aiTokens: detail.aiTokens,
    leverage: detail.leverage,
    prsMerged7d: detail.prsMergedLast7d,
    prsMerged30d: detail.prsMergedLast30d,
    prsMergedTotal,
    weeklyHours: detail.weeklyHours.map((w) => ({ isoWeek: w.isoWeek, hours: w.hours })),
  };
}

// ── Shipped highlights ───────────────────────────────────────────────────

export type ProgramHighlightWeek = {
  isoWeek: string; // "2026-W34"
  titles: string[];
};

const HIGHLIGHT_WEEKS = 8;

// PostgREST caps a response at 1000 rows; page through so an active repo's
// full 8-week window still lists completely (same pattern as
// lib/hub/program.ts). The total order ends on the unique id so pages never
// repeat or skip rows; the window filter bounds the loop.
const PAGE = 1000;

// Merged PR TITLES for a program's repo, grouped by ISO week, newest week
// first, over exactly the same lastIsoWeeks(8) set as the delivered-hours
// chart. Titles only: no numbers, URLs, or author logins. Scope is resolved
// here (actor + programId), never trusted from the caller.
export async function getProgramHighlights(
  actor: PortalActor,
  programId: string,
): Promise<ProgramHighlightWeek[]> {
  const companyId = await ownedProgramCompany(actor, programId);
  if (!companyId) return [];
  const { data: repoRow } = await htt
    .from("repos")
    .select("id")
    .eq("ai_program_id", programId)
    .maybeSingle();
  const repoId = (repoRow as { id: string } | null)?.id;
  if (!repoId) return [];

  // Generous lower bound (a calendar window can span 9 ISO weeks); the week
  // set below is the exact filter.
  const since = new Date(Date.now() - (HIGHLIGHT_WEEKS + 1) * 7 * 86_400_000).toISOString();
  const rows: Array<{ title: string; merged_at: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await htt
      .from("pull_requests")
      .select("title, merged_at")
      .eq("repo_id", repoId)
      .eq("state", "merged")
      .gte("merged_at", since)
      .order("merged_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);
    const page = (data ?? []) as Array<{ title: string; merged_at: string }>;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const weekSet = new Set(lastIsoWeeks(HIGHLIGHT_WEEKS));
  const weeks: ProgramHighlightWeek[] = [];
  const byWeek = new Map<string, string[]>();
  for (const r of rows) {
    const label = isoWeekLabel(new Date(r.merged_at));
    if (!weekSet.has(label)) continue;
    let bucket = byWeek.get(label);
    if (!bucket) {
      bucket = [];
      byWeek.set(label, bucket);
      weeks.push({ isoWeek: label, titles: bucket });
    }
    bucket.push(r.title);
  }
  return weeks;
}
