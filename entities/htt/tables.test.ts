// ME-04 — the htt entity's table declaration must not drift from the manifest.
//
// `entities.manifest.json` is what the two ratchets read
// (scripts/check-table-ownership.mjs resolves every `.from("...")` through it),
// so the manifest is the source of truth and `tables.ts` is the copy entity code
// can import. A table added to one and not the other is exactly the drift this
// test exists to catch: the gate would keep passing while the entity's own
// declaration quietly lied.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HTT_TABLES } from "./tables";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(path.join(root, "entities.manifest.json"), "utf8"));

describe("entities/htt/tables", () => {
  it("declares exactly the tables the manifest gives htt", () => {
    expect([...HTT_TABLES].sort()).toEqual([...manifest.entities.htt.tables].sort());
  });

  it("names the ten tables the design doc assigns to the tracker", () => {
    // Spelled out rather than derived from the manifest, so an edit that drops a
    // table fails here instead of quietly agreeing with itself.
    expect([...HTT_TABLES].sort()).toEqual([
      "client_identities",
      "company_github_orgs",
      "man_hour_entries",
      "project_goals",
      "project_summaries",
      "pull_requests",
      "repos",
      "sync_runs",
      "token_allocations",
      "token_entries",
    ]);
  });
});
