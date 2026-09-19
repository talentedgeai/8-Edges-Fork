import { beforeEach, describe, expect, it, vi } from "vitest";

// coachCreateOneOnOne against a scripted client. A date that already has a
// live row is the meeting the coach means: logging it as held marks that row
// held instead of inserting a twin. The partial unique index on
// (coaching_profile_id, held_on) where archived_at is null (K.3, B10) makes a
// twin impossible, so this is also what keeps the action from failing.

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
    return { data: next?.data ?? null, error: next?.error ?? null, count: next?.count ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "eq", "in", "is", "maybeSingle", "single", "order", "limit"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      record.payloads.push(args);
      return builder;
    };
  }
  return builder;
}
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/entities/coaching/lib/transcript", () => ({ saveCoachingTranscript: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.test" }));
const notifyBoth = vi.fn(async () => true);
vi.mock("@/entities/coaching/lib/cycle-shared", () => ({
  notifyBoth: (...a: unknown[]) => notifyBoth(...(a as [])),
}));

import { coachCreateOneOnOne, coachPublishSharedRecap, coachSkipOneOnOne, moveOutcome } from "./one-on-ones";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "coach-1" } as TeamActor;

describe("coachCreateOneOnOne", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
  });

  it("marks the scheduled row on that date held instead of inserting a twin", async () => {
    script("coaching_profiles", { data: { id: "p1", coach_id: "coach-1" } });
    script("coaching_one_on_ones", { data: { id: "o-sched", status: "scheduled" } }); // existing row lookup
    script("coaching_one_on_ones", { data: { id: "o-sched" } }); // the update

    const res = await coachCreateOneOnOne(actor, "p1", "2026-09-15", "held");

    expect(res).toEqual({ ok: true, id: "o-sched" });
    const writes = calls.filter((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(writes).toHaveLength(1);
    expect(writes[0].payloads[writes[0].ops.indexOf("update")]).toEqual([expect.objectContaining({ status: "held" })]);
    expect(calls.some((c) => c.ops.includes("insert"))).toBe(false);
  });

  it("inserts when the date has no live row", async () => {
    script("coaching_profiles", { data: { id: "p1", coach_id: "coach-1" } });
    script("coaching_one_on_ones", { data: null });
    script("coaching_one_on_ones", { data: { id: "o-new" } });

    const res = await coachCreateOneOnOne(actor, "p1", "2026-09-15", "held");

    expect(res).toEqual({ ok: true, id: "o-new" });
    expect(calls.some((c) => c.ops.includes("insert"))).toBe(true);
  });

  it("skipping marks the row with its reason and rolls the profile's next date by the cadence", async () => {
    // The skipped 1-1 was a Wednesday; +14 is a Wednesday too, so the
    // weekend nudge does not move it (K.9).
    script("coaching_one_on_ones", {
      data: { id: "o1", coaching_profile_id: "p1", held_on: "2026-09-16", status: "scheduled", coaching_profiles: { coach_id: "coach-1" } },
    });
    script("coaching_one_on_ones", { data: null }); // the status/reason update
    script("coaching_profiles", { data: { cadence_days: 14, next_one_on_one_on: "2026-09-16" } });
    script("coaching_profiles", { data: null }); // the rolled date

    const res = await coachSkipOneOnOne(actor, "o1", "Client escalation");

    expect(res).toEqual({ ok: true });
    const meetingUpdate = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(meetingUpdate?.payloads[meetingUpdate.ops.indexOf("update")]).toEqual([
      expect.objectContaining({ status: "skipped", skip_reason: "Client escalation" }),
    ]);
    const profileUpdate = calls.find((c) => c.table === "coaching_profiles" && c.ops.includes("update"));
    expect(profileUpdate?.payloads[profileUpdate.ops.indexOf("update")]).toEqual([
      expect.objectContaining({ next_one_on_one_on: "2026-09-30" }),
    ]);
  });

  it("refuses a skip with no reason and writes nothing", async () => {
    script("coaching_one_on_ones", {
      data: { id: "o1", coaching_profile_id: "p1", held_on: "2026-09-16", status: "scheduled", coaching_profiles: { coach_id: "coach-1" } },
    });

    const res = await coachSkipOneOnOne(actor, "o1", "   ");

    expect(res).toEqual({ ok: false, error: "Say why it was skipped." });
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("scheduling a date that already has a row returns that row and still mirrors the date onto the profile", async () => {
    script("coaching_profiles", { data: { id: "p1", coach_id: "coach-1" } });
    script("coaching_one_on_ones", { data: { id: "o-sched", status: "scheduled" } });
    script("coaching_profiles", { data: null });

    const res = await coachCreateOneOnOne(actor, "p1", "2026-09-30", "scheduled");

    expect(res).toEqual({ ok: true, id: "o-sched" });
    expect(calls.some((c) => c.ops.includes("insert"))).toBe(false);
    const patch = calls.filter((c) => c.table === "coaching_profiles" && c.ops.includes("update"));
    expect(patch).toHaveLength(1);
  });
});

// K.15 (spec 4): publishing a recap notifies the member with one plain line and
// a link. No card, no buttons, and the count counts commitments, never the
// person.
describe("coachPublishSharedRecap", () => {
  beforeEach(() => {
    scripts.clear();
    calls.length = 0;
    notifyBoth.mockClear();
  });

  it("sends one link-only message naming the coach, the date and the commitment count", async () => {
    script(
      "coaching_one_on_ones",
      { data: { id: "o-1", coaching_profile_id: "p1", held_on: "2026-09-15", shared_summary_markdown: "Recap", coaching_profiles: { coach_id: "coach-1" } } },
      { data: { id: "o-1" } }, // the publish patch
    );
    script(
      "coaching_profiles",
      { data: { coach_id: "coach-1", team_members: { people: { full_name: "Khoa", preferred_name: null, email: "khoa@example.test" } } } },
    );
    script("team_members", { data: { people: { full_name: "Dave Smith", preferred_name: "Dave", email: "dave@example.test" } } });
    script("coaching_commitments", { count: 3 });

    const res = await coachPublishSharedRecap(actor, "o-1", true);

    expect(res).toEqual({ ok: true });
    expect(notifyBoth).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "khoa@example.test",
        larkText:
          "Dave published the recap of your 1-1 on 2026-09-15. 3 commitments are yours to word. https://example.test/team/my-coaching",
      }),
    );
  });

  it("notifies nobody when the recap is being unpublished", async () => {
    script(
      "coaching_one_on_ones",
      { data: { id: "o-1", coaching_profile_id: "p1", held_on: "2026-09-15", shared_summary_markdown: "Recap", coaching_profiles: { coach_id: "coach-1" } } },
      { data: { id: "o-1" } },
    );

    expect(await coachPublishSharedRecap(actor, "o-1", false)).toEqual({ ok: true });
    expect(notifyBoth).not.toHaveBeenCalled();
  });
});

// The whole refusal rule for a move (K.33), pure and therefore readable
// without a scripted client: what may be moved, where to, and with what said
// about it. What the rule guards — the row keeping its id, and with it the
// prep, the answers and the commitments — is a property of the update rather
// than of the decision, and is checked in a browser.
describe("moveOutcome", () => {
  const today = "2026-09-17"; // a Thursday
  const scheduled = { status: "scheduled" as const, heldOn: "2026-09-23" };

  it("allows a scheduled 1-1 onto another weekday with a reason", () => {
    expect(moveOutcome(scheduled, "2026-09-25", "Michael is travelling", today)).toEqual({ ok: true });
  });

  it("refuses a 1-1 that was held or skipped", () => {
    expect(moveOutcome({ status: "held", heldOn: "2026-09-16" }, "2026-09-25", "why", today).ok).toBe(false);
    expect(moveOutcome({ status: "skipped", heldOn: "2026-09-16" }, "2026-09-25", "why", today).ok).toBe(false);
  });

  it("refuses the day it is already on", () => {
    expect(moveOutcome(scheduled, "2026-09-23", "why", today).ok).toBe(false);
  });

  it("refuses a past date and a weekend, exactly as a proposal does", () => {
    expect(moveOutcome(scheduled, "2026-09-16", "why", today).ok).toBe(false);
    expect(moveOutcome(scheduled, "2026-09-26", "why", today).ok).toBe(false); // Saturday
    expect(moveOutcome(scheduled, "2026-09-27", "why", today).ok).toBe(false); // Sunday
  });

  it("insists on a one-line why", () => {
    expect(moveOutcome(scheduled, "2026-09-25", "   ", today).ok).toBe(false);
    expect(moveOutcome(scheduled, "2026-09-25", "x".repeat(501), today).ok).toBe(false);
  });
});
