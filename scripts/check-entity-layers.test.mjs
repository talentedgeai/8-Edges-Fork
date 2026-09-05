// Exercises scripts/check-entity-layers.mjs against throwaway fixture trees,
// each with its own entities.manifest.json, so the assertions hold however the
// real repo moves. The real repo is checked by the gate itself (and by the
// smoke test at the bottom, which only asks that the walk is not vacuous).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkEntityLayers, layersOf, valueSpecifiers, walkEntity } from "./check-entity-layers.mjs";
import { loadManifest } from "./entity-manifest.mjs";

const MANIFEST = {
  kernel: { target: "kernel", current: ["kernel"] },
  entities: {
    site: { target: "entities/site", layer: 1, current: ["entities/site"] },
    "company-os": { target: "entities/company-os", layer: 2, current: ["entities/company-os"] },
    team: { target: "entities/team", layer: 3, current: ["entities/team"] },
  },
};

const tmpDirs = [];
function fixture(files, manifest = MANIFEST) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "entity-layers-"));
  tmpDirs.push(root);
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

const DOORS = {
  "entities/site/index.ts": "export const a = 1;\n",
  "entities/site/client.ts": "export const b = 1;\n",
  "entities/company-os/index.ts": 'export * from "./lib/x";\n',
  "entities/company-os/client.ts": "export const c = 1;\n",
  "entities/team/index.ts": 'export * from "./lib/y";\n',
  "entities/team/client.ts": "export const d = 1;\n",
};

describe("valueSpecifiers", () => {
  it("drops type-only imports, which the compiler erases", () => {
    const src = `import type { A } from "@/entities/team";
import { type B } from "@/entities/team/client";
export type { C } from "@/entities/site";
import { f, type G } from "@/entities/site";
`;
    expect(valueSpecifiers(src)).toEqual(["@/entities/site"]);
  });
});

describe("layersOf", () => {
  it("requires an integer layer of at least 1 on every entity", () => {
    expect(() => layersOf({ entities: { site: { target: "entities/site" } } })).toThrow(/layer/);
    expect(() => layersOf({ entities: { site: { target: "entities/site", layer: 0 } } })).toThrow(/layer/);
    expect(layersOf(MANIFEST)).toEqual({ site: 1, "company-os": 2, team: 3 });
  });
});

describe("checkEntityLayers", () => {
  it("passes when every door graph imports only lower layers", () => {
    const root = fixture({
      ...DOORS,
      "entities/company-os/lib/x.ts": 'import { a } from "@/entities/site";\nexport const x = a;\n',
      "entities/team/lib/y.ts": 'import { x } from "@/entities/company-os";\nimport { b } from "@/entities/site/client";\nexport const y = x + b;\n',
    });
    expect(checkEntityLayers(root, loadManifest(root)).violations).toEqual([]);
  });

  it("fails a door-graph import of a higher layer, with the chain from the door", () => {
    const root = fixture({
      ...DOORS,
      "entities/company-os/lib/x.ts": 'import { helper } from "./deeper";\nexport const x = helper;\n',
      "entities/company-os/lib/deeper.ts": 'import { y } from "@/entities/team";\nexport const helper = y;\n',
      "entities/team/lib/y.ts": "export const y = 1;\n",
    });
    const { violations } = checkEntityLayers(root, loadManifest(root));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      importer: "entities/company-os/lib/deeper.ts",
      target: "entities/team/index.ts",
      from: "company-os",
      to: "team",
      chain: ["entities/company-os/index.ts", "entities/company-os/lib/x.ts", "entities/company-os/lib/deeper.ts"],
    });
  });

  it("fails a same-layer door import and a client-door import alike", () => {
    const manifest = {
      ...MANIFEST,
      entities: { ...MANIFEST.entities, library: { target: "entities/library", layer: 1, current: ["entities/library"] } },
    };
    const root = fixture(
      {
        ...DOORS,
        "entities/library/index.ts": "export const l = 1;\n",
        "entities/library/client.ts": "export const lc = 1;\n",
        "entities/site/index.ts": 'import { l } from "@/entities/library";\nexport const a = l;\n',
        "entities/site/client.ts": 'import { lc } from "@/entities/library/client";\nexport const b = lc;\n',
        "entities/company-os/lib/x.ts": "export const x = 1;\n",
        "entities/team/lib/y.ts": "export const y = 1;\n",
      },
      manifest,
    );
    const pairs = checkEntityLayers(root, loadManifest(root)).violations.map((v) => `${v.importer}->${v.target}`);
    expect(pairs).toEqual([
      "entities/site/client.ts->entities/library/client.ts",
      "entities/site/index.ts->entities/library/index.ts",
    ]);
  });

  it("exempts routes, api and crons unless a door reaches them", () => {
    const root = fixture({
      ...DOORS,
      "entities/company-os/lib/x.ts": "export const x = 1;\n",
      "entities/company-os/routes/page.tsx": 'import { y } from "@/entities/team";\nexport default function P() { return y; }\n',
      "entities/company-os/api/r/route.ts": 'import { y } from "@/entities/team";\nexport const GET = () => y;\n',
      "entities/company-os/crons/c.ts": 'import { y } from "@/entities/team";\nexport const run = () => y;\n',
      "entities/team/lib/y.ts": "export const y = 1;\n",
    });
    expect(checkEntityLayers(root, loadManifest(root)).violations).toEqual([]);

    const reached = fixture({
      ...DOORS,
      "entities/company-os/lib/x.ts": 'export { action } from "../routes/actions";\n',
      "entities/company-os/routes/actions.ts": 'import { y } from "@/entities/team";\nexport const action = () => y;\n',
      "entities/team/lib/y.ts": "export const y = 1;\n",
    });
    const { violations } = checkEntityLayers(reached, loadManifest(reached));
    expect(violations.map((v) => v.importer)).toEqual(["entities/company-os/routes/actions.ts"]);
  });

  it("ignores type-only imports and stops at another entity's door", () => {
    const root = fixture({
      ...DOORS,
      // A type from a higher layer is erased; a lower door that itself reaches
      // upward is that entity's violation, reported once, not the importer's.
      "entities/company-os/lib/x.ts": 'import type { Y } from "@/entities/team";\nexport const x: Y | null = null;\n',
      "entities/site/index.ts": 'import { y } from "@/entities/team";\nexport const a = y;\n',
      "entities/team/lib/y.ts": 'import { a } from "@/entities/site";\nexport const y = a;\n',
    });
    const { violations } = checkEntityLayers(root, loadManifest(root));
    expect(violations.map((v) => `${v.from}->${v.to}`)).toEqual(["site->team"]);
  });

  it("does not report a non-door cross-entity import (check-entity-imports owns that)", () => {
    const root = fixture({
      ...DOORS,
      "entities/company-os/lib/x.ts": 'import { y } from "@/entities/team/lib/y";\nexport const x = y;\n',
      "entities/team/lib/y.ts": "export const y = 1;\n",
    });
    expect(checkEntityLayers(root, loadManifest(root)).violations).toEqual([]);
  });
});

describe("the real tree", () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  it("walks past every door (the check is not vacuous)", () => {
    const manifest = loadManifest(ROOT);
    for (const name of Object.keys(manifest.entities)) {
      const { visited } = walkEntity(ROOT, name, manifest);
      expect(visited.size, `${name}'s door graph`).toBeGreaterThan(2);
    }
  });
});
