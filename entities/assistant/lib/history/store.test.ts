import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// renameConversation and archiveConversation are owner-scoped updates whose
// boolean is what the UI shows the user. Before AR-xx they returned true
// whenever the statement itself did not error, so an update that matched no row
// (a wrong id, another user's conversation, an already-archived one) read as
// success. These tests pin the current contract: true only when a row changed.
//
// The fake Supabase client is the house one (see
// entities/portal/lib/work-request-lifecycle.test.ts): `companyOs.from(table)`
// returns a chainable builder resolving to the next scripted response.

type Response = { data?: unknown; error?: { message: string } | null };
const scripts: Response[] = [];
const calls: { ops: string[] }[] = [];

function builderFor() {
  const record = { ops: [] as string[] };
  calls.push(record);
  const respond = () => {
    const next = scripts.shift();
    return { data: next?.data ?? null, error: next?.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "update", "eq", "is"]) {
    builder[op] = () => {
      record.ops.push(op);
      return builder;
    };
  }
  return builder;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: () => builderFor() },
}));

import { archiveConversation, renameConversation } from "./store";

const scope = { id: "c1", surface: "admin" as const, authUserId: "auth-1" };

beforeEach(() => {
  scripts.length = 0;
  calls.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("renameConversation", () => {
  it("is true when the update changed a row", async () => {
    scripts.push({ data: [{ id: "c1" }] });
    expect(await renameConversation({ ...scope, title: "New" })).toBe(true);
  });

  it("is false when the owner scope matched nothing", async () => {
    scripts.push({ data: [] });
    expect(await renameConversation({ ...scope, title: "New" })).toBe(false);
  });

  it("is false on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    scripts.push({ error: { message: "boom" } });
    expect(await renameConversation({ ...scope, title: "New" })).toBe(false);
  });

  it("asks for the changed ids back so a no-op is visible", async () => {
    scripts.push({ data: [{ id: "c1" }] });
    await renameConversation({ ...scope, title: "New" });
    expect(calls[0].ops).toContain("select");
  });
});

describe("archiveConversation", () => {
  it("is true when the update changed a row", async () => {
    scripts.push({ data: [{ id: "c1" }] });
    expect(await archiveConversation(scope)).toBe(true);
  });

  it("is false when the conversation was already archived or not the caller's", async () => {
    scripts.push({ data: [] });
    expect(await archiveConversation(scope)).toBe(false);
  });

  it("is false on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    scripts.push({ error: { message: "boom" } });
    expect(await archiveConversation(scope)).toBe(false);
  });
});
