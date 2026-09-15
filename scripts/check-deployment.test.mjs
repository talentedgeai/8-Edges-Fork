import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDeployments, closureOf, loadDeployments } from "./check-deployment.mjs";
import { generate, renderEvents, subscribingEntities } from "./gen-deployment.mjs";

// A deployment file is the only thing that differs between one client's build
// and another's, so the rules it has to obey are worth pinning: it names real
// entities, it is closed under `requires`, and what the generator emits from it
// changes when the list changes. That last one is the point of the whole thing —
// a test that only ever saw the full deployment would not prove anything is
// pluggable.

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(entities, deployments, doors = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-"));
  temps.push(root);
  const manifest = {
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: Object.fromEntries(
      Object.entries(entities).map(([n, e]) => [
        n,
        { target: `entities/${n}`, current: [`entities/${n}`], tables: [], portability: "portable", requires: [], ...e },
      ]),
    ),
  };
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest, null, 2));
  fs.mkdirSync(path.join(root, "deployments"));
  for (const [name, list] of Object.entries(deployments)) {
    fs.writeFileSync(path.join(root, "deployments", `${name}.json`), JSON.stringify({ name, entities: list }, null, 2));
  }
  for (const [name, body] of Object.entries(doors)) {
    fs.mkdirSync(path.join(root, "entities", name), { recursive: true });
    fs.writeFileSync(path.join(root, "entities", name, "index.ts"), body);
  }
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  return { root, manifest };
}

describe("check-deployment", () => {
  it("passes a deployment that lists everything it needs", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: { requires: ["b"] }, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a", "b"] },
    );
    expect(checkDeployments(root, manifest).problems).toEqual([]);
  });

  it("names the entity to add when a requirement is missing", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: { requires: ["b"] }, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a"] },
    );
    const { problems } = checkDeployments(root, manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/includes a but not b, which it requires — add "b"/);
  });

  it("rejects an entity that is not in the catalogue", () => {
    const { root, manifest } = fixture({ contacts: {}, a: {} }, { edge8: ["contacts", "a"], small: ["ghost"] });
    expect(checkDeployments(root, manifest).problems.some((p) => /"ghost" is not an entity/.test(p))).toBe(true);
  });

  it("fails when edge8 omits something the catalogue has, so nothing goes unbuilt", () => {
    const { root, manifest } = fixture({ contacts: {}, a: {}, b: {} }, { edge8: ["contacts", "a"] });
    expect(checkDeployments(root, manifest).problems.some((p) => /catalogue has b but this deployment omits it/.test(p))).toBe(true);
  });

  it("treats the mandatory set as installed without being listed", () => {
    const { root, manifest } = fixture({ contacts: {}, a: { requires: ["contacts"] } }, { edge8: ["contacts", "a"], small: ["a"] });
    expect(checkDeployments(root, manifest).problems).toEqual([]);
  });

  it("closes over a chain, not just direct requirements", () => {
    const { manifest } = fixture({ contacts: {}, a: { requires: ["b"] }, b: { requires: ["c"] }, c: {} }, { edge8: [] });
    expect([...closureOf(manifest, ["a"])].sort()).toEqual(["a", "b", "c", "contacts"]);
  });
});

describe("gen-deployment", () => {
  const WITH = 'export { subscriptions } from "./lib/subs";\n';
  const WITHOUT = "export const x = 1;\n";

  it("registers only the subscribing entities a deployment installs", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: {}, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a"] },
      { a: WITH, b: WITH, contacts: WITHOUT },
    );
    expect(subscribingEntities(root, manifest, new Set(["contacts", "a", "b"]))).toEqual(["a", "b"]);
    expect(subscribingEntities(root, manifest, new Set(["contacts", "a"]))).toEqual(["a"]);
  });

  it("emits a registry that differs between deployments, which is the whole point", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: {}, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a"] },
      { a: WITH, b: WITH, contacts: WITHOUT },
    );
    const full = generate(root, "edge8", manifest)["app/events.ts"];
    const small = generate(root, "small", manifest)["app/events.ts"];
    expect(full).toContain("aSubscriptions();");
    expect(full).toContain("bSubscriptions();");
    expect(small).toContain("aSubscriptions();");
    expect(small).not.toContain("bSubscriptions();");
  });

  it("says so plainly when a deployment installs no subscriber at all", () => {
    expect(renderEvents([], "minimal")).toContain("This deployment installs no entity with subscriptions.");
    expect(renderEvents([], "minimal")).toContain("// Nothing to register.");
  });

  it("camel-cases a hyphenated entity into a legal identifier", () => {
    expect(renderEvents(["client-programs"], "edge8")).toContain("clientProgramsSubscriptions");
  });

  it("refuses a deployment name that has no file", () => {
    const { root, manifest } = fixture({ contacts: {} }, { edge8: ["contacts"] });
    expect(() => generate(root, "nope", manifest)).toThrow(/no deployments\/nope\.json/);
  });
});

describe("the real deployments", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("ship edge8 and minimal, and both pass", () => {
    const names = loadDeployments(root).map((d) => d.name).sort();
    expect(names).toEqual(["edge8", "minimal"]);
    expect(checkDeployments(root).problems).toEqual([]);
  });

  it("leave something out of minimal, or exclusion is never exercised", () => {
    const [edge8, minimal] = ["edge8", "minimal"].map((n) => loadDeployments(root).find((d) => d.name === n));
    expect(minimal.entities.length).toBeLessThan(edge8.entities.length);
  });

  // The generator finds a subscriber by regex over the door, so a door that
  // switched to `export *` would drop its entity from the registry with no
  // error — and the registry would still "match". Pinning the one real
  // subscriber keeps that from being a silent change.
  // The other three generated artefacts, against the real tree. Each is a place
  // where "leave this entity out" has to mean something: a cron that stops
  // being scheduled, a nav row that stops being rendered, an environment
  // variable that stops being asked for.
  it("schedules only the crons of the entities a deployment installs", () => {
    const full = JSON.parse(generate(root, "edge8")["vercel.json"]).crons;
    const small = JSON.parse(generate(root, "minimal")["vercel.json"]).crons;
    // Every cron belongs to some entity, so the full build has them all.
    expect(full.length).toBeGreaterThan(20);
    expect(small.length).toBeLessThan(full.length);
    const paths = new Set(full.map((c) => c.path));
    expect(small.every((c) => paths.has(c.path))).toBe(true);
    // Coaching is not in minimal, so its cycle is not scheduled there.
    expect(paths.has("/api/cron/coaching-cycle/")).toBe(true);
    expect(small.some((c) => c.path === "/api/cron/coaching-cycle/")).toBe(false);
  });

  it("composes only the navigation of the entities a deployment installs", () => {
    const full = generate(root, "edge8")["app/nav.ts"];
    const small = generate(root, "minimal")["app/nav.ts"];
    expect(full).toContain('import { adminNav as campaignsAdminNav } from "@/entities/campaigns/client";');
    expect(small).not.toContain("campaignsAdminNav");
    expect(small).toContain("boardsAdminNav");
  });

  it("asks for only the environment the installed entities read", () => {
    const full = generate(root, "edge8")["app/env.ts"];
    const small = generate(root, "minimal")["app/env.ts"];
    // The kernel's Supabase keys are required in every build.
    expect(full).toContain('"NEXT_PUBLIC_SUPABASE_URL"');
    expect(small).toContain('"NEXT_PUBLIC_SUPABASE_URL"');
    expect(small.length).toBeLessThan(full.length);
  });

  it("mounts only the routes of the entities a deployment installs", async () => {
    const { generateMounts } = await import("./gen-app-mounts.mjs");
    const full = Object.keys(generateMounts(root, "edge8"));
    const small = Object.keys(generateMounts(root, "minimal"));
    // The point of the whole catalogue: a client who bought the Workboard does
    // not compile the marketing site, the retreats or the team workspace.
    expect(full.length).toBeGreaterThan(300);
    expect(small.length).toBeLessThan(full.length / 2);
    expect(small.every((p) => full.includes(p))).toBe(true);
    expect(small.some((p) => p.startsWith("app/admin/(dashboard)/edges/workboard"))).toBe(true);
    expect(small.some((p) => p.startsWith("app/team/"))).toBe(false);
    expect(small.some((p) => p.startsWith("app/admin/(dashboard)/revenue/marketing"))).toBe(false);
  });

  it("registers coaching's subscriptions in the edge8 build, so a done card still closes its commitment", () => {
    const events = generate(root, "edge8")["app/events.ts"];
    expect(events).toContain('import { subscriptions as coachingSubscriptions } from "@/entities/coaching";');
    expect(events).toContain("coachingSubscriptions();");
  });
});

// The registry only runs if Next calls instrumentation.ts, and Next 14 only
// does that behind experimental.instrumentationHook. With the flag off the
// whole bus is wired and never started: every gate passes and no subscriber
// ever registers. That is a config fact, not a code fact, so it is pinned here.
describe("the registry actually runs", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("next.config.mjs turns the instrumentation hook on", () => {
    const config = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(config).toMatch(/instrumentationHook:\s*true/);
  });

  it("instrumentation.ts registers the generated subscribers, on the Node runtime only", () => {
    const source = fs.readFileSync(path.join(root, "instrumentation.ts"), "utf8");
    expect(source).toMatch(/export async function register\(/);
    expect(source).toContain('import("@/app/events")');
    expect(source).toContain("registerEventSubscribers()");
    // middleware.ts gives this build an edge runtime, which cannot load the
    // Node-only modules in the subscribers' graph. The import has to sit inside
    // the `if` block — webpack drops a statically-false block, but not code
    // after an early return — so the shape is pinned, not just the check.
    expect(source).toMatch(/if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{\s*const \{ registerEventSubscribers \} = await import\("@\/app\/events"\);/);
  });
});
