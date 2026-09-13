// A deliberately minimal fake of the company_os client for the board move
// tests. Each `from(table)` call hands back a chainable builder that, when
// awaited, resolves to the next scripted `{ data, error }` for that table, in
// call order. Filter and modifier methods are no-ops that return the builder,
// so the production query shape can change without breaking the fixtures; the
// write verbs keep their row so a test can assert WHAT was written, not only
// that a write happened. Three suites share it (land-card, move-card,
// move-to-board); each still declares its own `vi.mock` calls, which vitest
// hoists per file.

export type Scripted = { data?: unknown; error?: { message: string } | null };
export type Call = { table: string; ops: string[]; payloads: unknown[]; filters: [string, ...unknown[]][] };

const scripts = new Map<string, Scripted[]>();
export const calls: Call[] = [];

export function script(table: string, ...responses: Scripted[]) {
  scripts.set(table, [...(scripts.get(table) ?? []), ...responses]);
}

export function resetFake() {
  scripts.clear();
  calls.length = 0;
}

export const opsFor = (table: string) => calls.filter((c) => c.table === table).map((c) => c.ops);

export function builderFor(table: string) {
  const record: Call = { table, ops: [], payloads: [], filters: [] };
  calls.push(record);
  const respond = () => {
    const queue = scripts.get(table) ?? [];
    const next = queue.shift();
    if (!next) throw new Error(`unscripted query against ${table}`);
    return { data: next.data ?? null, error: next.error ?? null };
  };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(respond).then(resolve, reject),
  };
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "order", "limit", "single", "maybeSingle"]) {
    builder[op] = (...args: unknown[]) => {
      record.ops.push(op);
      if (op === "update" || op === "insert" || op === "upsert") record.payloads.push(args[0]);
      // The filters keep their arguments too, so a dropped `.eq("id", …)` is
      // a failing test and not a silently widened write (verifier on A.1).
      if (op === "eq" || op === "neq" || op === "is" || op === "in") record.filters.push([op, ...args]);
      return builder;
    };
  }
  return builder;
}

// The module shape `vi.mock("@/kernel/data/supabase", fakeSupabase)` wants.
// endPosition asks the database for an atomic append first; here the function
// "does not exist", which exercises the read-top-plus-one fallback.
export const fakeSupabase = () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  companyOsUntyped: { rpc: async () => ({ data: null, error: { message: "function append_task_position does not exist" } }) },
});
