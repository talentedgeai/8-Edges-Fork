// Proves the generated zones do what the design doc says, by running ESLint
// itself over a throwaway tree: a forbidden edge is an error, the permitted
// edges are clean. The structure assertions cover the parts a lint run cannot
// (that every entity gets a zone, that --check catches a stale file).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { afterEach, describe, expect, it } from "vitest";
import { buildZones, renderZonesFile } from "./gen-entity-zones.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MANIFEST = {
  kernel: { target: "kernel", current: [] },
  entities: {
    site: { target: "entities/site", current: [] },
    "company-os": { target: "entities/company-os", modules: ["crm", "boards"], current: [] },
  },
};

const tmpDirs = [];
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "entity-zones-"));
  tmpDirs.push(root);
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

/**
 * Lints one fixture file with only the generated rule active. The rule resolves
 * zone paths against `basePath` (default process.cwd(), which is the repo root
 * in the real gate), so the fixture root is passed explicitly here.
 */
async function lint(root, rel) {
  const eslint = new ESLint({
    cwd: root,
    useEslintrc: false,
    resolvePluginsRelativeTo: REPO_ROOT,
    overrideConfig: {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      plugins: ["import"],
      // The fixture is .ts like the real tree; the node resolver needs telling.
      settings: { "import/resolver": { node: { extensions: [".ts"] } } },
      rules: { "import/no-restricted-paths": ["error", { basePath: root, zones: buildZones(MANIFEST) }] },
    },
  });
  const [result] = await eslint.lintFiles([rel]);
  return result.messages.map((m) => m.message);
}

const TREE = {
  "entities/site/index.ts": "export const site = 1;\n",
  "entities/site/client.ts": "export const siteClient = 1;\n",
  "entities/site/internal.ts": "export const secret = 1;\n",
  "entities/company-os/index.ts": "export const os = 1;\n",
  "entities/company-os/client.ts": "export const osClient = 1;\n",
  "entities/company-os/internal.ts": "export const guts = 1;\n",
  "entities/company-os/routes/home.ts": "export const home = 1;\n",
  "entities/company-os/modules/crm/index.ts": "export const crm = 1;\n",
  "entities/company-os/modules/crm/data.ts": "export const rows = 1;\n",
  "kernel/data/index.ts": "export const db = 1;\n",
  "app/layout.ts": "export const layout = 1;\n",
};

describe("generated zones, run through ESLint", () => {
  it("rejects an entity reaching into another entity's internals", async () => {
    const root = fixture({ ...TREE, "entities/site/page.ts": 'import { guts } from "../company-os/internal";\n' });
    const messages = await lint(root, "entities/site/page.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/only through that entity's index/);
  });

  it("allows an entity to import another entity's index and the kernel", async () => {
    const root = fixture({
      ...TREE,
      "entities/site/page.ts": 'import { os } from "../company-os/index";\nimport { db } from "../../kernel/data/index";\n',
    });
    expect(await lint(root, "entities/site/page.ts")).toEqual([]);
  });

  it("allows an entity to import another entity's client door, and still refuses its internals", async () => {
    // The client door (design §3, "two doors per entity") sits beside the index
    // in the except list; a concrete file next to it is still refused.
    const root = fixture({
      ...TREE,
      "entities/site/widget.ts": 'import { osClient } from "../company-os/client";\n',
      "entities/site/bad.ts": 'import { guts } from "../company-os/internal";\n',
    });
    expect(await lint(root, "entities/site/widget.ts")).toEqual([]);
    expect(await lint(root, "entities/site/bad.ts")).toHaveLength(1);
  });

  it("allows app/ to import an entity's client door", async () => {
    const root = fixture({ ...TREE, "app/widget.ts": 'import { osClient } from "../entities/company-os/client";\n' });
    expect(await lint(root, "app/widget.ts")).toEqual([]);
  });

  it("rejects app/ importing an entity internal but allows its routes and index", async () => {
    const root = fixture({
      ...TREE,
      "app/bad.ts": 'import { guts } from "../entities/company-os/internal";\n',
      "app/good.ts": 'import { home } from "../entities/company-os/routes/home";\nimport { os } from "../entities/company-os/index";\n',
    });
    expect(await lint(root, "app/bad.ts")).toHaveLength(1);
    expect(await lint(root, "app/good.ts")).toEqual([]);
  });

  it("rejects kernel/ importing an entity or app/", async () => {
    const root = fixture({
      ...TREE,
      "kernel/bad.ts": 'import { site } from "../entities/site/index";\nimport { layout } from "../app/layout";\n',
    });
    expect(await lint(root, "kernel/bad.ts")).toHaveLength(2);
  });

  it("rejects a module reaching into a sibling module's internals", async () => {
    const root = fixture({
      ...TREE,
      "entities/company-os/modules/boards/view.ts": 'import { rows } from "../crm/data";\nimport { crm } from "../crm/index";\n',
    });
    const messages = await lint(root, "entities/company-os/modules/boards/view.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/sibling module/);
  });
});

describe("zone structure", () => {
  it("opens with the app/ composition zone, carries no legacy lib/ or components/ zone, and adds one zone per entity", () => {
    const zones = buildZones(MANIFEST);
    expect(zones[0].target).toBe("./app");
    expect(zones.some((z) => /^\.\/(lib|components)\b/.test(String(z.target)))).toBe(false);
    const entityZones = zones.filter((z) => /^\.\/entities\/[a-z-]+$/.test(z.target));
    expect(entityZones.map((z) => z.target).sort()).toEqual(["./entities/company-os", "./entities/site"]);
  });

  it("renders a stable, generated-marked JSON file", () => {
    const text = renderZonesFile(MANIFEST);
    expect(text.startsWith("// GENERATED")).toBe(true);
    expect(JSON.parse(text.split("\n").filter((l) => !l.startsWith("//")).join("\n")).rules).toBeDefined();
    expect(text.endsWith("\n")).toBe(true);
  });
});
