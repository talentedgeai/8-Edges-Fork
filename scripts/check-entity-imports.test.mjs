// Exercises scripts/check-entity-imports.mjs against throwaway fixture trees,
// each with its own entities.manifest.json, so the assertions hold however the
// real repo's counts move. The real repo is checked by the gate itself.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkEntityImports,
  collectEdges,
  importSpecifiers,
  measure,
  resolveSpecifier,
  writeBaseline,
} from "./check-entity-imports.mjs";

const MANIFEST = {
  kernel: { target: "kernel", current: ["lib/env"] },
  entities: {
    site: { target: "entities/site", current: ["app/about", "lib/blog"] },
    team: { target: "entities/team", current: ["app/team", "lib/team"] },
  },
};

const tmpDirs = [];
function fixture(files, manifest = MANIFEST) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "entity-imports-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest));
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("importSpecifiers", () => {
  it("finds static, dynamic, bare and re-export specifiers", () => {
    const src = `import a from "@/lib/a";
export { b } from './b';
const c = await import("../c");
import "@/styles.css";
const d = require("@/lib/d");
`;
    expect(importSpecifiers(src).sort()).toEqual(["../c", "./b", "@/lib/a", "@/lib/d", "@/styles.css"]);
  });
});

describe("importSpecifiers ignores comments", () => {
  it("does not see a commented-out or documented import", () => {
    const src = `// import old from "@/lib/old";\n/* import { x } from "@/lib/x"; */\nimport a from "@/lib/a"; // see "@/lib/b"\n`;
    expect(importSpecifiers(src)).toEqual(["@/lib/a"]);
  });
});

describe("resolveSpecifier", () => {
  it("maps the @/ alias to the repo root and strips extension and /index", () => {
    expect(resolveSpecifier("@/lib/team/data.ts", "app/x.ts")).toBe("lib/team/data");
    expect(resolveSpecifier("@/lib/team/index", "app/x.ts")).toBe("lib/team");
  });
  it("resolves relative specifiers against the importer", () => {
    expect(resolveSpecifier("../lib/blog", "app/about/page.tsx")).toBe("app/lib/blog");
    expect(resolveSpecifier("./data", "lib/team/index.ts")).toBe("lib/team/data");
  });
  it("ignores packages", () => {
    expect(resolveSpecifier("react", "app/x.ts")).toBeNull();
    expect(resolveSpecifier("@supabase/ssr", "app/x.ts")).toBeNull();
  });
});

describe("collectEdges and measure", () => {
  it("counts only cross-entity, non-kernel, non-index imports", () => {
    const root = fixture({
      "app/team/page.tsx": `import "@/lib/team/data";
import "@/lib/blog";
import "@/lib/env";
import "@/entities/site/index";
import "@/entities/site/internal";
`,
      "lib/team/data.ts": `import "./helpers";\nimport "@/lib/blog/posts";\n`,
      "lib/team/helpers.ts": "",
      "lib/blog/posts.ts": "",
    });
    const edges = collectEdges(root);
    expect(edges.map((e) => `${e.importer}->${e.target}`).sort()).toEqual([
      "app/team/page.tsx->entities/site/internal",
      "app/team/page.tsx->lib/blog",
      "lib/team/data.ts->lib/blog/posts",
    ]);
    expect(measure(root)).toEqual({ "team->site": 3 });
  });

  it("skips test files, which import across seams on purpose", () => {
    const root = fixture({ "lib/team/data.test.ts": 'import "@/lib/blog";\n', "app/__tests__/x.ts": 'import "@/lib/blog";\n', "lib/blog/index.ts": "" });
    expect(measure(root)).toEqual({});
  });

  it("attributes unclaimed files so a manifest gap is visible", () => {
    const root = fixture({ "lib/mystery.ts": 'import "@/lib/team/data";\n', "lib/team/data.ts": "" });
    expect(measure(root)).toEqual({ "unassigned->team": 1 });
  });
});

describe("the ratchet", () => {
  const TREE = { "lib/team/data.ts": 'import "@/lib/blog";\nimport "@/lib/blog/x";\n', "lib/blog/x.ts": "" };

  it("fails without a baseline, passes once written, fails when a pair grows", () => {
    const root = fixture(TREE);
    expect(checkEntityImports(root).violations[0]).toMatch(/missing/);
    expect(writeBaseline(root).written).toBe(true);
    expect(checkEntityImports(root).violations).toEqual([]);
    fs.writeFileSync(path.join(root, "lib/team/more.ts"), 'import "@/lib/blog/x";\n');
    const { violations } = checkEntityImports(root);
    expect(violations).toEqual(["team->site: 3 cross-entity import(s), baseline allows 2"]);
  });

  it("treats a pair absent from the baseline as zero", () => {
    const root = fixture(TREE);
    writeBaseline(root);
    fs.writeFileSync(path.join(root, "lib/blog/y.ts"), 'import "@/lib/team/data";\n');
    expect(checkEntityImports(root).violations).toEqual(["site->team: 1 cross-entity import(s), baseline allows 0"]);
  });

  it("refuses to write a baseline that would raise a pair", () => {
    const root = fixture(TREE);
    writeBaseline(root);
    fs.writeFileSync(path.join(root, "lib/team/more.ts"), 'import "@/lib/blog/x";\n');
    const res = writeBaseline(root);
    expect(res.written).toBe(false);
    expect(res.increases).toHaveLength(1);
  });
});
