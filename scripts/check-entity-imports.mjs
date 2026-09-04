// Fails when any cross-entity import count grows.
//
// The ESLint zones from scripts/gen-entity-zones.mjs only bite once code lives
// under entities/ and kernel/. Until the moves land (ME-03 .. ME-12) the same
// boundaries are enforced as a ratchet over today's paths: every import in
// app/, lib/, components/, entities/ and kernel/ is resolved to a repo path,
// both ends are mapped to their owner through entities.manifest.json, and the
// count per ordered pair ("team->company-os") may not exceed the committed
// baseline in scripts/entity-imports-baseline.json. A pair absent from the
// baseline is at zero. The design doc measured team→admin 108 and portal→admin
// 78 by directory; the manifest already assigns the shared admin pieces
// (format, audit, url, the generic components) to the kernel, so the committed
// starting numbers are lower. The kernel move (ME-03) makes that ownership
// physical; the entity moves bring the rest down.
//
// What counts as an edge: importer owner ≠ target owner, the target is not the
// kernel (everyone may use the kernel), and the target is not the other
// entity's index.ts (that is the sanctioned door). Imports from the
// composition root ("app") count too, because a thin app/ must reach entities
// through their public surface. "unassigned" is a real owner here so a file
// the manifest forgot shows up as a pair rather than vanishing.
//
// `--write-baseline` regenerates from the tree and refuses to raise any pair.
// `--explain <pair>` lists the importer → target edges behind one pair, which
// is how a move ticket finds what to relocate.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KERNEL, entityOf, loadManifest, ownershipEntries } from "./entity-manifest.mjs";

export const BASELINE_FILE = "scripts/entity-imports-baseline.json";
const SCAN_DIRS = ["app", "lib", "components", "entities", "kernel"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
// Test files import across entities to exercise seams; they are not architecture edges.
const TEST_FILE = /(^|\/)__tests__\/|\.test\.(ts|tsx|js|jsx|mjs)$/;

function listSourceFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(d, entry.name));
      } else if (SOURCE.test(entry.name)) {
        const rel = path.relative(root, path.join(d, entry.name)).split(path.sep).join("/");
        if (!TEST_FILE.test(rel)) out.push(rel);
      }
    }
  };
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out.sort();
}

/** Source with block and line comments removed, so a commented-out import is not an edge. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** Import specifiers in a source string: static, dynamic, re-export and bare. */
export function importSpecifiers(source) {
  source = stripComments(source);
  const specs = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

/**
 * Repo-relative path (without extension or trailing /index) for a specifier
 * that points inside the repo, else null. `@/` is the tsconfig alias for the
 * repo root; anything not relative and not aliased is a package.
 */
export function resolveSpecifier(spec, importerRel) {
  let target;
  if (spec.startsWith("@/")) target = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    target = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
  } else return null;
  // Assets and data files (css, json, images) are not code and have no owner.
  const ext = target.match(/\.([a-z0-9]+)$/i)?.[1];
  if (ext && !["ts", "tsx", "js", "mjs", "jsx"].includes(ext)) return null;
  target = target.replace(/\.(ts|tsx|js|mjs|jsx)$/, "").replace(/\/index$/, "");
  return target;
}

/**
 * Whether `target` is some entity's public index. resolveSpecifier strips a
 * trailing /index, so `@/entities/site/index` and `@/entities/site` both arrive
 * as the entity's target directory.
 */
function isEntityIndex(target, manifest) {
  return Object.values(manifest.entities).some((e) => target === e.target);
}

/** Every counted edge in the tree: { importer, target, from, to }. */
export function collectEdges(root, manifest = loadManifest(root)) {
  const entries = ownershipEntries(manifest);
  const edges = [];
  for (const rel of listSourceFiles(root)) {
    const from = entityOf(rel, manifest, entries);
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    for (const spec of importSpecifiers(source)) {
      const target = resolveSpecifier(spec, rel);
      if (!target) continue;
      const to = entityOf(target, manifest, entries);
      if (to === from || to === KERNEL) continue;
      if (isEntityIndex(target, manifest)) continue;
      edges.push({ importer: rel, target, from, to });
    }
  }
  return edges;
}

/** Per-pair counts, keys "from->to", sorted. */
export function measure(root, manifest = loadManifest(root)) {
  const counts = {};
  for (const e of collectEdges(root, manifest)) {
    const key = `${e.from}->${e.to}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
}

export function compare(current, baseline) {
  const violations = [];
  for (const [pair, n] of Object.entries(current)) {
    const allowed = baseline[pair] ?? 0;
    if (n > allowed) violations.push(`${pair}: ${n} cross-entity import(s), baseline allows ${allowed}`);
  }
  return violations;
}

export function loadBaseline(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function serializeBaseline(counts) {
  return `${JSON.stringify(counts, null, 2)}\n`;
}

export function writeBaseline(root, file = path.join(root, BASELINE_FILE), manifest = loadManifest(root)) {
  const current = measure(root, manifest);
  const existing = loadBaseline(file);
  const increases = existing ? compare(current, existing) : [];
  if (increases.length > 0) return { written: false, increases, current };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeBaseline(current));
  return { written: true, current };
}

export function checkEntityImports(root, file = path.join(root, BASELINE_FILE), manifest = loadManifest(root)) {
  const baseline = loadBaseline(file);
  const current = measure(root, manifest);
  if (!baseline) {
    return { current, violations: [`${BASELINE_FILE} is missing; run with --write-baseline to create it`] };
  }
  return { current, violations: compare(current, baseline) };
}

function total(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const file = path.join(root, BASELINE_FILE);
  const argv = process.argv.slice(2);

  const explainAt = argv.indexOf("--explain");
  if (explainAt !== -1) {
    const pair = argv[explainAt + 1];
    const [from, to] = (pair ?? "").split("->");
    if (!from || !to) {
      console.error("check-entity-imports: --explain needs a pair such as team->company-os");
      process.exit(2);
    }
    const edges = collectEdges(root).filter((e) => e.from === from && e.to === to);
    for (const e of edges) console.log(`${e.importer} -> ${e.target}`);
    console.log(`\n${edges.length} edge(s) for ${pair}.`);
    return;
  }

  if (argv.includes("--write-baseline")) {
    const res = writeBaseline(root, file);
    if (!res.written) {
      for (const line of res.increases) console.error(line);
      console.error(
        `\ncheck-entity-imports: refusing to write ${BASELINE_FILE} — it would raise ` +
          `${res.increases.length} pair(s). The baseline only shrinks; import through the ` +
          `entity's index or move the shared piece into the kernel.`,
      );
      process.exit(1);
    }
    console.log(
      `check-entity-imports: wrote ${BASELINE_FILE} (${total(res.current)} cross-entity imports ` +
        `across ${Object.keys(res.current).length} pairs).`,
    );
    return;
  }

  const { violations, current } = checkEntityImports(root, file);
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    console.error(
      `\ncheck-entity-imports: ${violations.length} pair(s) above baseline. Cross-entity imports ` +
        `may not grow; import through the entity's index.ts or move the shared piece into ` +
        `kernel/. Run \`node scripts/check-entity-imports.mjs --explain <pair>\` to list the edges. ` +
        `See the header of scripts/check-entity-imports.mjs.`,
    );
    process.exit(1);
  }
  console.log(
    `check-entity-imports: ${total(current)} cross-entity imports across ` +
      `${Object.keys(current).length} pairs; nothing above baseline.`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
