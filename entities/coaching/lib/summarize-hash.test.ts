import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// K.12: summarizeMeeting skips the model when the transcript it would send
// hashes to the value stored by the last successful run. Re-running a recap on
// an unchanged transcript used to spend a full `deep` call to reproduce the
// summary already on the row.
//
// The fake Supabase client is the one from entities/coaching/lib/ai.test.ts;
// the repo copies it per suite rather than sharing a harness.

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

const create = vi.fn(async () => ({}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({ messages: { create } }),
}));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "test-model" }));
// A factory mock replaces the whole module. jsonSchemaFor is here because
// prompts.ts derives the summary schema at module load (ADR 0006).
vi.mock("@/kernel/ai/response", () => ({
  jsonSchemaFor: () => ({}),
  readTextOutput: () => ({ ok: true, text: "text" }),
  readStructuredOutput: () => ({
    ok: true,
    data: {
      summary_markdown: "Private.",
      shared_summary_markdown: "Shared.",
      mode_split_estimate: { coach: 80, mentor: 15, direct: 5 },
      commitments: [],
    },
  }),
}));
vi.mock("./data/goals", () => ({
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
}));

import { summarizeMeeting } from "./ai";

const TRANSCRIPT = "Coach: how did the week go? Member: the pricing draft landed.";
const HASH = createHash("sha256").update(TRANSCRIPT).digest("hex");

function meeting(patch: Record<string, unknown>) {
  return {
    id: "meeting-1",
    coaching_profile_id: "profile-1",
    held_on: "2026-09-16",
    transcript_sha256: null,
    summary_markdown: null,
    prep_markdown: null,
    // The transcript only ever comes from the linked meeting now (K.11).
    linked_meeting: { call_transcripts: [{ transcript: TRANSCRIPT }] },
    ...patch,
  };
}

const PROFILE = {
  id: "profile-1",
  coach_id: "coach-1",
  retention_root: null,
  private_profile_markdown: null,
  cadence_days: 14,
  recap_language: "vi",
  team_members: { people: { full_name: "Ada", preferred_name: "Ada" }, positions: { title: "Engineer" } },
};

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
  create.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("summarizeMeeting transcript hash", () => {
  it("skips the model when the stored hash matches and a summary exists", async () => {
    script("coaching_one_on_ones", { data: meeting({ transcript_sha256: HASH, summary_markdown: "Private." }) });

    const res = await summarizeMeeting("meeting-1");

    expect(res).toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("still calls the model when the hash matches but no summary was written", async () => {
    script("coaching_one_on_ones", { data: meeting({ transcript_sha256: HASH }) });
    script("coaching_profiles", { data: PROFILE });

    const res = await summarizeMeeting("meeting-1");

    expect(res).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("stores the hash of the transcript it summarised", async () => {
    script("coaching_one_on_ones", { data: meeting({}) });
    script("coaching_profiles", { data: PROFILE });

    const res = await summarizeMeeting("meeting-1");

    expect(res).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    const patch = (update?.payloads[0] as [Record<string, unknown>])[0];
    expect(patch.transcript_sha256).toBe(HASH);
    expect(patch.summary_markdown).toBe("Private.");
  });

  it("names the member's pinned recap language in the user message", async () => {
    script("coaching_one_on_ones", { data: meeting({}) });
    script("coaching_profiles", { data: PROFILE });

    await summarizeMeeting("meeting-1");

    const body = (create.mock.calls as unknown as [{ messages: { content: string }[] }][])[0][0];
    expect(body.messages[0].content).toContain("# Recap language\nVietnamese");
  });
});
