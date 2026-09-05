// Fails when an entity's door graph imports a door of an entity on the same or
// a higher layer, which keeps the entity graph a DAG (Q2, 2026-09-05).
//
// Every entity carries a `layer` in entities.manifest.json (the kernel is
// layer 0). An entity's *door graph* is its two doors — index.ts and
// client.ts — plus everything they transitively reach inside the entity. The
// rule: a file in the door graph may import another entity's door only when
// that entity has a strictly lower layer. Route bodies, api/ and crons/ are the
// mounts app/ composes and are outside every door graph, so an admin route may
// render team data; but the moment a door reaches such a file, the file is in
// the graph and the rule applies to it too.
//
// Why: after ME-13 every cross-entity import went through the entities' index
// barrels, and where two entities depended on each other in both directions
// the barrels closed into a cycle — 59 `import/no-cycle` warnings, load-safe
// only while nothing read a door value at module scope
// (scripts/entity-door-load-order.test.mjs), and one actual build failure on
// /api/stripe/webhook before that test existed. A strict layer order makes a
// cycle impossible by construction rather than a warning to keep at bay, so
// `import/no-cycle` can be an error again.
//
// The walk follows `@/` and relative imports of .ts/.tsx files, skips
// type-only imports (the compiler erases them, so they are not a load-order
// edge), and stops at another entity's door or at kernel/ (the kernel imports
// no entity, by scripts/gen-entity-zones.mjs). A cross-entity import that is
// not a door is scripts/check-entity-imports.mjs's business and is ignored
// here.
//
//   node scripts/check-entity-layers.mjs            gate
//   node scripts/check-entity-layers.mjs --explain  every violation with the
//                                                   chain of files from the door
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KERNEL, entityOf, loadManifest, ownershipEntries } from "./entity-manifest.mjs";

const DOORS = ["index.ts", "client.ts"];

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Every static, dynamic and re-export specifier in `source` that survives
 * compilation. `import type`, `export type … from` and an import whose every
 * specifier is inline `type` are erased by TypeScript and load nothing, so a
 * type taken from another entity is not an edge.
 */
export function valueSpecifiers(source) {
  const out = [];
  const src = stripComments(source)
    // A type-only statement is erased only within its own statement (no ";" and
    // no blank line between `type` and `from`), so an `export type X = {...}`
    // followed later by a real value import cannot swallow that import.
    .replace(/\b(import|export)\s+type\s[^;]*?from\s+["'][^"']+["']/g, "")
    .replace(/\bimport\s*\{\s*(type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,\s*)*type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,?\s*\}\s*from\s+["'][^"']+["']/g, "");
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\bimport\s+["']([^"']+)["']/g]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

/** Repo-relative .ts/.tsx file for a relative or `@/` specifier; null for a package or asset. */
export function resolveLocal(root, spec, importerRel) {
  let stem;
  if (spec.startsWith("@/")) stem = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    stem = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
  } else return null;
  if (/\.(css|json|svg|png|jpg|webp)$/.test(stem)) return null;
  const bare = stem.replace(/\.(ts|tsx)$/, "");
  for (const candidate of [`${bare}.ts`, `${bare}.tsx`, `${bare}/index.ts`, `${bare}/index.tsx`]) {
    if (fs.existsSync(path.join(root, candidate))) return candidate;
  }
  return null;
}

/** Layer per entity name, validated: every entity needs a non-negative integer. */
export function layersOf(manifest) {
  const layers = {};
  for (const [name, entity] of Object.entries(manifest.entities)) {
    if (!Number.isInteger(entity.layer) || entity.layer < 1) {
      throw new Error(`entities.manifest.json: entities.${name}.layer must be an integer >= 1 (the kernel is 0)`);
    }
    layers[name] = entity.layer;
  }
  return layers;
}

function isDoor(rel, manifest) {
  return Object.values(manifest.entities).some((e) => DOORS.some((d) => rel === `${e.target}/${d}`));
}

/**
 * Walks one entity's door graph and returns every edge to a same-or-higher
 * layer door: { importer, target, from, to, chain }. Also returns the files
 * visited so a test can see the walk was not vacuous.
 */
export function walkEntity(root, name, manifest, layers = layersOf(manifest), entries = ownershipEntries(manifest)) {
  const entity = manifest.entities[name];
  const violations = [];
  const visited = new Set();
  const stack = DOORS.map((d) => `${entity.target}/${d}`)
    .filter((rel) => fs.existsSync(path.join(root, rel)))
    .map((rel) => [rel, [rel]]);
  while (stack.length > 0) {
    const [rel, chain] = stack.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    for (const spec of valueSpecifiers(source)) {
      const next = resolveLocal(root, spec, rel);
      if (next === null) continue;
      const owner = entityOf(next, manifest, entries);
      if (owner === name) {
        if (!visited.has(next)) stack.push([next, [...chain, next]]);
        continue;
      }
      if (owner === KERNEL) continue;
      // A cross-entity import that is not a door is check-entity-imports's
      // finding, not a layer edge; only doors are compared.
      if (!(owner in layers) || !isDoor(next, manifest)) continue;
      if (layers[owner] >= layers[name]) {
        violations.push({ importer: rel, target: next, from: name, to: owner, chain });
      }
    }
  }
  return { violations, visited };
}

/** Every violation in the tree, in manifest order. */
export function checkEntityLayers(root, manifest = loadManifest(root)) {
  const layers = layersOf(manifest);
  const entries = ownershipEntries(manifest);
  const violations = [];
  for (const name of Object.keys(manifest.entities)) {
    violations.push(...walkEntity(root, name, manifest, layers, entries).violations);
  }
  return { layers, violations };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const explain = process.argv.includes("--explain");
  const { layers, violations } = checkEntityLayers(root);
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.importer} -> ${v.target} (${v.from} L${layers[v.from]} -> ${v.to} L${layers[v.to]})`);
      if (explain) console.error(`    via ${v.chain.join(" -> ")}`);
    }
    console.error(
      `\ncheck-entity-layers: ${violations.length} door-graph import(s) of a same-or-higher layer entity. ` +
        `Move the needed piece down (to the lower entity or kernel/), invert the call so the higher ` +
        `entity calls the lower one, or take the importer out of the door graph (routes/, api/, crons/). ` +
        `Run with --explain for the chain from the door. See the header of scripts/check-entity-layers.mjs.`,
    );
    process.exit(1);
  }
  console.log("check-entity-layers: every door graph imports only lower-layer entities.");
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
