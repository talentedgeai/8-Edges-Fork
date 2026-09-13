import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyCheckIn } from "./check-in-run";

// What the run owes the workflow once delivery can fail (2026-09-11): a roster
// only counts as posted when Lark says it took the message, an undelivered
// roster fails the whole run and names the variable to set, and a re-run after
// a half-delivered morning sends the missing roster and only that one — the
// chat that already has its check-in must not get a second copy.
//
// The Supabase fake follows entities/boards/lib/move-card.test.ts: `from(table)`
// hands back a chainable builder that resolves to the next scripted response
// for that table, so the production query shape can change freely.

type Scripted = { data?: unknown; error?: { message: string } | null };
const scripts = new Map<string, Scripted[]>();

function script(table: string, ...responses: Scripted[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

function builderFor(table: string) {
  const respond = () => {
    const next = (scripts.get(table) ?? []).shift();
    if (!next) throw new Error(`unscripted query against ${table}`);
    return { data: next.data ?? null, error: next.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "eq", "in", "gte", "lte", "order", "limit"]) {
    builder[op] = () => builder;
  }
  return builder;
}

const sent: string[] = [];
const accepts = { product: true, eo: true };

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
// The run reads time_off through the time-off entity's door, because the table
// is that entity's (design §4). Importing the door for real would pull its
// barrel — and, through the approver, the whole company-os barrel — into a unit
// test that needs one builder, so the door is faked onto the same fake client.
vi.mock("@/entities/time-off", () => ({
  selectTimeOff: (_columns: string) => builderFor("time_off"),
}));
vi.mock("@/kernel/messaging/lark", () => ({
  notifyProduct: vi.fn(async () => {
    sent.push("product");
    return accepts.product;
  }),
  notifyEo: vi.fn(async () => {
    sent.push("eo");
    return accepts.eo;
  }),
}));
vi.mock("@/entities/boards", async (original) => ({
  ...(await original<typeof import("@/entities/boards")>()),
  getWorkboard: vi.fn(async () => ({
    boards: [{ id: "board-1", name: "Workboard" }],
    lanes: [
      { id: "Doing", name: "Doing", isDone: false },
      { id: "Done", name: "Done", isDone: true },
    ],
    cards: [],
  })),
}));
// The door this file reaches for pulls the entity barrel, and through it a
// module built on unstable_cache at load and the kernel auth guards, whose
// session readers are wrapped in React's `cache` (which the React vitest
// resolves lacks); these keep both inert.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

// A Wednesday, 09:30 in Asia/Ho_Chi_Minh — the hour the cron fires.
const NOW = new Date("2026-09-09T02:30:00Z");

const DIRECTORY = [
  { id: "m1", person_id: "p1", full_name: "Alice", status: "active", department_name: "Product Development" },
  { id: "m2", person_id: "p2", full_name: "Bo", status: "active", department_name: "EO" },
];

/** Script one run: the roster keys already delivered today, then the reads. */
function scriptRun(postedAlready: string[][]) {
  script("routine_runs", { data: postedAlready.map((posted) => ({ result: { posted } })) });
  script("team_directory", { data: DIRECTORY });
  script("time_off", { data: [] });
}

beforeEach(() => {
  scripts.clear();
  sent.length = 0;
  accepts.product = true;
  accepts.eo = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("runDailyCheckIn", () => {
  it("posts every roster and reports them when Lark accepts both", async () => {
    scriptRun([]);
    const result = await runDailyCheckIn(NOW);
    expect(sent).toEqual(["product", "eo"]);
    expect(result).toMatchObject({ date: "2026-09-09", posted: ["product", "eo"] });
    expect(result).not.toHaveProperty("error");
  });

  it("fails the run naming the roster and its variable when Lark refuses", async () => {
    accepts.eo = false;
    scriptRun([]);
    const result = await runDailyCheckIn(NOW);
    expect(result).toMatchObject({ date: "2026-09-09", posted: ["product"] });
    expect((result as { error: string }).error).toContain("EO");
    expect((result as { error: string }).error).toContain("LARK_EO_WEBHOOK_URL");
  });

  it("sends only the missing roster when re-run after a half-delivered morning", async () => {
    scriptRun([["product"]]);
    const result = await runDailyCheckIn(NOW);
    expect(sent).toEqual(["eo"]);
    expect(result).toMatchObject({ posted: ["eo"] });
  });

  it("sends nothing once every roster has been delivered today", async () => {
    scriptRun([["product"], ["eo"]]);
    const result = await runDailyCheckIn(NOW);
    expect(sent).toEqual([]);
    expect(result).toMatchObject({ date: "2026-09-09", skipped: "already posted today" });
  });

  it("sends nothing at the weekend", async () => {
    const result = await runDailyCheckIn(new Date("2026-09-12T02:30:00Z"));
    expect(sent).toEqual([]);
    expect(result).toMatchObject({ skipped: "weekend" });
  });
});
