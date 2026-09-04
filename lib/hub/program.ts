// Shared, company-scoped loaders for the AI Program view (Client Hub by AI
// Program, PR 1). An AI Program = one company_os.ai_programs row, optionally
// 1:1 with an htt.repos row (tracker telemetry), plus roadmap items, boards,
// and documents tagged via their nullable ai_program_id columns.
//
// Same discipline as lib/admin/company-hub.ts: these take a companyId directly
// and never widen scope; authorization is the caller's gate (requireAdmin via
// the admin layout today, team/portal actors later). Reads go through the
// service-role companyOs/htt clients.
//
// Every loader degrades: a program with no htt repo returns zeros/nulls for
// delivery stats, and a company with no programs returns an empty list.

import { companyOs, htt } from "@/lib/supabase";
import {
  BACKLOG_SELECT,
  ROADMAP_GROUPS_SELECT,
  type BacklogItem,
  type RoadmapGroup,
} from "@/lib/client-backlog";
import { listDocumentsForCompanies, type ClientDocument } from "@/lib/client-documents";
import { getMeetingsForCompany, type AdminMeetingRow } from "@/lib/admin/meetings";
import { fetchDeliveryRaw, leverageOf, type DeliveryRaw } from "@/lib/hub/tokens";

export type ProgramStatus = "draft" | "active" | "complete" | "archived";

export type ProgramSummary = {
  id: string;
  name: string;
  status: ProgramStatus;
  githubRepo: string | null;
  repoUrl: string | null;
  // From the program's htt repo; all null when no repo is connected.
  repoId: string | null;
  liveUrl: string | null;
  lastSyncedAt: string | null;
  // Delivery stats (zeros when no repo is connected).
  deliveredHours: number;
  aiTokens: number; // token_entries, kind claude/app
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
  prsMergedLast7d: number;
  // Company OS rollups (by ai_program_id).
  roadmapDone: number; // backlog items with status 'shipped'
  roadmapTotal: number;
  boardCount: number; // active boards keyed to this program
};

export type ProgramBoard = {
  id: string;
  name: string;
  slug: string;
  cardCount: number; // live top-level cards
};

export type ProgramPullRequest = {
  id: string;
  number: number | null;
  title: string;
  state: "open" | "merged" | "closed";
  author: string | null;
  url: string | null;
  mergedAt: string | null;
  openedAt: string;
};

export type ProgramWeek = {
  isoWeek: string; // e.g. "2026-W34"
  hours: number;
};

export type ProgramDetail = ProgramSummary & {
  plannedTokens: number; // SUM(token_high) of the program's backlog items
  prsMergedLast30d: number;
  roadmapGroups: RoadmapGroup[];
  roadmapItems: BacklogItem[];
  boards: ProgramBoard[];
  pullRequests: ProgramPullRequest[]; // one page (PR_PAGE_SIZE), server-filtered
  prPage: number; // the (clamped) page pullRequests holds
  prTotal: number; // full count matching the current search filter
  prTotalAll: number; // full count regardless of filter (tab badge)
  weeklyHours: ProgramWeek[]; // last 8 ISO weeks, oldest first
  documents: ClientDocument[];
  meetings: AdminMeetingRow[]; // meetings tagged to this program (meetings.ai_program_id)
};

export type ProgramPrOptions = {
  page?: number; // 1-based; clamped to the filtered result's page range
  search?: string; // matches title/author (ilike) and exact PR number
};

export const PR_PAGE_SIZE = 15;

// User input goes into a PostgREST .or() filter string; strip the characters
// that are structural in that syntax (commas, parens, quotes) and LIKE
// wildcards, rather than interpolating raw input.
function ilikeTerm(input: string): string {
  return input
    .replace(/[,()"'`\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// PostgREST caps a response at 1000 rows; page through so a repo with more
// tracked entries than that still sums correctly (same pattern as
// lib/portal/tokens.ts). Every factory MUST carry a total order ending on a
// unique column (id) so pages never repeat or skip rows. Exported so the
// other hub-grain consumers of the same capped tables (the admin hub home,
// lib/team/clients.ts) page identically instead of re-deriving the pattern.
const PAGE = 1000;
export async function fetchAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown }> },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build().range(from, from + PAGE - 1);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

type ProgramRow = {
  id: string;
  name: string;
  status: ProgramStatus;
  github_repo: string | null;
  repo_url: string | null;
};

// The select behind ProgramRow, exported so a surface that already needs the
// full ai_programs rows (the hub home) can fetch them once and hand them in.
export const PROGRAM_SELECT = "id, name, status, github_repo, repo_url";

// Everything listProgramSummaries aggregates over, so a caller that already
// fetched these datasets for its own rendering (the hub home fetches the full
// backlog, board and delivery rows anyway) can pass them in and no dataset is
// fetched twice per page load. Shapes are structural minimums; richer rows
// (e.g. full BacklogItem) satisfy them.
export type ProgramSummaryInputs = {
  programs: ProgramRow[];
  delivery: DeliveryRaw;
  backlogRows: Array<{ ai_program_id: string | null; status: string }>; // active items
  boardRows: Array<{ ai_program_id: string | null }>; // active boards
};

export async function fetchProgramSummaryInputs(companyId: string): Promise<ProgramSummaryInputs> {
  const [{ data: programData }, delivery, backlogRows, boardRows] = await Promise.all([
    companyOs
      .from("ai_programs")
      .select(PROGRAM_SELECT)
      .eq("company_id", companyId)
      .neq("status", "archived") // archived programs are hidden from every hub band
      .order("created_at", { ascending: false }),
    fetchDeliveryRaw([companyId]),
    fetchAll<{ ai_program_id: string | null; status: string }>(() =>
      companyOs
        .from("client_backlog_items")
        .select("ai_program_id, status")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("id"),
    ),
    fetchAll<{ ai_program_id: string | null }>(() =>
      companyOs
        .from("boards")
        .select("ai_program_id")
        .eq("client_company_id", companyId)
        .eq("status", "active")
        .is("archived_at", null)
        .order("id"),
    ),
  ]);
  return { programs: (programData ?? []) as ProgramRow[], delivery, backlogRows, boardRows };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function listProgramSummaries(
  companyId: string,
  pre?: ProgramSummaryInputs,
): Promise<ProgramSummary[]> {
  const inputs = pre ?? (await fetchProgramSummaryInputs(companyId));
  const { programs, backlogRows, boardRows } = inputs;
  const { repos, hourRows, aiRows } = inputs.delivery;
  if (programs.length === 0) return [];
  const repoByProgram = new Map(repos.filter((r) => r.ai_program_id).map((r) => [r.ai_program_id as string, r]));
  const repoIds = repos.map((r) => r.id);

  // The only repo-dependent query; everything else arrives via the inputs.
  // Cutoff hoisted so every fetchAll page uses the same value.
  const mergedSince = daysAgoIso(7);
  const mergedRows = repoIds.length
    ? await fetchAll<{ repo_id: string }>(() =>
        htt
          .from("pull_requests")
          .select("repo_id")
          .in("repo_id", repoIds)
          .eq("state", "merged")
          .gte("merged_at", mergedSince)
          .order("id"),
      )
    : [];

  const hoursByRepo = new Map<string, number>();
  for (const r of hourRows) {
    if (!r.repo_id) continue;
    hoursByRepo.set(r.repo_id, (hoursByRepo.get(r.repo_id) ?? 0) + Number(r.hours ?? 0));
  }
  const aiByRepo = new Map<string, number>();
  for (const r of aiRows) {
    if (!r.repo_id) continue;
    aiByRepo.set(r.repo_id, (aiByRepo.get(r.repo_id) ?? 0) + Number(r.amount ?? 0));
  }
  const mergedByRepo = new Map<string, number>();
  for (const r of mergedRows) {
    mergedByRepo.set(r.repo_id, (mergedByRepo.get(r.repo_id) ?? 0) + 1);
  }

  const doneByProgram = new Map<string, number>();
  const totalByProgram = new Map<string, number>();
  for (const r of backlogRows) {
    if (!r.ai_program_id) continue;
    totalByProgram.set(r.ai_program_id, (totalByProgram.get(r.ai_program_id) ?? 0) + 1);
    if (r.status === "shipped") {
      doneByProgram.set(r.ai_program_id, (doneByProgram.get(r.ai_program_id) ?? 0) + 1);
    }
  }

  const boardsByProgram = new Map<string, number>();
  for (const r of boardRows) {
    if (!r.ai_program_id) continue;
    boardsByProgram.set(r.ai_program_id, (boardsByProgram.get(r.ai_program_id) ?? 0) + 1);
  }

  return programs.map((p) => {
    const repo = repoByProgram.get(p.id) ?? null;
    const hours = repo ? hoursByRepo.get(repo.id) ?? 0 : 0;
    const ai = repo ? aiByRepo.get(repo.id) ?? 0 : 0;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      githubRepo: p.github_repo,
      repoUrl: p.repo_url,
      repoId: repo?.id ?? null,
      liveUrl: repo?.live_url ?? null,
      lastSyncedAt: repo?.last_synced_at ?? null,
      deliveredHours: hours,
      aiTokens: ai,
      leverage: leverageOf(ai, hours),
      prsMergedLast7d: repo ? mergedByRepo.get(repo.id) ?? 0 : 0,
      roadmapDone: doneByProgram.get(p.id) ?? 0,
      roadmapTotal: totalByProgram.get(p.id) ?? 0,
      boardCount: boardsByProgram.get(p.id) ?? 0,
    };
  });
}

// ISO week label ("2026-W34") for a date, and the last N week labels.
// Exported so the portal projection (lib/portal/program-hub.ts) buckets its
// shipped-highlights weeks with exactly the same convention as the chart.
export function isoWeekLabel(d: Date): string {
  // Thursday of the same ISO week determines the week-year.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function lastIsoWeeks(n: number): string[] {
  const weeks: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    weeks.push(isoWeekLabel(new Date(Date.now() - i * 7 * 86_400_000)));
  }
  return weeks;
}

type PrPage = {
  rows: ProgramPullRequest[];
  page: number;
  total: number; // matching the search filter
  totalAll: number; // unfiltered
};

// One server-side page of a repo's pull requests, searched over the FULL set
// (never just the visible page). Page is clamped to the filtered total so a
// stale ?page= never turns into a range error.
async function fetchPrPage(repoId: string, opts: ProgramPrOptions): Promise<PrPage> {
  const term = ilikeTerm(opts.search ?? "");
  const filtered = () => {
    let qb = htt.from("pull_requests").select("id", { count: "exact", head: true }).eq("repo_id", repoId);
    if (term) {
      const pat = `%${term}%`;
      const ors = [`title.ilike.${pat}`, `author_login.ilike.${pat}`];
      if (/^\d+$/.test(term)) ors.push(`number.eq.${term}`);
      qb = qb.or(ors.join(","));
    }
    return qb;
  };

  const [{ count: totalAll }, { count: total }] = await Promise.all([
    htt.from("pull_requests").select("id", { count: "exact", head: true }).eq("repo_id", repoId),
    filtered(),
  ]);

  const totalPages = Math.max(1, Math.ceil((total ?? 0) / PR_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), totalPages);

  let rowQb = htt
    .from("pull_requests")
    .select("id, number, title, state, author_login, url, merged_at, opened_at")
    .eq("repo_id", repoId);
  if (term) {
    const pat = `%${term}%`;
    const ors = [`title.ilike.${pat}`, `author_login.ilike.${pat}`];
    if (/^\d+$/.test(term)) ors.push(`number.eq.${term}`);
    rowQb = rowQb.or(ors.join(","));
  }
  const { data } = await rowQb
    .order("opened_at", { ascending: false })
    .order("id")
    .range((page - 1) * PR_PAGE_SIZE, page * PR_PAGE_SIZE - 1);

  const rows = ((data ?? []) as Array<{
    id: string;
    number: number | null;
    title: string;
    state: "open" | "merged" | "closed";
    author_login: string | null;
    url: string | null;
    merged_at: string | null;
    opened_at: string;
  }>).map((p) => ({
    id: p.id,
    number: p.number,
    title: p.title,
    state: p.state,
    author: p.author_login,
    url: p.url,
    mergedAt: p.merged_at,
    openedAt: p.opened_at,
  }));

  return { rows, page, total: total ?? 0, totalAll: totalAll ?? 0 };
}

export async function getProgramDetail(
  companyId: string,
  programId: string,
  prOpts: ProgramPrOptions = {},
): Promise<ProgramDetail | null> {
  const summaries = await listProgramSummaries(companyId);
  const summary = summaries.find((s) => s.id === programId);
  if (!summary) return null;

  const WEEKS = 8;
  const weekLabels = lastIsoWeeks(WEEKS);
  const weekFloorIso = daysAgoIso(WEEKS * 7 + 7); // generous lower bound; bucketed below
  const merged30Since = daysAgoIso(30); // hoisted: same cutoff across fetchAll pages

  const [
    { data: groupData },
    { data: itemData },
    { data: boardData },
    prPage,
    weekRows,
    merged30Rows,
    allDocuments,
    meetings,
  ] = await Promise.all([
    companyOs
      .from("client_roadmap_groups")
      .select(ROADMAP_GROUPS_SELECT)
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    companyOs
      .from("client_backlog_items")
      .select(BACKLOG_SELECT)
      .eq("company_id", companyId)
      .eq("ai_program_id", programId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    companyOs
      .from("boards")
      .select("id, name, slug")
      .eq("client_company_id", companyId)
      .eq("ai_program_id", programId)
      .eq("status", "active")
      .is("archived_at", null)
      .order("sort_order", { ascending: true }),
    summary.repoId
      ? fetchPrPage(summary.repoId, prOpts)
      : Promise.resolve({ rows: [], page: 1, total: 0, totalAll: 0 } satisfies PrPage),
    summary.repoId
      ? fetchAll<{ occurred_on: string; hours: number }>(() =>
          htt
            .from("man_hour_entries")
            .select("occurred_on, hours")
            .eq("repo_id", summary.repoId as string)
            .neq("status", "excluded")
            .gte("occurred_on", weekFloorIso.slice(0, 10))
            .order("id"),
        )
      : Promise.resolve([] as { occurred_on: string; hours: number }[]),
    summary.repoId
      ? fetchAll<{ id: string }>(() =>
          htt
            .from("pull_requests")
            .select("id")
            .eq("repo_id", summary.repoId as string)
            .eq("state", "merged")
            .gte("merged_at", merged30Since)
            .order("id"),
        )
      : Promise.resolve([] as { id: string }[]),
    listDocumentsForCompanies([companyId]),
    getMeetingsForCompany(companyId, programId),
  ]);

  const roadmapItems = (itemData ?? []) as unknown as BacklogItem[];
  // The program's own sections, plus any company-wide section a program item
  // still sits under, so no item renders orphaned.
  const usedKeys = new Set(roadmapItems.map((i) => i.group_key));
  const roadmapGroups = ((groupData ?? []) as unknown as RoadmapGroup[]).filter(
    (g) => g.ai_program_id === programId || (g.ai_program_id === null && usedKeys.has(g.key)),
  );

  const boardRows = (boardData ?? []) as Array<{ id: string; name: string; slug: string }>;
  const cardsByBoard = new Map<string, number>();
  if (boardRows.length > 0) {
    const taskRows = await fetchAll<{ board_id: string }>(() =>
      companyOs
        .from("tasks")
        .select("board_id")
        .in("board_id", boardRows.map((b) => b.id))
        .is("archived_at", null)
        .is("parent_task_id", null)
        .order("id"),
    );
    for (const t of taskRows) {
      cardsByBoard.set(t.board_id, (cardsByBoard.get(t.board_id) ?? 0) + 1);
    }
  }

  const hoursByWeek = new Map<string, number>(weekLabels.map((w) => [w, 0]));
  for (const r of weekRows) {
    const label = isoWeekLabel(new Date(`${r.occurred_on}T00:00:00Z`));
    if (hoursByWeek.has(label)) {
      hoursByWeek.set(label, (hoursByWeek.get(label) ?? 0) + Number(r.hours ?? 0));
    }
  }

  const plannedTokens = roadmapItems.reduce((sum, i) => sum + Number(i.token_high ?? 0), 0);

  return {
    ...summary,
    plannedTokens,
    prsMergedLast30d: merged30Rows.length,
    roadmapGroups,
    roadmapItems,
    boards: boardRows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      cardCount: cardsByBoard.get(b.id) ?? 0,
    })),
    pullRequests: prPage.rows,
    prPage: prPage.page,
    prTotal: prPage.total,
    prTotalAll: prPage.totalAll,
    weeklyHours: weekLabels.map((w) => ({ isoWeek: w, hours: hoursByWeek.get(w) ?? 0 })),
    documents: allDocuments.filter((d) => d.programId === programId),
    meetings,
  };
}
