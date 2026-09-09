import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterisation of generateTrendReport's write path. The trend stamp is the
// only place the report is persisted, and before the rule-2 sweep its upsert
// error was discarded: a failed write returned { ok: true } with no report on
// the row. These cases pin the new failure return and the untouched success.
//
// The fake Supabase client is the one from
// entities/portal/lib/work-request-lifecycle.test.ts.

type Response = { data?: unknown; error?: { message: string } | null };
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
    return { data: next?.data ?? null, error: next?.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "not", "or", "gte", "lt", "order", "limit", "range", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({ messages: { create: async () => ({}) } }),
}));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "test-model" }));
vi.mock("@/kernel/ai/response", () => ({
  readTextOutput: () => ({ ok: true, text: "The trend report." }),
}));
vi.mock("./data/goals", () => ({
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
}));

import { generateTrendReport } from "./ai";

const PROFILE = {
  id: "profile-1",
  coach_id: "coach-1",
  retention_root: null,
  private_profile_markdown: null,
  cadence_days: 14,
  team_members: { people: { full_name: "Ada", preferred_name: "Ada" }, positions: { title: "Engineer" } },
};
const MEETINGS = [
  { held_on: "2026-02-10", summary_markdown: "Second." },
  { held_on: "2026-01-10", summary_markdown: "First." },
];

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
  // 1: loadProfileContext. Everything else the generators read falls through to
  // the fake's empty default, which each loader renders as a "(none)" block.
  script("coaching_profiles", { data: PROFILE });
  // 1: the trend window (newest first, reversed by the caller).
  script("coaching_one_on_ones", { data: MEETINGS });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateTrendReport", () => {
  it("returns the upsert's error when the trend stamp fails", async () => {
    script("coaching_trends", { data: null }, { error: { message: "upsert denied" } });

    const res = await generateTrendReport("profile-1");

    expect(res).toEqual({ ok: false, error: "upsert denied" });
  });

  it("still returns ok when the stamp lands", async () => {
    script("coaching_trends", { data: null }, { error: null });

    const res = await generateTrendReport("profile-1");

    expect(res).toEqual({ ok: true });
    const stamp = calls.filter((c) => c.table === "coaching_trends" && c.ops.includes("upsert"))[0];
    const row = (stamp.payloads[0] as [{ period: string; report_markdown: string }])[0];
    expect(row.period).toBe("2026-01");
    expect(row.report_markdown).toBe("The trend report.");
  });
});
