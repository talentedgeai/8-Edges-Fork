// Company-grain human-token accounting, shared by the client portal Tokens
// page (entities/portal/lib/tokens.ts wraps this with the actor's company scope) and
// the admin Client Hub home (which passes one companyId). This is the ONE
// place the settled formula lives:
//   Bought    = paid token_purchases + the CURRENT manual allocation per
//               company (htt.token_allocations row with the highest seq;
//               NULL tokens on that row means removed, counts 0)
//   Delivered = SUM(htt.man_hour_entries.hours) with status <> 'excluded', on
//               repos linked to one of the company's LIVE AI Programs. Hours on
//               a repo that no program claims, or whose program is archived,
//               are NOT the client's (decision Khoa, 2026-09-07): they never
//               reach Delivered, Balance or the program list. A repo becomes
//               billable by being linked to a program the hub shows — 10.24 h
//               on an archived program's repo was inflating APA's total.
//   Balance   = Bought - Delivered
//   Planned   = SUM(client_backlog_items.token_high), active items
//   Leverage  = value tokens per HUMAN hour, where value tokens are the AI
//               tokens (htt.token_entries, kind claude/app) divided by
//               CLAUDE_TOKENS_PER_VALUE_TOKEN. Rendered as a multiple (e.g.
//               "27.3×") via formatLeverage; null (shown "n/a") when no hours.
//               The denominator is man_hour_entries.measured_hours — the hours a
//               person was actually at the keyboard — NOT the billed total, which
//               since the unattended-AI credit also contains machine time. Dividing
//               AI value by a denominator the AI itself inflates made leverage fall
//               as the AI did more of the work.
// Never re-derive the seq/latest-allocation logic anywhere else.
//
// SCOPING (critical): these helpers sit OUTSIDE the portalRead allowlist, so
// nothing structural narrows their reads. Every query in this file MUST filter
// by the caller-supplied company ids; a query without that filter would leak
// other clients' data to whichever surface calls it. Authorization is the
// caller's gate (requireAdmin on admin, the portal actor's companyScope on
// /portal), same discipline as lib/hub/program.ts.

import { companyOs, htt } from "@/kernel/data/supabase";

// Claude tokens are counted in the millions; a "value token" normalizes them to
// a human-legible unit so leverage reads as a small multiple (AI value delivered
// per human hour) rather than a six-figure tokens-per-hour figure. One value
// token = 100,000 Claude/app tokens.
export const CLAUDE_TOKENS_PER_VALUE_TOKEN = 100_000;

// Leverage = value tokens per HUMAN hour; null when no human hours are recorded.
export const leverageOf = (aiTokens: number, humanHours: number): number | null =>
  humanHours > 0 ? aiTokens / CLAUDE_TOKENS_PER_VALUE_TOKEN / humanHours : null;

// The human part of a ledger row: the hours the person was hands-on, before any
// unattended-AI credit. A legacy or hand-entered row carries no measured figure,
// so it falls back to its billed hours — the best evidence that row has.
export const humanHoursOf = (row: { hours: number | null; measured_hours?: number | null }): number =>
  Number(row.measured_hours ?? row.hours ?? 0);

// The one display form for leverage: a one-decimal multiple with the × sign, or
// "n/a" when there is nothing to divide by. Never an em dash.
export function formatLeverage(leverage: number | null): string {
  return leverage == null ? "n/a" : `${leverage.toFixed(1)}×`;
}

export type TokenPurchase = {
  id: string;
  packs: number;
  tokens: number;
  amountCents: number;
  status: "pending" | "paid" | "expired";
  createdAt: string;
  paidAt: string | null;
};

export type TokenBalance = {
  balanceTokens: number; // sum of paid tokens
  pendingTokens: number; // checkout started, webhook not landed
  purchases: TokenPurchase[];
};

export type ProgramUsage = {
  repoId: string;
  name: string;
  deliveredHours: number;
  aiTokens: number;
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
};

export type TokenUsage = {
  purchasedTokens: number; // paid Stripe purchases
  allocatedTokens: number; // current manual allocation (latest seq per company)
  boughtTokens: number; // purchased + allocated
  pendingTokens: number;
  plannedTokens: number; // SUM(client_backlog_items.token_high), active items
  deliveredHours: number; // SUM(htt.man_hour_entries.hours), status <> excluded
  humanHours: number; // SUM(measured_hours) — hands-on only, the leverage denominator
  balanceTokens: number; // bought - delivered
  aiTokens: number; // SUM(htt.token_entries.amount) for kind claude/app
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
  programs: ProgramUsage[];
  purchases: TokenPurchase[];
};

export const EMPTY_USAGE: TokenUsage = {
  purchasedTokens: 0,
  allocatedTokens: 0,
  boughtTokens: 0,
  pendingTokens: 0,
  plannedTokens: 0,
  deliveredHours: 0,
  humanHours: 0,
  balanceTokens: 0,
  aiTokens: 0,
  leverage: null,
  programs: [],
  purchases: [],
};

// PostgREST caps a response at 1000 rows; page through so a company with more
// tracked entries than that still sums correctly. Every caller passes a query
// factory so each page gets a fresh builder with the same scope filters, and
// every factory MUST carry a total order (ending on a unique column, id) so
// pages never repeat or skip rows.
const PAGE = 1000;
async function fetchAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: pageErr } = await build().range(from, from + PAGE - 1);
    if (pageErr) console.error("[portal/hub-tokens] paged read", pageErr);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Raw delivery rows (fetched once, derived twice)
// ---------------------------------------------------------------------------

// The repo select is the superset both consumers need: token usage reads
// id/name, the program layer additionally reads ai_program_id, live_url and
// last_synced_at. One fetch serves both.
export type DeliveryRepo = {
  id: string;
  name: string;
  ai_program_id: string | null;
  live_url: string | null;
  last_synced_at: string | null;
};

export type HourRow = { repo_id: string | null; hours: number; measured_hours: number | null };
export type AiTokenRow = { repo_id: string | null; amount: number };

export type DeliveryRaw = {
  repos: DeliveryRepo[];
  hourRows: HourRow[]; // man_hour_entries, status <> 'excluded'
  aiRows: AiTokenRow[]; // token_entries, kind claude/app
};

/** Ids of the companies' AI Programs that are not archived — the ones a hub
 *  shows, and therefore the only ones a repo can bill through. */
async function liveProgramIds(companyIds: string[]): Promise<Set<string>> {
  const rows = await fetchAll<{ id: string }>(() =>
    companyOs.from("ai_programs").select("id").in("company_id", companyIds).neq("status", "archived").order("id"),
  );
  return new Set(rows.map((r) => r.id));
}

/** A repo whose program is archived is treated as unlinked: the strip, the
 *  program list and the runway all key off `ai_program_id`, so nulling it here
 *  is the one place the rule has to be applied. */
export function withLiveProgramsOnly<T extends { ai_program_id: string | null }>(repos: T[], live: Set<string>): T[] {
  return repos.map((r) => (r.ai_program_id && live.has(r.ai_program_id) ? r : { ...r, ai_program_id: null }));
}

export async function fetchDeliveryRaw(companyIds: string[]): Promise<DeliveryRaw> {
  if (companyIds.length === 0) return { repos: [], hourRows: [], aiRows: [] };
  const [rawRepos, hourRows, aiRows, live] = await Promise.all([
    fetchAll<DeliveryRepo>(() =>
      htt
        .from("repos")
        .select("id, name, ai_program_id, live_url, last_synced_at")
        .in("company_id", companyIds)
        .order("name")
        .order("id"),
    ),
    fetchAll<HourRow>(() =>
      htt
        .from("man_hour_entries")
        .select("repo_id, hours, measured_hours")
        .in("company_id", companyIds)
        .neq("status", "excluded")
        .order("id"),
    ),
    fetchAll<AiTokenRow>(() =>
      htt
        .from("token_entries")
        .select("repo_id, amount")
        .in("company_id", companyIds)
        .in("kind", ["claude", "app"])
        .order("id"),
    ),
    liveProgramIds(companyIds),
  ]);
  return { repos: withLiveProgramsOnly(rawRepos, live), hourRows, aiRows };
}

// Delivered hours on or after a day (YYYY-MM-DD) across companies; the portal
// home turns the last 28 days into a runway estimate.
export async function getDeliveredHoursSince(companyIds: string[], sinceDay: string): Promise<number> {
  if (companyIds.length === 0) return 0;
  // Same scope as computeTokenUsage: only repos linked to a LIVE AI Program bill.
  const [rawRepos, rows, live] = await Promise.all([
    fetchAll<{ id: string; ai_program_id: string | null }>(() =>
      htt.from("repos").select("id, ai_program_id").in("company_id", companyIds).not("ai_program_id", "is", null).order("id"),
    ),
    fetchAll<{ repo_id: string | null; hours: number }>(() =>
      htt
        .from("man_hour_entries")
        .select("repo_id, hours")
        .in("company_id", companyIds)
        .neq("status", "excluded")
        .gte("occurred_on", sinceDay)
        .order("id"),
    ),
    liveProgramIds(companyIds),
  ]);
  const linked = new Set(withLiveProgramsOnly(rawRepos, live).filter((r) => r.ai_program_id).map((r) => r.id));
  return rows.filter((r) => r.repo_id && linked.has(r.repo_id)).reduce((sum, h) => sum + Number(h.hours ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Credit pool
// ---------------------------------------------------------------------------

export async function getTokenBalanceForCompanies(companyIds: string[]): Promise<TokenBalance> {
  if (companyIds.length === 0) return { balanceTokens: 0, pendingTokens: 0, purchases: [] };

  const { data, error: tokenPurchasesError } = await companyOs
    .from("token_purchases")
    .select("id, packs, tokens, amount_cents, status, created_at, paid_at")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (tokenPurchasesError) console.error("[portal] token_purchases read failed:", tokenPurchasesError.message);

  let balanceTokens = 0;
  let pendingTokens = 0;
  const purchases = ((data ?? []) as Array<{ id: string; packs: number; tokens: number; amount_cents: number; status: TokenPurchase["status"]; created_at: string; paid_at: string | null }>).map(
    (r) => {
      if (r.status === "paid") balanceTokens += r.tokens;
      if (r.status === "pending") pendingTokens += r.tokens;
      return {
        id: r.id,
        packs: r.packs,
        tokens: r.tokens,
        amountCents: r.amount_cents,
        status: r.status,
        createdAt: r.created_at,
        paidAt: r.paid_at,
      };
    },
  );

  return { balanceTokens, pendingTokens, purchases };
}

// Manual credit allocations: append-only, the row with the highest seq per
// company is current; NULL tokens on that row means removed (counts 0).
export async function getAllocatedTokensForCompanies(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  const rows = await fetchAll<{ company_id: string; tokens: number | null; seq: number }>(() =>
    htt
      .from("token_allocations")
      .select("company_id, tokens, seq")
      .in("company_id", companyIds)
      .order("seq", { ascending: false })
      .order("id"),
  );
  // Latest allocation per company (rows arrive seq desc).
  const seen = new Set<string>();
  let allocated = 0;
  for (const row of rows) {
    if (seen.has(row.company_id)) continue;
    seen.add(row.company_id);
    allocated += Number(row.tokens ?? 0);
  }
  return allocated;
}

// ---------------------------------------------------------------------------
// Pure rollup
// ---------------------------------------------------------------------------

// Derives the TokenUsage rollup from already-fetched pieces, so a surface that
// fetched the delivery rows for another view (the hub's program cards) never
// fetches them a second time.
export function computeTokenUsage(args: {
  balance: TokenBalance;
  allocatedTokens: number;
  plannedTokens: number;
  delivery: DeliveryRaw;
}): TokenUsage {
  const { balance, allocatedTokens, plannedTokens, delivery } = args;

  // Only repos linked to an AI Program bill to this client. An hour on any
  // other repo is invisible here, not merely labelled — it is not theirs.
  const linked = new Set(delivery.repos.filter((r) => r.ai_program_id).map((r) => r.id));
  const hoursByRepo = new Map<string | null, number>();
  const humanByRepo = new Map<string | null, number>();
  let deliveredHours = 0;
  let humanHours = 0;
  for (const row of delivery.hourRows) {
    if (!row.repo_id || !linked.has(row.repo_id)) continue;
    const h = Number(row.hours ?? 0);
    const human = humanHoursOf(row);
    deliveredHours += h;
    humanHours += human;
    hoursByRepo.set(row.repo_id, (hoursByRepo.get(row.repo_id) ?? 0) + h);
    humanByRepo.set(row.repo_id, (humanByRepo.get(row.repo_id) ?? 0) + human);
  }

  const aiByRepo = new Map<string | null, number>();
  let aiTokens = 0;
  for (const row of delivery.aiRows) {
    const a = Number(row.amount ?? 0);
    aiTokens += a;
    aiByRepo.set(row.repo_id, (aiByRepo.get(row.repo_id) ?? 0) + a);
  }

  // One row per AI Program (spine: 1 repo = 1 AI Program). Programs with no
  // activity yet still list, so the client sees what is being tracked; a repo
  // with no program is not listed at all.
  const programs: ProgramUsage[] = delivery.repos.filter((repo) => repo.ai_program_id).map((repo) => {
    const hours = hoursByRepo.get(repo.id) ?? 0;
    const ai = aiByRepo.get(repo.id) ?? 0;
    return {
      repoId: repo.id,
      name: repo.name,
      deliveredHours: hours,
      aiTokens: ai,
      leverage: leverageOf(ai, humanByRepo.get(repo.id) ?? 0),
    };
  });
  const purchasedTokens = balance.balanceTokens;
  const boughtTokens = purchasedTokens + allocatedTokens;

  return {
    purchasedTokens,
    allocatedTokens,
    boughtTokens,
    pendingTokens: balance.pendingTokens,
    plannedTokens,
    deliveredHours,
    balanceTokens: boughtTokens - deliveredHours,
    aiTokens,
    humanHours,
    leverage: leverageOf(aiTokens, humanHours),
    programs,
    purchases: balance.purchases,
  };
}

export async function getTokenUsageForCompanies(companyIds: string[]): Promise<TokenUsage> {
  if (companyIds.length === 0) return EMPTY_USAGE;
  const scope = companyIds;

  const [balance, allocatedTokens, { data: plannedData }, delivery] = await Promise.all([
    getTokenBalanceForCompanies(scope),
    getAllocatedTokensForCompanies(scope),
    companyOs
      .from("client_backlog_items")
      .select("token_high")
      .in("company_id", scope)
      .is("archived_at", null),
    fetchDeliveryRaw(scope),
  ]);

  const plannedTokens = ((plannedData ?? []) as Array<{ token_high: number | null }>).reduce(
    (sum, r) => sum + Number(r.token_high ?? 0),
    0,
  );

  return computeTokenUsage({ balance, allocatedTokens, plannedTokens, delivery });
}
