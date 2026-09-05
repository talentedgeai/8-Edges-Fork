// ME-11 — the team entity's shape, asserted against the manifest and the tree.
//
// A move ticket has no new behaviour to test, so what is worth pinning is the
// shape the move is supposed to produce: the entity owns the tables the manifest
// gives it, the four AR modules each have a door, no old lib/ or components/
// path exists (ME-13 deleted the shims), every team route in app/ is a
// thin delegation, segment config stays in the app file (Next reads
// `dynamic`/`runtime` only from the route file's own `export const`
// declarations, never through a re-export — see checkExports in
// next/dist/build/analysis/get-page-static-info.js), the five team crons keep
// their paths, and the entity reaches company-os only through that entity's
// index — with the client components that cannot use a server-only door taking
// their company-os values as props instead.
//
// Collected by the root vitest.config.ts (`entities/**/*.test.ts`).
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Importing the entity index loads modules that build the service-role Supabase
// client at module load. On CI's Node 20 that client's realtime layer needs a
// WebSocket polyfill and throws; this test only inspects the export surface, so
// the client is stubbed out entirely. Both the kernel path and its lib/ shim
// resolve to the same module id, so one mock covers every importer.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));
// The kernel auth guards wrap their session readers in React's `cache`, which
// only the canary React that Next ships has; the React vitest resolves has no
// such export, so the wrapper is replaced with identity for this test.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTITY = "entities/team";
const MODULES = ["coaching", "hub", "time-off", "onboarding"];
const CRONS = [
  "probation-reviews",
  "performance-reviews",
  "onboarding-cycle",
  "coaching-cycle",
  "coaching-recaps",
];

type Manifest = {
  entities: Record<string, { target: string; modules?: string[]; tables: string[] }>;
};
const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const team = manifest.entities.team;

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Source lines that are neither blank nor a `//` comment. */
function code(rel: string): string[] {
  return read(rel)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//"));
}

/** Every file under `rel`, as repo-relative paths, sorted. */
function filesUnder(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs
    .readdirSync(abs)
    .flatMap((name) => filesUnder(`${rel}/${name}`))
    .sort();
}

/** Every source file the entity itself holds. */
function entityFiles(): string[] {
  return filesUnder(ENTITY).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
}

// The file names the App Router treats as a route, and the segment-config
// exports it reads by static analysis. Everything else in a route folder is
// ordinary code that moves into the entity wholesale.
const ROUTE_FILE = /\/(page|layout|route|opengraph-image|not-found|error|loading|template|default)\.tsx?$/;
const SEGMENT_CONFIG =
  /^export const (dynamic|dynamicParams|revalidate|fetchCache|runtime|preferredRegion|maxDuration)\b/;
// The delegation names its exports one by one. `export *` looks equivalent and
// is not: Next reads a route file's export names statically, and its
// metadata-route loader turns a star re-export into `export { , runtime }`,
// which fails the build — the opengraph-image routes proved it.
const DELEGATION = new RegExp(`^export \\{ [\\w, ]+ \\} from "@/${ENTITY}/[^"]+";$`);
// A segment's global stylesheets are composition, not logic, and they have to be
// listed here: the admin stylesheet and app/styles are under app/, which an
// entity may not import, and the cascade depends on the order they are pulled in.
const STYLESHEET = /^import "@\/app\/[^"]+\.css";$/;
// An error boundary must carry the directive in the file under app/ itself.
const USE_CLIENT = /^"use client";$/;

describe("team entity surface", () => {
  it("declares exactly the tables the manifest gives it", async () => {
    const { TEAM_TABLES } = await import("./tables");
    expect([...TEAM_TABLES].sort()).toEqual([...team.tables].sort());
  });

  it("holds the four AR modules the manifest names, each behind its own index", () => {
    expect(team.modules).toEqual(MODULES);
    for (const m of MODULES) {
      expect(fs.existsSync(path.join(ROOT, ENTITY, "modules", m, "index.ts")), `${m} has no index`).toBe(true);
    }
  });

  it("lets sibling modules see each other only through their index", () => {
    // The generated ESLint zones enforce this too; repeated here so a `git mv`
    // that outruns lint still fails.
    for (const m of MODULES) {
      const offenders = filesUnder(`${ENTITY}/modules/${m}`)
        .filter((f) => /\.tsx?$/.test(f))
        .filter((f) =>
          MODULES.filter((s) => s !== m).some((s) =>
            new RegExp(`from\\s+"@/${ENTITY}/modules/${s}/`).test(read(f)),
          ),
        );
      expect(offenders, `${m} imports a sibling module's internals`).toEqual([]);
    }
  });

  it("exports the domain surface other entities consume through its index", async () => {
    const index = await import("./index");
    for (const name of [
      "getAdminRosterGoals",
      "ladderValue",
      "LEAVE_TYPE_LABEL",
      "TimeOffCalendar",
      "moveCard",
      "countWorkingDays",
      "resolveLeaveApprover",
      "runOnboardingCycle",
      "openReviewCycle",
      "getProgramDetail",
      "ReviewHistoryTable",
    ]) {
      expect(index, `entities/team/index.ts does not export ${name}`).toHaveProperty(name);
    }
  });

  it("reaches another entity only through its doors", () => {
    // Design §3 rule 2; the gate in scripts/check-entity-imports.mjs fails any
    // other edge tree-wide, and this repeats it for the entity so a `git mv`
    // that outruns the gate still fails here.
    const offenders = new Set<string>();
    for (const rel of entityFiles()) {
      for (const m of read(rel).matchAll(/from\s+["'](@\/entities\/[^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(`@/${ENTITY}`)) continue;
        if (/^@\/entities\/[a-z-]+(\/client)?$/.test(spec)) continue;
        offenders.add(`${rel} -> ${spec}`);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it("never lets a client component take a value from the company-os door", () => {
    // The company-os index is a server-only barrel. A client component that
    // needs one of its values (moveCard, RECOMMENDATIONS, EQUIPMENT_TYPES) gets
    // it from its server page as a prop; only types may cross directly.
    const offenders = entityFiles().filter((rel) => {
      const src = read(rel);
      if (!/^"use client";/m.test(src)) return false;
      return /import\s+(?!type\b)\{[^}]*\}\s+from\s+"@\/entities\/company-os"/.test(
        src.replace(/import\s+\{\s*(type\s+\w+\s*,\s*)*type\s+\w+\s*,?\s*\}\s+from\s+"@\/entities\/company-os";/g, ""),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("is never imported by value from a client component anywhere in the tree", () => {
    // Same hazard in the other direction: entities/team/index.ts pulls next/headers
    // and the service-role client, so a "use client" file that imported a value
    // from it would drag the server side into the browser bundle. Client code
    // enters through entities/team/client.ts, the browser-safe door (ME-13),
    // never through this barrel.
    const tree = ["app", "entities", "kernel"].flatMap((d) => filesUnder(d));
    const offenders = tree.filter((rel) => {
      if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel)) return false;
      const src = read(rel);
      if (!/^"use client";/m.test(src)) return false;
      return /import\s+(?!type\b)\{[^}]*\}\s+from\s+"@\/entities\/team"/.test(
        src.replace(/import\s+\{\s*(type\s+\w+\s*,\s*)*type\s+\w+\s*,?\s*\}\s+from\s+"@\/entities\/team";/g, ""),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("has no old path left — lib/ and components/ are gone (ME-13)", () => {
    // The admin time-off screens that used to read the leave vocabulary at
    // lib/admin/time-off take it from this entity's doors now.
    expect(fs.existsSync(path.join(ROOT, "lib"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "components"))).toBe(false);
  });
});

describe("team routes under app/", () => {
  // Since ME-13 the manifest lists no app/ paths (app/ is the composition root):
  // the entity's mounts are the app/ files that delegate to one of its routes/,
  // api/ or crons/ bodies, and the directories they sit in are its app/ stems.
  const appStems = ["app/team", "app/api/team", ...CRONS.map((c) => `app/api/cron/${c}`)];
  const appFiles = appStems.flatMap((stem) => filesUnder(stem));
  const routeFiles = appFiles.filter((f) => ROUTE_FILE.test(f));
  const mounts = filesUnder("app").filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && new RegExp(`"@/${ENTITY}/(routes|api|crons)/`).test(read(f)),
  );

  it("mounts the entity from exactly those stems, route files included", () => {
    // Guard the guard: an empty scan would make every assertion below vacuous,
    // and a mount outside the stems would be a route the list below never checks.
    expect(routeFiles.length).toBeGreaterThan(50);
    expect(mounts.filter((f) => !appStems.some((stem) => f.startsWith(`${stem}/`)))).toEqual([]);
    expect(mounts.length).toBe(routeFiles.length);
  });

  it("leaves nothing but route files behind — every body moved into the entity", () => {
    expect(appFiles.filter((f) => !ROUTE_FILE.test(f))).toEqual([]);
  });

  it("makes every route file a delegation, with segment config declared locally", () => {
    const wrong = routeFiles.filter((f) =>
      code(f).some(
        (line) =>
          !DELEGATION.test(line) &&
          !SEGMENT_CONFIG.test(line) &&
          !STYLESHEET.test(line) &&
          !USE_CLIENT.test(line),
      ),
    );
    expect(wrong).toEqual([]);
    for (const f of routeFiles) {
      expect(code(f).some((line) => DELEGATION.test(line)), `${f} delegates to nothing`).toBe(true);
    }
  });

  it("keeps the admin stylesheet cascade in the two layouts", () => {
    for (const layout of ["app/team/(auth)/layout.tsx", "app/team/(dashboard)/layout.tsx"]) {
      expect(code(layout).filter((l) => STYLESHEET.test(l))).toEqual([
        'import "@/app/admin/admin.css";',
        'import "@/app/styles/utilities.css";',
      ]);
    }
  });

  it("never hides segment config behind the door, where Next cannot read it", () => {
    const hidden = entityFiles().filter((f) => code(f).some((line) => SEGMENT_CONFIG.test(line)));
    expect(hidden).toEqual([]);
  });

  it("keeps the five team crons on their published paths", () => {
    const vercel: { crons: Array<{ path: string; schedule: string }> } = JSON.parse(
      read("vercel.json"),
    );
    for (const c of CRONS) {
      const cron = vercel.crons.find((x) => x.path === `/api/cron/${c}/`);
      expect(cron, `${c} is not in vercel.json`).toBeDefined();
      expect(code(`app/api/cron/${c}/route.ts`)).toContain(
        `export { GET } from "@/${ENTITY}/crons/${c}";`,
      );
    }
  });
});
