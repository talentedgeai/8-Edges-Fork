import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterisation tests for the four deal actions that carried duplicated
// blocks: the USD conversion (moveDealStage / updateDeal) and the "put the lead
// back at connected" step (demoteDealToLead / decideHandoff). They pin the
// exact update payloads, the upsert rows, the transition records and the error
// strings, so extracting the shared helpers cannot change behaviour.
//
// The fake Supabase client is the house one (see
// entities/portal/lib/work-request-lifecycle.test.ts).

type Response = { data?: unknown; error?: { message: string } | null; count?: number };
const scripts = new Map<string, Response[]>();
const calls: { table: string; ops: string[]; payloads: unknown[] }[] = [];

function script(table: string, ...responses: Response[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const record = { table, ops: [] as string[], payloads: [] as unknown[] };
  calls.push(record);
  const respond = () => {
    const next = (scripts.get(table) ?? []).shift();
    return { data: next?.data ?? null, error: next?.error ?? null, count: next?.count ?? 0 };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table), rpc: vi.fn(async () => ({ error: null })) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/identity/admin-auth", () => ({
  requireAdmin: async () => ({ email: "admin@example.com" }),
}));
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: vi.fn(async () => {}),
  recordAuditMany: vi.fn(async () => {}),
}));
vi.mock("@/kernel/identity/writes", () => ({ insertPeople: vi.fn() }));
vi.mock("@/kernel/messaging/writes", () => ({ insertInteractions: vi.fn() }));
vi.mock("@/entities/crm/lib/mutations", () => ({
  archiveRecord: vi.fn(),
  guardedDelete: vi.fn(),
  restoreRecord: vi.fn(),
}));

const getLead = vi.fn(async () => ({ ok: true, lead: { status: "engaged" } }) as { ok: true; lead: { status: string } | null } | { ok: false; error: string });
const recordTransition = vi.fn(async () => {});
const bumpCompanyLifecycle = vi.fn(async () => {});
const bumpPersonCompanies = vi.fn(async () => {});
vi.mock("@/entities/crm/lib/lifecycle", () => ({
  getLead: (...a: unknown[]) => getLead(...(a as [])),
  recordTransition: (...a: unknown[]) => recordTransition(...(a as [])),
  bumpCompanyLifecycle: (...a: unknown[]) => bumpCompanyLifecycle(...(a as [])),
  bumpPersonCompanies: (...a: unknown[]) => bumpPersonCompanies(...(a as [])),
}));

const convertToUsdCents = vi.fn(async () => ({ amountUsdCents: 12345, rate: 1.5 }));
vi.mock("@/kernel/data/fx", () => ({
  convertToUsdCents: (...a: unknown[]) => convertToUsdCents(...(a as [])),
}));

import { decideHandoff, demoteDealToLead, moveDealStage, updateDeal } from "./actions";
import { normalizeUrl } from "./board-helpers";

const only = (table: string) => calls.filter((c) => c.table === table);
const payloadFor = (table: string, op: string, n = 0) => {
  const record = only(table)[n];
  const idx = record.ops.indexOf(op);
  return (record.payloads[idx] as unknown[])[0];
};

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
  getLead.mockClear();
  getLead.mockResolvedValue({ ok: true, lead: { status: "engaged" } });
  recordTransition.mockClear();
  bumpCompanyLifecycle.mockClear();
  bumpPersonCompanies.mockClear();
  convertToUsdCents.mockClear();
  convertToUsdCents.mockResolvedValue({ amountUsdCents: 12345, rate: 1.5 });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("moveDealStage", () => {
  const openStage = { name: "Discovery", is_won: false, is_lost: false };

  it("refuses a lost move with no reason and a won move with no amount", async () => {
    script("pipeline_stages", { data: { name: "Lost", is_won: false, is_lost: true } });
    expect(await moveDealStage("d1", "s-lost")).toEqual({ ok: false, error: "Losing a deal needs a reason." });

    scripts.clear();
    calls.length = 0;
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    expect(await moveDealStage("d1", "s-won")).toEqual({
      ok: false,
      error: "Marking a deal won needs the final deal amount.",
    });
  });

  it("bumps probability on entering Contract Sent", async () => {
    script("pipeline_stages", { data: { name: "Contract Sent", is_won: false, is_lost: false } });
    script("deals", { data: { person_id: null, company_id: null } });

    expect(await moveDealStage("d1", "s-cs")).toEqual({ ok: true });
    expect(payloadFor("deals", "update")).toEqual({
      stage_id: "s-cs",
      status: "open",
      closed_at: null,
      probability: 90,
    });
  });

  it("converts the won amount to USD from the deal's stored currency", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: "eur" } }, { data: { person_id: null, company_id: "c1" } });

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });

    expect(convertToUsdCents).toHaveBeenCalledWith(10000, "eur");
    expect(payloadFor("deals", "update", 1)).toEqual({
      stage_id: "s-won",
      status: "won",
      closed_at: "2026-09-06T12:00:00.000Z",
      amount_cents: 10000,
      amount_usd_cents: 12345,
      fx_rate: 1.5,
      fx_rate_fetched_at: "2026-09-06T12:00:00.000Z",
    });
    expect(bumpCompanyLifecycle).toHaveBeenCalledWith("c1", "customer", { reason: "deal_won" });
  });

  it("saves the deal anyway when the FX lookup throws", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { data: { currency: null } }, { data: { person_id: null, company_id: null } });
    convertToUsdCents.mockRejectedValue(new Error("fx down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: true });
    expect(convertToUsdCents).toHaveBeenCalledWith(10000, "usd");
    expect(payloadFor("deals", "update", 1)).toEqual({
      stage_id: "s-won",
      status: "won",
      closed_at: "2026-09-06T12:00:00.000Z",
      amount_cents: 10000,
    });
    spy.mockRestore();
  });

  it("returns the currency read error rather than closing the deal", async () => {
    script("pipeline_stages", { data: { name: "Won", is_won: true, is_lost: false } });
    script("deals", { error: { message: "no row" } });
    expect(await moveDealStage("d1", "s-won", undefined, 100)).toEqual({ ok: false, error: "no row" });
  });

  it("leaves an open move untouched by FX", async () => {
    script("pipeline_stages", { data: openStage });
    script("deals", { data: { person_id: null, company_id: null } });
    await moveDealStage("d1", "s-open");
    expect(convertToUsdCents).not.toHaveBeenCalled();
  });
});

describe("updateDeal", () => {
  it("converts and caches the rate when the amount changes", async () => {
    script("deals", { data: { amount_cents: 5000, currency: "gbp" } }, {});
    script("fx_rates", {});

    expect(await updateDeal("d1", { amount: 250 })).toEqual({ ok: true });

    expect(convertToUsdCents).toHaveBeenCalledWith(25000, "gbp");
    expect(payloadFor("deals", "update", 1)).toEqual({
      amount_cents: 25000,
      amount_usd_cents: 12345,
      fx_rate: 1.5,
      fx_rate_fetched_at: "2026-09-06T12:00:00.000Z",
    });
    expect(payloadFor("fx_rates", "upsert")).toEqual({
      currency: "gbp",
      rate_to_usd: 1.5,
      updated_at: "2026-09-06T12:00:00.000Z",
    });
  });

  it("does not re-read the deal when both amount and currency are in the patch", async () => {
    script("deals", {});
    script("fx_rates", {});

    await updateDeal("d1", { amount: 10, currency: " EUR " });

    expect(convertToUsdCents).toHaveBeenCalledWith(1000, "eur");
    expect(only("deals")).toHaveLength(1);
  });

  it("keeps the conversion when caching the rate fails", async () => {
    script("deals", {});
    script("fx_rates", { error: { message: "cache down" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await updateDeal("d1", { amount: 10, currency: "usd" })).toEqual({ ok: true });
    expect(payloadFor("deals", "update", 0)).toMatchObject({ amount_usd_cents: 12345, fx_rate: 1.5 });
    expect(spy).toHaveBeenCalledWith("caching fx rate failed:", "cache down");
    spy.mockRestore();
  });

  it("returns the existing-deal read error", async () => {
    script("deals", { error: { message: "gone" } });
    expect(await updateDeal("d1", { amount: 10 })).toEqual({ ok: false, error: "gone" });
  });

  it("validates before touching FX", async () => {
    expect(await updateDeal("d1", { title: "  " })).toEqual({ ok: false, error: "Title can't be empty." });
    expect(await updateDeal("d1", { amount: -1 })).toEqual({ ok: false, error: "Amount must be zero or more." });
    expect(await updateDeal("d1", { currency: " " })).toEqual({ ok: false, error: "Currency is required." });
    expect(await updateDeal("d1", { probability: 101 })).toEqual({
      ok: false,
      error: "Probability must be between 0 and 100.",
    });
    expect(convertToUsdCents).not.toHaveBeenCalled();
  });
});

describe("demoteDealToLead", () => {
  const deal = { person_id: "p1", status: "open", handoff_status: null, archived_at: null };

  it("archives the deal and reopens the lead at connected, clearing the disqualification", async () => {
    script("deals", { data: deal }, {});
    script("lead", {});

    expect(await demoteDealToLead("d1", "  needs work  ")).toEqual({ ok: true });

    expect(payloadFor("deals", "update", 1)).toEqual({
      archived_at: "2026-09-06T12:00:00.000Z",
      archived_by: "admin@example.com",
    });
    expect(payloadFor("lead", "upsert")).toEqual({
      person_id: "p1",
      status: "connected",
      sla_due_at: null,
      disqualified_reason: null,
      updated_at: "2026-09-06T12:00:00.000Z",
    });
    expect((only("lead")[0].payloads[0] as unknown[])[1]).toEqual({ onConflict: "person_id" });
    expect(recordTransition).toHaveBeenCalledWith({
      personId: "p1",
      fromStatus: "engaged",
      toStatus: "connected",
      reason: "demoted_from_deal",
      note: "needs work",
    });
  });

  it("returns the lead upsert error", async () => {
    script("deals", { data: deal }, {});
    script("lead", { error: { message: "lead locked" } });

    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "lead locked" });
    expect(recordTransition).not.toHaveBeenCalled();
  });

  it("refuses deals that are archived, closed, pending handoff or contactless", async () => {
    script("deals", { data: { ...deal, archived_at: "2026-01-01" } });
    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "This deal is already archived." });

    scripts.clear();
    script("deals", { data: { ...deal, status: "won" } });
    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "Only open deals can be demoted." });

    scripts.clear();
    script("deals", { data: { ...deal, handoff_status: "pending" } });
    expect(await demoteDealToLead("d1", "x")).toEqual({
      ok: false,
      error: "This deal is still a pending handoff — accept or reject it instead.",
    });

    scripts.clear();
    script("deals", { data: { ...deal, person_id: null } });
    expect(await demoteDealToLead("d1", "x")).toEqual({ ok: false, error: "This deal isn't linked to a contact." });
  });
});

describe("decideHandoff", () => {
  it("rejects with a reason, closes the deal lost and reopens the lead at connected", async () => {
    script("deals", { data: { person_id: "p1", handoff_status: "pending" } }, {});
    script("lead", {});

    expect(await decideHandoff("d1", "rejected", "not_qualified", "  note  ")).toEqual({ ok: true });

    expect(payloadFor("deals", "update", 1)).toEqual({
      handoff_status: "rejected",
      handoff_decided_at: "2026-09-06T12:00:00.000Z",
      handoff_note: "note",
      handoff_rejected_reason: "not_qualified",
      status: "lost",
      closed_at: "2026-09-06T12:00:00.000Z",
      lost_reason: "bad_fit",
    });
    // No `disqualified_reason` here: the reject path leaves it alone.
    expect(payloadFor("lead", "upsert")).toEqual({
      person_id: "p1",
      status: "connected",
      sla_due_at: null,
      updated_at: "2026-09-06T12:00:00.000Z",
    });
    expect(recordTransition).toHaveBeenCalledWith({
      personId: "p1",
      fromStatus: "engaged",
      toStatus: "connected",
      reason: "handoff_rejected",
      note: "not_qualified",
    });
  });

  it("logs but does not fail when the lead upsert fails", async () => {
    script("deals", { data: { person_id: "p1", handoff_status: "pending" } }, {});
    script("lead", { error: { message: "lead locked" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await decideHandoff("d1", "rejected", "not_qualified")).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith("handoff-reject lead sync failed:", "lead locked");
    expect(recordTransition).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("accepting touches no lead row", async () => {
    script("deals", { data: { person_id: "p1", handoff_status: "pending" } }, {});

    expect(await decideHandoff("d1", "accepted")).toEqual({ ok: true });
    expect(payloadFor("deals", "update", 1)).toEqual({
      handoff_status: "accepted",
      handoff_decided_at: "2026-09-06T12:00:00.000Z",
      handoff_note: null,
    });
    expect(only("lead")).toHaveLength(0);
    expect(recordTransition).not.toHaveBeenCalled();
  });

  it("refuses a reject with no valid reason and a already-decided handoff", async () => {
    expect(await decideHandoff("d1", "rejected")).toEqual({
      ok: false,
      error: "Rejecting a handoff needs a reason.",
    });

    script("deals", { data: { person_id: "p1", handoff_status: "accepted" } });
    expect(await decideHandoff("d1", "accepted")).toEqual({ ok: false, error: "Handoff already decided." });
  });
});

// The two pure helpers behind the deal server actions. `actions.ts` is
// "use server", so they sit in board-helpers.ts and are imported from there —
// that is the only way either can be reached without a Supabase client.

describe("normalizeUrl", () => {
  it("keeps a URL that already has a scheme, in either case", () => {
    expect(normalizeUrl("https://www.example.com/x")).toBe("https://www.example.com/x");
    expect(normalizeUrl("http://www.example.com")).toBe("http://www.example.com");
    expect(normalizeUrl("HTTPS://example.com")).toBe("HTTPS://example.com");
  });

  it("adds https:// to a bare host so the stored value is clickable", () => {
    expect(normalizeUrl("docs.google.com/x")).toBe("https://docs.google.com/x");
  });

  it("trims before deciding", () => {
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
    expect(normalizeUrl(" https://www.example.com ")).toBe("https://www.example.com");
  });

  it("returns null for empty, blank, null and undefined, so the column clears", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });

  it("CURRENT BEHAVIOUR: prefixes any other scheme rather than rejecting it", () => {
    // Only http/https are recognised, so anything else is treated as a bare
    // host and gets a scheme glued on the front. It renders as a dead link
    // rather than an executable one, which is the safe direction; pinned here
    // so a future change to the regex is a deliberate one.
    expect(normalizeUrl("ftp://files.example.com")).toBe("https://ftp://files.example.com");
    expect(normalizeUrl("javascript:alert(1)")).toBe("https://javascript:alert(1)");
  });
});

