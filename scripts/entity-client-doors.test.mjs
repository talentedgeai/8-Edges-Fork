// Proves every entity's client door is browser-safe (multi-entity design §3,
// "two doors per entity", ME-13).
//
// entities/<name>/index.ts is a server barrel; entities/<name>/client.ts is the
// one a "use client" component may import. A barrel is bundled whole, so the
// door is only as safe as everything it reaches: this test walks the transitive
// import graph of each client.ts — relative and `@/` imports, .ts/.tsx only —
// and fails on the first module that imports a server-only package or the
// service-role Supabase client, carries the "use server" directive, or pulls a
// Node built-in. Packages other than the named server-only ones are not walked:
// react, next/navigation and the like are the browser's own.
//
// A static check rather than a bundle: `next build` is the real client-bundle
// test and runs in CI, but it takes minutes and reports the failure as a
// webpack trace; this names the offending module and the path to it in under a
// second, from `npm test`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { entityNames, loadManifest } from "./entity-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = loadManifest(ROOT);

// Package names (or prefixes) that only make sense on the server: the kernel's
// service-role client, `next/headers` (reads the request) and the Node-only SDKs.
export const SERVER_ONLY_MODULES = [
  "@/kernel/data/supabase",
  "next/headers",
  "server-only",
  "@anthropic-ai/sdk",
  "postgres",
  "mammoth",
  "node:",
  "stripe",
];

const USE_SERVER = /^\s*["']use server["'];?\s*$/m;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Every static, dynamic and re-export specifier in `source` that survives
 * compilation. `import type`, `export type … from` and an import whose every
 * specifier is inline `type` are erased by TypeScript and bundle nothing, so a
 * type taken from a server module is not an edge here (it is not one in the
 * browser either).
 */
export function specifiersOf(source) {
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

const NODE_BUILTINS = new Set(
  (await import("node:module")).builtinModules.filter((m) => !m.startsWith("_")),
);

export function isServerOnly(spec) {
  if (NODE_BUILTINS.has(spec.replace(/^node:/, "").split("/")[0])) return true;
  return SERVER_ONLY_MODULES.some((m) => spec === m || spec.startsWith(m.endsWith(":") ? m : `${m}/`));
}

/** Repo-relative file for a relative or `@/` specifier, or null for a package. */
function resolveLocal(spec, importerRel) {
  let stem;
  if (spec.startsWith("@/")) stem = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    stem = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec));
  } else return null;
  if (/\.(css|json|svg|png|jpg|webp)$/.test(stem)) return "asset";
  const bare = stem.replace(/\.(ts|tsx)$/, "");
  for (const candidate of [`${bare}.ts`, `${bare}.tsx`, `${bare}/index.ts`, `${bare}/index.tsx`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return "missing";
}

/**
 * Walks the import graph from `entryRel`. Returns the list of problems, each
 * naming the offending module and the chain of files that led there, and the
 * set of files visited (so a caller can see the walk was not vacuous).
 */
export function walkClientGraph(entryRel) {
  const problems = [];
  const visited = new Set();
  const stack = [[entryRel, [entryRel]]];
  while (stack.length > 0) {
    const [rel, chain] = stack.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (USE_SERVER.test(source.split("\n").slice(0, 5).join("\n"))) {
      problems.push(`${rel} is a "use server" actions module (via ${chain.join(" -> ")})`);
      continue;
    }
    for (const spec of specifiersOf(source)) {
      if (isServerOnly(spec)) {
        problems.push(`${rel} imports server-only "${spec}" (via ${chain.join(" -> ")})`);
        continue;
      }
      const next = resolveLocal(spec, rel);
      if (next === null || next === "asset") continue;
      if (next === "missing") {
        problems.push(`${rel} imports "${spec}", which resolves to no .ts/.tsx file`);
        continue;
      }
      if (!visited.has(next)) stack.push([next, [...chain, next]]);
    }
  }
  return { problems, visited };
}

describe("isServerOnly", () => {
  it("treats bare and node: builtins alike", () => {
    expect(isServerOnly("fs")).toBe(true);
    expect(isServerOnly("node:fs")).toBe(true);
    expect(isServerOnly("path/posix")).toBe(true);
    expect(isServerOnly("react")).toBe(false);
  });
});

describe("specifiersOf", () => {
  it("does not let a type alias above a value import hide that import", () => {
    const src = `export type X = { a: 1 };\nimport { db } from "@/lib/supabase";\n`;
    expect(specifiersOf(src)).toEqual(["@/lib/supabase"]);
  });

  it("drops type-only imports, which the compiler erases", () => {
    const src = `import type { A } from "@/server/a";
import { type B, type C as D } from "@/server/b";
export type { E } from "@/server/e";
import { f, type G } from "@/client/f";
import "./side-effect";
`;
    expect(specifiersOf(src)).toEqual(["@/client/f", "./side-effect"]);
  });
});

describe("entity client doors", () => {
  const names = entityNames(manifest);

  it("exist for every entity in the manifest", () => {
    const missing = names.filter((n) => !fs.existsSync(path.join(ROOT, manifest.entities[n].target, "client.ts")));
    expect(missing, "add entities/<name>/client.ts, even if it exports nothing").toEqual([]);
  });

  it.each(names)("%s: client.ts transitively imports nothing server-only", (name) => {
    const entry = `${manifest.entities[name].target}/client.ts`;
    const { problems, visited } = walkClientGraph(entry);
    expect(visited.has(entry)).toBe(true);
    expect(problems).toEqual([]);
  });

  it("would catch the server barrel: every index.ts trips the walk", () => {
    // Guard the guard. The indexes are server barrels by design, so a walk that
    // found nothing in one of them would mean the marker list has gone stale.
    // The site index is the one deliberate exception: it is kept free of
    // Supabase and the filesystem so a client component could import it before
    // the doors existed (see its header).
    const clean = names
      .filter((n) => n !== "site")
      .filter((n) => walkClientGraph(`${manifest.entities[n].target}/index.ts`).problems.length === 0);
    expect(clean).toEqual([]);
  });
});
