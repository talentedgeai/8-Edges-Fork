// Company-grain human-token accounting, shared by the client portal Tokens
// page (entities/portal/lib/tokens.ts wraps this with the actor's company scope) and
// the admin Client Hub home (which passes one companyId). This is the ONE
// place the settled formula lives:
//   Bought    = paid token_purchases + the CURRENT manual allocation per
//               company (htt.token_allocations row with the highest seq;
//               NULL tokens on that row means removed, counts 0)
//   Delivered = SUM(htt.man_hour_entries.hours) with status <> 'excluded'
//   Balance   = Bought - Delivered
//   Planned   = SUM(client_backlog_items.token_high), active items
//   Leverage  = value tokens per delivered hour, where value tokens are the AI
//               tokens (htt.token_entries, kind claude/app) divided by
//               CLAUDE_TOKENS_PER_VALUE_TOKEN. Rendered as a multiple (e.g.
//               "27.3×") via formatLeverage; null (shown "n/a") when no hours.
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

// Leverage = value tokens per delivered hour; null when no hours are delivered.
export const leverageOf = (aiTokens: number, deliveredHours: number): number | null =>
  deliveredHours > 0 ? aiTokens / CLAUDE_TOKENS_PER_VALUE_TOKEN / deliveredHours : null;

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
  repoId: string | null; // null = tracked work not attributed to a repo
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

export type HourRow = { repo_id: string | null; hours: number };
export type AiTokenRow = { repo_id: string | null; amount: number };

export type DeliveryRaw = {
  repos: DeliveryRepo[];
  hourRows: HourRow[]; // man_hour_entries, status <> 'excluded'
  aiRows: AiTokenRow[]; // token_entries, kind claude/app
};

export async function fetchDeliveryRaw(companyIds: string[]): Promise<DeliveryRaw> {
  if (companyIds.length === 0) return { repos: [], hourRows: [], aiRows: [] };
  const [repos, hourRows, aiRows] = await Promise.all([
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
        .select("repo_id, hours")
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
  ]);
  return { repos, hourRows, aiRows };
}

// ---------------------------------------------------------------------------
// Credit pool
// ---------------------------------------------------------------------------

export async function getTokenBalanceForCompanies(companyIds: string[]): Promise<TokenBalance> {
  if (companyIds.length === 0) return { balanceTokens: 0, pendingTokens: 0, purchases: [] };

  const { data } = await companyOs
    .from("token_purchases")
    .select("id, packs, tokens, amount_cents, status, created_at, paid_at")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });

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

  const hoursByRepo = new Map<string | null, number>();
  let deliveredHours = 0;
  for (const row of delivery.hourRows) {
    const h = Number(row.hours ?? 0);
    deliveredHours += h;
    hoursByRepo.set(row.repo_id, (hoursByRepo.get(row.repo_id) ?? 0) + h);
  }

  const aiByRepo = new Map<string | null, number>();
  let aiTokens = 0;
  for (const row of delivery.aiRows) {
    const a = Number(row.amount ?? 0);
    aiTokens += a;
    aiByRepo.set(row.repo_id, (aiByRepo.get(row.repo_id) ?? 0) + a);
  }

  // One row per AI Program (spine: 1 repo = 1 AI Program), plus one for tracked
  // work not attributed to a repo. Programs with no activity yet still list, so
  // the client sees what is being tracked.
  const programs: ProgramUsage[] = delivery.repos.map((repo) => {
    const hours = hoursByRepo.get(repo.id) ?? 0;
    const ai = aiByRepo.get(repo.id) ?? 0;
    return {
      repoId: repo.id,
      name: repo.name,
      deliveredHours: hours,
      aiTokens: ai,
      leverage: leverageOf(ai, hours),
    };
  });
  const unassignedHours = hoursByRepo.get(null) ?? 0;
  const unassignedAi = aiByRepo.get(null) ?? 0;
  if (unassignedHours > 0 || unassignedAi > 0) {
    programs.push({
      repoId: null,
      name: "Unassigned work",
      deliveredHours: unassignedHours,
      aiTokens: unassignedAi,
      leverage: leverageOf(unassignedAi, unassignedHours),
    });
  }

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
    leverage: leverageOf(aiTokens, deliveredHours),
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
