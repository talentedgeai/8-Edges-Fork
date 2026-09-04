// Exercises scripts/entity-manifest.mjs against a small in-memory manifest,
// plus one check that the real manifest loads and covers the tree's top-level
// source directories without leaving stray files unassigned outside app/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APP_ROOT,
  KERNEL,
  UNASSIGNED,
  entityOf,
  entryMatches,
  loadManifest,
  validateManifest,
} from "./entity-manifest.mjs";

const SMALL = {
  kernel: { target: "kernel", current: ["lib/env", "lib/admin/format", "components/admin/Badge"] },
  entities: {
    site: { target: "entities/site", current: ["app/page.tsx", "app/about", "lib/blog"] },
    "company-os": { target: "entities/company-os", modules: ["crm"], current: ["app/admin", "lib/admin"] },
  },
};

describe("entryMatches", () => {
  it("matches a directory entry for everything beneath it", () => {
    expect(entryMatches("app/about", "app/about/page.tsx")).toBe(true);
    expect(entryMatches("app/about", "app/about-us/page.tsx")).toBe(false);
  });
  it("matches a stem entry for its extension siblings", () => {
    expect(entryMatches("lib/env", "lib/env.ts")).toBe(true);
    expect(entryMatches("lib/env", "lib/env.test.ts")).toBe(true);
    expect(entryMatches("lib/env", "lib/environment.ts")).toBe(false);
  });
  it("matches a file entry exactly only", () => {
    expect(entryMatches("app/page.tsx", "app/page.tsx")).toBe(true);
    expect(entryMatches("app/page.tsx", "app/page.tsx.bak")).toBe(false);
  });
});

describe("entityOf", () => {
  it("resolves by longest prefix so a kernel file inside an entity directory wins", () => {
    expect(entityOf("lib/admin/format.ts", SMALL)).toBe(KERNEL);
    expect(entityOf("lib/admin/contacts.ts", SMALL)).toBe("company-os");
    expect(entityOf("components/admin/Badge.tsx", SMALL)).toBe(KERNEL);
  });
  it("resolves target paths before any move happens", () => {
    expect(entityOf("entities/site/index.ts", SMALL)).toBe("site");
    expect(entityOf("kernel/data/supabase.ts", SMALL)).toBe(KERNEL);
  });
  it("gives unclaimed app files to the composition root and everything else to unassigned", () => {
    expect(entityOf("app/layout.tsx", SMALL)).toBe(APP_ROOT);
    expect(entityOf("lib/mystery.ts", SMALL)).toBe(UNASSIGNED);
  });
});

describe("validateManifest", () => {
  it("rejects a path claimed by two owners", () => {
    const bad = { kernel: { target: "kernel", current: ["lib/x"] }, entities: { a: { target: "entities/a", current: ["lib/x"] } } };
    expect(() => validateManifest(bad)).toThrow(/claimed by both/);
  });
  it("rejects an entity without a target", () => {
    expect(() => validateManifest({ kernel: { target: "kernel" }, entities: { a: {} } })).toThrow(/target/);
  });
});

describe("the real manifest", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = loadManifest(root);

  it("names the nine entities from the design doc", () => {
    expect(Object.keys(manifest.entities).sort()).toEqual(
      ["assistant", "billing", "company-os", "htt", "library", "portal", "retreats", "site", "team"],
    );
  });

  it("leaves no source file under lib/ or components/ unassigned", () => {
    const unassigned = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && entityOf(rel, manifest) === UNASSIGNED) unassigned.push(rel);
      }
    };
    walk("lib");
    walk("components");
    expect(unassigned).toEqual([]);
  });

  it("claims every top-level route directory under app/ except the composition-root files", () => {
    const unclaimed = fs
      .readdirSync(path.join(root, "app"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !["api", "__tests__"].includes(e.name))
      .map((e) => `app/${e.name}`)
      .filter((rel) => entityOf(`${rel}/page.tsx`, manifest) === APP_ROOT);
    expect(unclaimed).toEqual([]);
  });
});
