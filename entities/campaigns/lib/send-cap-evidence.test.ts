import { beforeEach, describe, expect, it, vi } from "vitest";

// The composition test: dailySendCap reads BOTH queue tables, folds them into
// one evidence set, and applies the rule. send-cap.test.ts covers the rule in
// isolation; this covers the chain, which is where the A.15 defect lived — the
// evidence loader always read both tables, and only the enforcement was
// one-sided.

type Res = { data: unknown; error: { message: string } | null };
const responses = new Map<string, Res>();
const seen: string[] = [];

function builderFor(table: string) {
  seen.push(table);
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(responses.get(table) ?? { data: [], error: null }).then(resolve, reject),
  };
  for (const op of ["select", "eq", "in", "gte", "is", "order", "limit", "maybeSingle"]) {
    b[op] = () => b;
  }
  return b;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (t: string) => builderFor(t) },
}));

import { dailySendCap } from "./send-cap";

// 09:00 in Ho Chi Minh City on 18 September 2026 is 02:00 UTC.
const now = new Date("2026-09-18T02:00:00Z");
const SENT_TODAY = [{ sent_at: "2026-09-18T01:00:00Z" }];

beforeEach(() => {
  responses.clear();
  seen.length = 0;
});

describe("dailySendCap reads both queues", () => {
  it("asks email_campaign_recipients and email_messages", async () => {
    await dailySendCap("broadcast", "p1", now);
    expect(seen).toContain("email_campaign_recipients");
    expect(seen).toContain("email_messages");
  });

  it("lets a send through when neither queue shows anything today", async () => {
    expect(await dailySendCap("broadcast", "p1", now)).toEqual({ hold: null });
    expect(await dailySendCap("personal", "p1", now)).toEqual({ hold: null });
  });
});

// The invariant the cron advertises, proven through the whole chain in BOTH
// directions. Before A.15 the second of these would have passed and the first
// would never have been asked, because the broadcast tick had no cap at all.
describe("one marketing email per person per company day, across both kinds", () => {
  it("a PERSONAL message already sent today holds a BROADCAST", async () => {
    responses.set("email_messages", { data: SENT_TODAY, error: null });
    expect(await dailySendCap("broadcast", "p1", now)).toEqual({ hold: "emailed today" });
  });

  it("a BROADCAST already sent today holds a PERSONAL message", async () => {
    responses.set("email_campaign_recipients", { data: SENT_TODAY, error: null });
    expect(await dailySendCap("personal", "p1", now)).toEqual({ hold: "emailed today" });
  });

  it("yesterday's email holds neither kind", async () => {
    // 17:00 UTC on the 17th is 00:00 on the 18th company time — so pick earlier.
    responses.set("email_messages", { data: [{ sent_at: "2026-09-16T10:00:00Z" }], error: null });
    expect(await dailySendCap("broadcast", "p1", now)).toEqual({ hold: null });
    expect(await dailySendCap("personal", "p1", now)).toEqual({ hold: null });
  });
});

describe("evidence that cannot be read", () => {
  it("holds the send and reports why, rather than sending blind", async () => {
    responses.set("email_messages", { data: null, error: { message: "timeout" } });
    const v = await dailySendCap("broadcast", "p1", now);
    expect(v.hold).toBe("cap evidence unavailable");
    expect(v.error).toBe("timeout");
  });

  it("holds when the broadcast queue is the one that fails", async () => {
    responses.set("email_campaign_recipients", { data: null, error: { message: "reset" } });
    expect((await dailySendCap("personal", "p1", now)).hold).toBe("cap evidence unavailable");
  });
});
