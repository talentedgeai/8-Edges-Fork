import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What these pin down is the contract the ADR promises, because every one of
// them is a way an optional entity could otherwise break a required one: a
// handler that throws must not reach the publisher, a bad payload must fail at
// the publisher rather than in a subscriber, and a deployment with no
// subscriber must be indistinguishable from one whose subscriber did nothing.
const audits: { actor: string; newData: unknown }[] = [];
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: vi.fn(async (input: { actor: string; newData: unknown }) => {
    audits.push({ actor: input.actor, newData: input.newData });
  }),
}));

import { publish, subscribe, subscribersOf, resetSubscribers } from "./bus";

beforeEach(() => {
  resetSubscribers();
  audits.length = 0;
});
afterEach(() => vi.clearAllMocks());

const PAYLOAD = { taskId: "t1", boardSlug: "b", subjectType: "coaching_commitment", subjectId: "c1" };

describe("the event bus", () => {
  it("publishes to nobody without complaint", async () => {
    await expect(publish("board.card.completed", PAYLOAD)).resolves.toBeUndefined();
    expect(subscribersOf("board.card.completed")).toEqual([]);
  });

  it("awaits each handler, so an effect lands before the request returns", async () => {
    const order: string[] = [];
    subscribe("a", "board.card.completed", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("a");
    });
    subscribe("b", "board.card.completed", () => {
      order.push("b");
    });
    await publish("board.card.completed", PAYLOAD);
    expect(order).toEqual(["a", "b"]);
  });

  it("hands the handler the validated payload", async () => {
    const seen: unknown[] = [];
    subscribe("a", "board.card.completed", (p) => {
      seen.push(p);
    });
    await publish("board.card.completed", PAYLOAD);
    expect(seen).toEqual([PAYLOAD]);
  });

  it("never lets a failing handler reach the publisher, and audits the drop", async () => {
    subscribe("coaching", "board.card.completed", () => {
      throw new Error("commitment locked");
    });
    const after: string[] = [];
    subscribe("other", "board.card.completed", () => {
      after.push("ran");
    });
    await expect(publish("board.card.completed", PAYLOAD)).resolves.toBeUndefined();
    // The later subscriber still runs: one optional entity must not silence another.
    expect(after).toEqual(["ran"]);
    expect(audits).toHaveLength(1);
    expect(audits[0].actor).toBe("kernel/events:coaching");
    expect(JSON.stringify(audits[0].newData)).toContain("commitment locked");
  });

  it("rejects a malformed payload at the publisher, before any handler runs", async () => {
    const ran: string[] = [];
    subscribe("a", "board.card.completed", () => {
      ran.push("no");
    });
    // An empty taskId satisfies the type and fails the schema, which is the
    // case worth pinning: types cannot catch a publisher passing "".
    await expect(
      publish("board.card.completed", { taskId: "", boardSlug: "b", subjectType: null, subjectId: null }),
    ).rejects.toThrow(/invalid payload/);
    expect(ran).toEqual([]);
  });

  it("accepts a card with no subject, which is most of them", async () => {
    const seen: unknown[] = [];
    subscribe("a", "board.card.completed", (p) => {
      seen.push(p.subjectId);
    });
    await publish("board.card.completed", { taskId: "t1", boardSlug: "b", subjectType: null, subjectId: null });
    expect(seen).toEqual([null]);
  });
});
