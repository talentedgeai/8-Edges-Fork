#!/usr/bin/env node
// Cascade guard for the design system's layered stylesheets.
//
// The layers do not all load everywhere:
//   - app/styles/tokens.css and app/globals.css load on EVERY page (the root
//     layout imports them), so their classes are always available.
//   - app/styles/utilities.css (the `.u-*` layer) and
//     app/styles/site-components.css (the shared `body .site-*` layer) load
//     ONLY where a route layout imports them, AFTER that route's own sheet so
//     they win the cascade.
//   - app/admin/admin.css loads on the OS surfaces (admin, team, portal) via
//     their (dashboard)/(auth) layouts.
//
// So a class is only safe on a given page if a stylesheet defining it is
// reachable from that page's layout chain. Two mistakes break this, and both
// shipped during the migration before this check existed:
//
//   1. A component rendered by the ROOT layout (the nav, the footer, anything
//      SiteFrame pulls in) uses a `.u-*` class. Utilities never load at the
//      root, so the class is inert on every page. This is the footer bug.
//   2. A page under a route with no layout importing utilities uses `.u-*`
//      (the Vietnam pages). Same silent failure.
//
// This script fails the build on both. It resolves the class -> stylesheet map
// from the CSS itself and the reachable-sheet set from the layout chain, so it
// stays correct as sheets move. Deliberately dependency-free (Node built-ins),
// like the other ratchets.
//
//   node scripts/check-utilities-scope.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GLOBAL_SHEETS = ["app/styles/tokens.css", "app/globals.css"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);

/** Every class selector defined in a stylesheet (subject classes and those in
 *  descendant/compound selectors alike — if the rule exists, the class is
 *  styled). Returns a Set of bare class names. */
function classesDefinedIn(cssPath) {
  const abs = path.join(ROOT, cssPath);
  if (!fs.existsSync(abs)) return new Set();
  const css = fs.readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set();
  for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(m[1]);
  return out;
}

/** All stylesheet paths under app/, so we can map any class to its sheets. */
function allStylesheets() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".css")) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app"));
  return out;
}

/** class name -> Set of stylesheet paths that define it. */
function buildClassIndex() {
  const index = new Map();
  for (const sheet of allStylesheets()) {
    for (const cls of classesDefinedIn(sheet)) {
      if (!index.has(cls)) index.set(cls, new Set());
      index.get(cls).add(sheet);
    }
  }
  return index;
}

/** The CSS files a layout.tsx imports, as repo-relative paths. Resolves
 *  `./x.css`, `../x.css` and `@/app/...` / `@/...` forms. */
function cssImportsOf(tsxPath) {
  const abs = path.join(ROOT, tsxPath);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, "utf8");
  const out = [];
  for (const m of src.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)) {
    const spec = m[1];
    let rel;
    if (spec.startsWith("@/")) rel = spec.slice(2);
    else rel = path.relative(ROOT, path.resolve(path.dirname(abs), spec)).split(path.sep).join("/");
    out.push(rel);
  }
  return out;
}

/** Every stylesheet reachable from a file's route: the global sheets plus the
 *  CSS imported by any layout.tsx from the file's directory up to app/. */
function reachableSheets(filePath) {
  const sheets = new Set(GLOBAL_SHEETS);
  // A file may import its own stylesheet directly (a pattern page pulling in
  // the sheets it documents), not only inherit one from a layout.
  for (const css of cssImportsOf(filePath)) sheets.add(css);
  let dir = path.dirname(path.join(ROOT, filePath));
  const appDir = path.join(ROOT, "app");
  while (dir.startsWith(appDir)) {
    const layout = path.join(dir, "layout.tsx");
    if (fs.existsSync(layout)) {
      for (const css of cssImportsOf(path.relative(ROOT, layout).split(path.sep).join("/"))) sheets.add(css);
    }
    if (dir === appDir) break;
    dir = path.dirname(dir);
  }
  // app/layout.tsx (the root) is included by the walk above when dir === app.
  return sheets;
}

/** The component/source files rendered by the root layout: SiteFrame and its
 *  transitive local imports. These render on EVERY page, including the bare
 *  root, so they may use only globally-defined classes. */
function rootRenderSet() {
  const seen = new Set();
  const queue = ["app/layout.tsx"];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, "utf8");
    for (const m of src.matchAll(/import\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.endsWith(".css")) continue;
      let rel = null;
      if (spec.startsWith("@/")) rel = spec.slice(2);
      else if (spec.startsWith(".")) rel = path.relative(ROOT, path.resolve(path.dirname(abs), spec)).split(path.sep).join("/");
      else continue; // package import
      for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
        if (fs.existsSync(path.join(ROOT, rel + ext))) { queue.push(rel + ext); break; }
        // A bare specifier may name a directory (`@/entities/site` resolves to
        // its index.ts); only an actual file is a source to read.
        if (fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile()) { queue.push(rel); break; }
      }
    }
  }
  seen.delete("app/layout.tsx");
  return seen;
}

/** Classes referenced in a tsx file's className attributes (string and
 *  template-literal forms), restricted to the design-system namespaces. */
function referencedClasses(src) {
  const out = new Set();
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    for (const tok of body.split(/[\s${}()?:"'`]+/)) {
      if (/^(u|site)-[a-z]/.test(tok)) out.add(tok);
    }
  }
  return out;
}

function* tsxFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* tsxFiles(rel);
    else if (e.name.endsWith(".tsx")) yield rel;
  }
}

const index = buildClassIndex();
const rootSet = rootRenderSet();
const errors = [];

// Rule 1 — the root-render set may use only globally-defined classes.
for (const f of rootSet) {
  if (!f.endsWith(".tsx")) continue;
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const cls of referencedClasses(src)) {
    const sheets = index.get(cls) ?? new Set();
    const global = [...sheets].some((s) => GLOBAL_SHEETS.includes(s));
    if (!global) {
      errors.push(
        `${f}: uses "${cls}", but this file is rendered by the root layout and ` +
        `"${cls}" is only in ${[...sheets].join(", ") || "no stylesheet"}, which the root does not load. ` +
        `Use a class defined in app/globals.css, or move this rule there.`,
      );
    }
  }
}

// Rule 2 — every app/ file may use only classes a reachable sheet defines.
for (const f of tsxFiles("app")) {
  if (rootSet.has(f)) continue; // already covered, and by the stricter rule
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const refs = referencedClasses(src);
  if (!refs.size) continue;
  const reach = reachableSheets(f);
  for (const cls of refs) {
    const sheets = index.get(cls) ?? new Set();
    const ok = [...sheets].some((s) => reach.has(s));
    if (!ok) {
      errors.push(
        `${f}: uses "${cls}", but no stylesheet in this route's layout chain defines it ` +
        `(${[...sheets].join(", ") || "no stylesheet defines it at all"}). ` +
        `Add the import to a layout, or use a class this route already loads.`,
      );
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} utilities-scope problem(s):\n\n  - ${errors.join("\n  - ")}\n`);
  process.exit(1);
}
console.log(`utilities scope OK: root-render set and every app/ route reach the classes they use.`);
