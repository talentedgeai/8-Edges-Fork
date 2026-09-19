import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scan, compare } from "./check-read-errors.mjs";

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "read-errors-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

describe("scan", () => {
  it("flags a read that never binds error", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const { data } = await companyOs.from("t").select("id");\n`,
    });
    expect(scan(root).unbound).toHaveLength(1);
  });

  it("flags a door-helper read too — the helper's name has no dot before `select`", () => {
    // This is the shape isHiringManager had, and the shape an earlier grep missed.
    const root = tree({
      "entities/x/lib/a.ts": `const { count } = await selectJobRequisitions("id", { count: "exact", head: true })\n  .eq("hiring_manager_id", id);\n`,
    });
    expect(scan(root).unbound).toHaveLength(1);
  });

  it("accepts a read that acts on its error", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const { data, error } = await companyOs.from("t").select("id");\nif (error) return { ok: false, error: error.message };\n`,
    });
    const found = scan(root);
    expect(found.unbound).toHaveLength(0);
    expect(found.loggedOnly).toHaveLength(0);
  });

  it("counts a read whose error is only logged as logged-only, not unbound", () => {
    const root = tree({
      "entities/x/lib/a.ts": `const { data, error: aError } = await companyOs.from("t").select("id");\nif (aError) console.error("[x] t", aError);\nreturn (data ?? []);\n`,
    });
    const found = scan(root);
    expect(found.unbound).toHaveLength(0);
    expect(found.loggedOnly).toHaveLength(1);
  });

  it("ignores tests, generated types and fakes", () => {
    const root = tree({
      "entities/x/lib/a.test.ts": `const { data } = await companyOs.from("t").select("id");\n`,
      "entities/x/lib/testing/fake.ts": `const { data } = await companyOs.from("t").select("id");\n`,
      "kernel/data/supabase/database.types.ts": `const { data } = await companyOs.from("t").select("id");\n`,
    });
    expect(scan(root).unbound).toHaveLength(0);
  });

  it("does not treat a non-database await as a read", () => {
    const root = tree({ "entities/x/lib/a.ts": `const { data } = await fetchSomething();\n` });
    expect(scan(root).unbound).toHaveLength(0);
  });
});

describe("compare", () => {
  const found = (unbound, loggedOnly) => ({
    unbound: unbound.map((file, i) => ({ file, line: i + 1, text: "..." })),
    loggedOnly: Array.from({ length: loggedOnly }, () => ({ file: "f", line: 1 })),
  });

  it("fails an unbound read that is not allowlisted", () => {
    const { errors } = compare(found(["entities/x/lib/a.ts"], 0), { loggedOnly: 0 }, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("without binding `error`");
  });

  it("accepts an unbound read that is allowlisted with a reason", () => {
    const allow = { "entities/x/lib/a.ts": ["deliberate: costs the greeting, never the send"] };
    expect(compare(found(["entities/x/lib/a.ts"], 0), { loggedOnly: 0 }, allow).errors).toHaveLength(0);
  });

  it("fails when logged-only reads grow past the baseline", () => {
    const { errors } = compare(found([], 6), { loggedOnly: 5 }, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("above the baseline of 5");
  });

  it("accepts the baseline shrinking", () => {
    expect(compare(found([], 3), { loggedOnly: 5 }, {}).errors).toHaveLength(0);
  });
});
