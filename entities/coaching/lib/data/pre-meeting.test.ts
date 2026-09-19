import { beforeEach, describe, expect, it, vi } from "vitest";

// savePreMeetingAnswers against the scripted client (the fake the rest of this
// entity's suites use). Two things are pinned: the write is an upsert onto the
// ONE row of the current cycle, creating it when the nudge has not opened one
// yet; and responded_at follows the content, stamped when anything was typed
// and cleared when the member erased it all, because it is what the cycle and
// the prep read as "this form has been answered".

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
  for (const op of ["select", "insert", "update", "eq", "is", "in", "not", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));

import { loadPreMeetingAnswers, savePreMeetingAnswers } from "./pre-meeting";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "tm-1" } as TeamActor;

// myProfileId, then the profile's next date, the last held 1-1, and the rows.
function scriptLookups(rows: unknown[], opts: { lastHeld?: string | null; nextOn?: string | null } = {}) {
  script("coaching_profiles", { data: { id: "p1" } }, { data: { next_one_on_one_on: opts.nextOn ?? "2026-09-18" } });
  script("coaching_one_on_ones", { data: opts.lastHeld === null ? null : { held_on: opts.lastHeld ?? "2026-09-04" } });
  script("coaching_checkins", { data: rows });
}

const writeTo = (table: string, op: "insert" | "update") =>
  calls.filter((c) => c.table === table).find((c) => c.ops.includes(op));

describe("savePreMeetingAnswers", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
  });

  it("updates the current cycle's row and stamps responded_at", async () => {
    scriptLookups([
      { id: "ck-now", sent_at: "2026-09-14T02:00:00Z" },
      { id: "ck-old", sent_at: "2026-08-30T02:00:00Z" },
    ]);
    script("coaching_checkins", { data: null });

    const res = await savePreMeetingAnswers(actor, " Shipped the board ", "", "My next quarter");

    expect(res).toEqual({ ok: true });
    const update = writeTo("coaching_checkins", "update");
    expect(update?.payloads[update.ops.indexOf("update")]).toEqual([
      expect.objectContaining({
        moved_md: "Shipped the board",
        stuck_md: null,
        talk_md: "My next quarter",
        responded_at: expect.any(String),
      }),
    ]);
    // The row it wrote to is this cycle's, never the previous cycle's.
    expect(update?.payloads).toContainEqual(["id", "ck-now"]);
    expect(calls.some((c) => c.table === "coaching_checkins" && c.ops.includes("insert"))).toBe(false);
  });

  it("opens the row when the nudge has not sent one yet", async () => {
    scriptLookups([{ id: "ck-old", sent_at: "2026-08-30T02:00:00Z" }]);
    script("coaching_checkins", { data: null });

    const res = await savePreMeetingAnswers(actor, "Shipped", "", "");

    expect(res).toEqual({ ok: true });
    const insert = writeTo("coaching_checkins", "insert");
    expect(insert?.payloads[insert.ops.indexOf("insert")]).toEqual([
      expect.objectContaining({ coaching_profile_id: "p1", moved_md: "Shipped", sent_at: expect.any(String) }),
    ]);
  });

  it("clears responded_at when the member erased every answer", async () => {
    scriptLookups([{ id: "ck-now", sent_at: "2026-09-14T02:00:00Z" }]);
    script("coaching_checkins", { data: null });

    const res = await savePreMeetingAnswers(actor, "  ", "", "\n");

    expect(res).toEqual({ ok: true });
    const update = writeTo("coaching_checkins", "update");
    expect(update?.payloads[update.ops.indexOf("update")]).toEqual([
      expect.objectContaining({ moved_md: null, stuck_md: null, talk_md: null, responded_at: null }),
    ]);
  });

  it("refuses when the actor has no active coaching profile", async () => {
    script("coaching_profiles", { data: null });

    expect(await savePreMeetingAnswers(actor, "a", "b", "c")).toEqual({
      ok: false,
      error: "You are not in a coaching cycle.",
    });
    expect(calls.some((c) => c.table === "coaching_checkins")).toBe(false);
  });
});

// The prep's half of the same row (K.15). The three headings always reach the
// prep, filled or empty, because an empty heading is the question the coach
// asks in the room rather than a hole in the list.
describe("loadPreMeetingAnswers", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
  });

  it("quotes this cycle's answers under the three headings", async () => {
    script("coaching_profiles", { data: { next_one_on_one_on: "2026-09-18" } });
    script("coaching_one_on_ones", { data: { held_on: "2026-09-04" } });
    script("coaching_checkins", {
      data: [
        { sent_at: "2026-09-14T02:00:00Z", moved_md: "Shipped the board", stuck_md: "Waiting on design", talk_md: "My next quarter" },
        // The previous cycle's row: older than the last held 1-1, so the prep
        // must not quote it.
        { sent_at: "2026-08-30T02:00:00Z", moved_md: "Old news", stuck_md: null, talk_md: null },
      ],
    });

    const block = await loadPreMeetingAnswers("p1");

    expect(block).toContain("## What moved since last time\nShipped the board");
    expect(block).toContain("## What is stuck\nWaiting on design");
    expect(block).toContain("## What I want to talk about\nMy next quarter");
    expect(block).not.toContain("Old news");
  });

  it("still renders every heading when the member wrote nothing", async () => {
    script("coaching_profiles", { data: { next_one_on_one_on: "2026-09-18" } });
    script("coaching_one_on_ones", { data: { held_on: "2026-09-04" } });
    script("coaching_checkins", { data: [] });

    expect(await loadPreMeetingAnswers("p1")).toBe(
      "## What moved since last time\n(nothing written)\n\n" +
        "## What is stuck\n(nothing written)\n\n" +
        "## What I want to talk about\n(nothing written)",
    );
  });

  it("ignores a row stamped after the upcoming 1-1", async () => {
    script("coaching_profiles", { data: { next_one_on_one_on: "2026-09-18" } });
    script("coaching_one_on_ones", { data: { held_on: "2026-09-04" } });
    script("coaching_checkins", {
      data: [{ sent_at: "2026-09-20T02:00:00Z", moved_md: "Next cycle", stuck_md: null, talk_md: null }],
    });

    expect(await loadPreMeetingAnswers("p1")).not.toContain("Next cycle");
  });
});
