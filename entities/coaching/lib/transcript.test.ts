import { beforeEach, describe, expect, it, vi } from "vitest";

// B9 (K.11): ensureCoachingMeeting used to check-then-insert. Two concurrent
// saves of the same 1-1 both read meeting_id null, both inserted, and the
// loser's orphan meeting stayed behind; any insert failure came back as a flat
// "Could not link the coaching session to a meeting." These cases pin the
// unique-violation re-read and the surfaced insert error.
//
// The fake Supabase client is the one from entities/coaching/lib/ai.test.ts.

type Response = { data?: unknown; error?: { message: string; code?: string } | null };
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

import { saveCoachingTranscript } from "./transcript";

// The 1-1 as loadLink reads it: held, with a coach, and no meeting yet — the
// only state in which ensureCoachingMeeting inserts.
const UNLINKED = {
  id: "o-1",
  held_on: "2026-09-16",
  meeting_id: null,
  coaching_profiles: { coach_id: "coach-1" },
};

beforeEach(() => {
  scripts.clear();
  calls.length = 0;
});

describe("saveCoachingTranscript", () => {
  it("adopts the meeting the other writer created when the insert hits the unique index", async () => {
    script("coaching_one_on_ones", { data: UNLINKED }, { data: null });
    // 1: the losing insert. 2: the re-read by the metadata key.
    script(
      "meetings",
      { error: { message: 'duplicate key value violates unique constraint "meetings_coaching_one_on_one_uniq"', code: "23505" } },
      { data: { id: "m-winner" } },
    );
    script("call_transcripts", { data: null });

    const res = await saveCoachingTranscript("o-1", "Coach: how did the week go?");

    expect(res).toEqual({ ok: true, meetingId: "m-winner" });
    // The transcript went onto the winner's meeting, not a second one.
    const upsert = calls.find((c) => c.table === "call_transcripts");
    expect((upsert?.payloads[0] as unknown[])[0]).toMatchObject({ meeting_id: "m-winner" });
  });

  it("surfaces the real insert error instead of a generic link failure", async () => {
    script("coaching_one_on_ones", { data: UNLINKED });
    script("meetings", { error: { message: "permission denied for table meetings", code: "42501" } });

    const res = await saveCoachingTranscript("o-1", "Coach: how did the week go?");

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("permission denied for table meetings");
    // Nothing was written to call_transcripts on a failed link.
    expect(calls.some((c) => c.table === "call_transcripts")).toBe(false);
  });
});
