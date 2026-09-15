import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterisation of summarizeReviewCall's write path. The "ready" patch IS the
// result of the action: before the rule-2 sweep its update error was discarded
// and the action returned { ok: true } with nothing saved. These cases pin the
// new behaviour (the failure surfaces) and the untouched success path.
//
// The fake Supabase client is the one from
// entities/portal/lib/work-request-lifecycle.test.ts: `companyOs.from(table)`
// returns a chainable builder that resolves to the next scripted response for
// that table and records the operations and payloads it saw.

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
  readTextOutput: () => ({
    ok: true,
    text: JSON.stringify({ overview: "An overview.", strengths: [], growth_areas: [], dimensions: [] }),
  }),
}));
// lib/reviews pulls in team-auth (and React's `cache`), which does not load
// outside a request; only the dimension list matters here.
vi.mock("@/entities/team/lib/reviews", () => ({
  REVIEW_DIMENSIONS: [{ key: "craft", label: "Craft" }],
}));
vi.mock("@/entities/team/lib/reviews/transcript", () => ({
  readReviewTranscript: async () => "A transcript.",
}));

import { summarizeReviewCall } from "./review-summary";

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("summarizeReviewCall", () => {
  it("returns the write's error when the ready patch fails", async () => {
    // 1: patchSummary's metadata read. 2: the metadata update, which fails.
    script("performance_reviews", { data: { metadata: {} } }, { error: { message: "update denied" } });

    const res = await summarizeReviewCall("review-1");

    expect(res).toEqual({ ok: false, error: "update denied" });
  });

  it("still returns ok when the patch lands", async () => {
    script("performance_reviews", { data: { metadata: {} } }, { error: null });

    const res = await summarizeReviewCall("review-1");

    expect(res).toEqual({ ok: true });
    const patch = (calls.filter((c) => c.table === "performance_reviews")[1].payloads[0] as [
      { metadata: { transcript_summary: { ai_status: string; overview: string } } },
    ])[0];
    expect(patch.metadata.transcript_summary.ai_status).toBe("ready");
    expect(patch.metadata.transcript_summary.overview).toBe("An overview.");
  });
});
