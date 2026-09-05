import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural guard for the library entity (ME-10, docs/engineering/2026-09-03-multi-entity-design.md).
//
// The library is the workflow documentation site, the access-code-gated private
// document library and the publish/serve endpoints behind it. Its acceptance
// criteria are structural — every page renders the same HTML either way — so
// they are asserted here rather than left to review:
//
//   1. the entity has the index.ts / tables.ts surface every entity gets (design §2),
//      and tables.ts agrees with entities.manifest.json, which the ownership ratchet reads;
//   2. the access gate itself stays in kernel/identity: the library reaches it the
//      way every other caller does, and does not grow a private copy;
//   3. nothing in the entity imports route code from app/ (design §3 rule 3, also an
//      ESLint zone — repeated here so a `git mv` that outruns lint still fails);
//   4. every app/ file the manifest gives to library is a thin re-export, carrying
//      only Next route-segment config and the stylesheet order (design §2: "app/
//      thin: each file is `export { default } from '@/entities/x/routes/y'`");
//   5. the route-segment config is re-declared in app/ rather than re-exported,
//      because Next reads it by static analysis of the file under app/ and would
//      not see it through a re-export — a page that lost its `force-dynamic`
//      would be statically cached, which for the private library is the exact bug
//      the gate exists to prevent;
//   6. no old lib/ or components/ path exists any more: ME-13 deleted the shims
//      and every caller imports the entity's doors.

const ROOT = path.resolve(__dirname, "..", "..");
const ENTITY = path.join(ROOT, "entities", "library");

type Manifest = {
  entities: Record<string, { tables?: string[] }>;
};

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const library = manifest.entities.library;

/** Every file under `dir`, repo-relative, depth-first. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [path.relative(ROOT, dir)];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => filesUnder(path.join(dir, e.name)));
}

/** Repo-relative paths of the entity's .ts/.tsx sources, tests excluded. */
function entitySources(): string[] {
  return filesUnder(ENTITY).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
}

/** Module specifiers named by `import ... from "x"`, `export ... from "x"` or `import "x"`. */
function moduleSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("library entity surface", () => {
  it("has an index and a tables declaration", () => {
    expect(fs.existsSync(path.join(ENTITY, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ENTITY, "tables.ts"))).toBe(true);
  });

  it("declares exactly the tables the manifest gives it — none", async () => {
    const { LIBRARY_TABLES } = await import("./tables");
    expect([...LIBRARY_TABLES]).toEqual([]);
    expect([...LIBRARY_TABLES]).toEqual([...(library.tables ?? [])]);
  });
});

describe("library entity boundaries", () => {
  it("leaves the access gate in the kernel and only calls it", () => {
    // The two unlock actions and the three gate checks are the whole of the
    // library's auth, and all of it is kernel/identity/access-gate.ts. Moving a
    // copy in here would mean two answers to "is this visitor allowed", which is
    // the shape the gate was consolidated out of in the first place.
    expect(fs.existsSync(path.join(ROOT, "kernel", "identity", "access-gate.ts"))).toBe(true);
    const gateUsers = entitySources().filter((f) => /\baccess-gate\b/.test(read(f)));
    expect(gateUsers.length).toBeGreaterThan(0);
    for (const f of gateUsers) {
      for (const s of moduleSpecifiers(read(f))) {
        if (!/\baccess-gate\b/.test(s)) continue;
        expect(s, `${f} reaches the gate somewhere other than the kernel`).toBe("@/kernel/identity/access-gate");
      }
    }
  });

  it("imports no route code from app/", () => {
    // Stylesheets are the exception the design names: they stay in app/, and the
    // entity does not import them at all — the mounts do.
    const offenders = entitySources().filter((f) =>
      moduleSpecifiers(read(f)).some((s) => s.startsWith("@/app/") || s === "@/app"),
    );
    expect(offenders).toEqual([]);
  });

  it("gains no new cross-entity import", () => {
    // The library depends on the kernel and on nothing else: the workflow pages
    // are hand-written, the documents come from Storage or disk, and the gate is
    // kernel/identity. There is no allowed cross-entity edge to list, so any
    // specifier outside the entity and the kernel is a new one.
    const seen = new Set<string>();
    for (const f of entitySources()) {
      for (const s of moduleSpecifiers(read(f))) {
        if (!s.startsWith("@/")) continue;
        if (s.startsWith("@/entities/library") || s.startsWith("@/kernel")) continue;
        seen.add(s);
      }
    }
    expect([...seen].sort()).toEqual([]);
  });
});

describe("app/ mounts the library entity without holding its code", () => {
  // Since ME-13 the manifest lists no app/ paths (app/ is the composition root),
  // so the mounts are found by what they import: any app/ file that names one of
  // the library's routes/, api/ or crons/ bodies mounts it.
  const mountFiles = filesUnder(path.join(ROOT, "app"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$|__tests__/.test(f))
    .filter((f) => moduleSpecifiers(read(f)).some((s) => /^@\/entities\/library\/(routes|api|crons)\//.test(s)))
    .sort();

  it("finds the library's app/ files", () => {
    expect(mountFiles.length).toBeGreaterThan(40);
  });

  it.each(mountFiles)("%s only re-exports the entity", (rel) => {
    const source = read(rel);
    const foreign = moduleSpecifiers(source).filter(
      (s) =>
        !s.startsWith("@/entities/library") &&
        // Route stylesheets stay in app/: nothing outside app/ imports CSS in
        // this repo, and the cascade order of a route sheet against
        // app/styles/* is part of the rendered page.
        !s.endsWith(".css"),
    );
    expect(foreign, `${rel} still imports non-entity code`).toEqual([]);
    expect(/<[A-Za-z]/.test(source), `${rel} still holds JSX`).toBe(false);
  });

  // Next reads a segment's runtime config by static analysis of the file under
  // app/, so a re-exported `dynamic` is never seen and the route silently
  // becomes static. For the gated routes that is the bug the gate exists to
  // prevent, so the config is written as a literal in the mount — and only
  // there, because a second copy in the entity would look live while being
  // ignored. These seven are every route the library forces dynamic today; a
  // new one is a deliberate edit to this list.
  const SEGMENT = /^export const (dynamic|revalidate|fetchCache|runtime|maxDuration|preferredRegion|dynamicParams)\b/gm;

  const forcedDynamic = [
    "app/api/docs/publish/route.ts",
    "app/docs/[slug]/route.ts",
    "app/private/bstore/layout.tsx",
    "app/workflows/private/[...path]/route.ts",
    "app/workflows/private/e8/[slug]/route.ts",
    "app/workflows/private/e8/page.tsx",
    "app/workflows/private/layout.tsx",
  ];

  it("declares the route-segment config in exactly the mounts that need it", () => {
    const declaring = mountFiles.filter((rel) => {
      SEGMENT.lastIndex = 0;
      return SEGMENT.test(read(rel));
    });
    expect(declaring.sort()).toEqual([...forcedDynamic].sort());
  });

  it.each(forcedDynamic)("%s forces its segment dynamic", (rel) => {
    expect(/^export const dynamic = 'force-dynamic'$/m.test(read(rel))).toBe(true);
  });

  it("leaves no ignored copy of the config in the entity", () => {
    const offenders = entitySources().filter((f) => {
      SEGMENT.lastIndex = 0;
      return SEGMENT.test(read(f));
    });
    expect(offenders).toEqual([]);
  });
});

describe("no old path exists", () => {
  // ME-13 deleted every lib/ and components/ shim; callers import the entity's
  // doors or, inside the entity, the concrete file.
  it.each(["lib", "components"])("%s/ is gone", (dir) => {
    expect(fs.existsSync(path.join(ROOT, dir))).toBe(false);
  });
});
