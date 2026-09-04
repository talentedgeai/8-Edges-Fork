// Fails when an entity writes a table it does not own, or when its reads of
// another entity's tables grow.
//
// Design rule 5 (docs/engineering/2026-09-03-multi-entity-design.md §3): every
// Supabase table has exactly one owner, declared as a `tables` array on the
// kernel and on each entity in entities.manifest.json. The owner is the only
// entity that may write the table directly; everyone else goes through the
// owner's index or an RPC. Reads are softer: a read of another entity's table
// is counted per ordered pair ("team->company-os") and may not exceed the
// committed baseline in scripts/table-ownership-baseline.json, which only
// shrinks. Kernel tables (identity: people, admins, team_members, ...) are
// readable by all, and the composition root "app" counts like an entity. A
// write of another entity's table fails outright unless the (file, table) pair
// is listed in scripts/table-ownership-allowlist.json with a reason; today's
// offenders were listed there when the gate turned on so it started green, and
// each entry is a debt to move behind the owner's index or an RPC.
//
// Ownership is validated against the generated types
// (kernel/data/supabase/database.types.ts): every table and view in the
// public, company_os and htt schemas must be owned once. A table the manifest
// owns twice, or not at all, fails the gate. A manifest table the types do
// not know is fine while some file still reads it (a few tables predate the
// generated snapshot or live in the marketing project's own database); one
// that nothing references either is a typo and fails.
//
// Detection is textual, not an AST, and deliberately blunt:
// - An access is `.from("table")` / `.from('table')` on any client
//   (supabase, companyOs, htt, a cookie-session client). `.rpc("name")` is
//   ignored: RPCs are the sanctioned door. `storage.from("bucket")` is a
//   bucket, not a table, and is skipped.
// - The statement is the text from `.from(` to the next `;` or `,` at paren
//   depth zero, the next `.from(` at depth zero, the end of the enclosing
//   expression (the unmatched `)` that closes it), or the end of the file. If that text contains `.insert(`,
//   `.update(`, `.upsert(` or `.delete(` the access is a WRITE, else a READ.
// - Known blunt cases: a chain built across several statements
//   (`let q = db.from("x"); q = q.update(...)`) is seen as a read; a statement
//   that mentions `.update(` for a different reason (a Map, a second chain
//   inside a callback on the same statement) is seen as a write; a dynamic
//   table name (`.from(table)`) is not seen at all; a `.from(` in a template
//   literal or string is seen. All of these are rare here and a false write
//   surfaces as a loud failure, which is the safe direction.
// - Tests are skipped, like check-entity-imports, and comments are stripped
//   so a commented-out query is not an edge.
//
// `--write-baseline` regenerates the read baseline and refuses to raise any
// pair. `--write-allowlist` (with or without --write-baseline) appends the
// cross-entity writes that are not yet listed, with a "pre-existing" reason,
// so a fresh checkout can turn the gate on; it never removes entries.
// `--explain <pair>` lists the file → table read edges behind one pair.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KERNEL, entityOf, loadManifest, ownershipEntries } from "./entity-manifest.mjs";

export const BASELINE_FILE = "scripts/table-ownership-baseline.json";
export const ALLOWLIST_FILE = "scripts/table-ownership-allowlist.json";
export const TYPES_FILE = "kernel/data/supabase/database.types.ts";
export const SCHEMAS = ["public", "company_os", "htt"];
export const PREEXISTING_REASON = "pre-existing at ME-02; move behind the owner's index or an RPC";

const SCAN_DIRS = ["app", "lib", "components", "entities", "kernel"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
// Test files reach into any table to set up state; they are not architecture edges.
const TEST_FILE = /(^|\/)__tests__\/|\.test\.(ts|tsx|js|jsx|mjs)$/;
const WRITE_CALL = /\.(insert|update|upsert|delete)\s*\(/;

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

/** Source with block and line comments removed, so a commented-out query is not an edge. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/**
 * Every table and view in the generated types, as [{ schema, name, kind }].
 * The generated file nests `<schema>: { Tables: { <name>: { ... } } Views: {...} }`
 * with fixed two-space indentation, so the parse walks indentation rather than
 * a full TypeScript grammar. A schema with no tables is emitted as
 * `[_ in never]: never` and yields nothing.
 */
export function listTables(root, file = path.join(root, TYPES_FILE)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let schema = null;
  let section = null;
  let inDatabase = false;
  for (const line of lines) {
    // The file also carries a `Constants` object with the same schema names;
    // only the `Database` type's schemas carry Tables/Views.
    if (/^export type Database = \{/.test(line)) { inDatabase = true; continue; }
    if (inDatabase && /^\}/.test(line)) { inDatabase = false; schema = null; continue; }
    if (!inDatabase) continue;
    let m;
    if ((m = line.match(/^  ([A-Za-z_][A-Za-z0-9_]*): \{$/))) {
      schema = SCHEMAS.includes(m[1]) ? m[1] : null;
      section = null;
    } else if (schema && (m = line.match(/^    (Tables|Views|Functions|Enums|CompositeTypes): \{$/))) {
      section = m[1] === "Tables" ? "table" : m[1] === "Views" ? "view" : null;
    } else if (schema && section && (m = line.match(/^      ([A-Za-z_][A-Za-z0-9_]*): \{$/))) {
      out.push({ schema, name: m[1], kind: section });
    }
  }
  return out;
}

/** Owner per declared table name: { tableName: owner }. Throws on a table owned twice. */
export function tableOwners(manifest) {
  const owners = {};
  const claim = (name, owner) => {
    if (owners[name] && owners[name] !== owner) {
      throw new Error(`table "${name}" is owned by both ${owners[name]} and ${owner}`);
    }
    owners[name] = owner;
  };
  for (const name of manifest.kernel.tables ?? []) claim(name, KERNEL);
  for (const [entity, def] of Object.entries(manifest.entities)) {
    for (const name of def.tables ?? []) claim(name, entity);
  }
  return owners;
}

/**
 * Problems with the declared ownership against the generated types: tables
 * owned twice, tables the types know but nobody owns, and declared tables
 * that neither the types nor any scanned file (`referenced`) know. Empty
 * means the manifest is sound.
 */
export function validateOwnership(manifest, tables, referenced = new Set()) {
  const problems = [];
  const seen = new Map();
  const declare = (name, owner) => {
    if (seen.has(name) && seen.get(name) !== owner) {
      problems.push(`table "${name}" is owned by both ${seen.get(name)} and ${owner}`);
    } else if (seen.has(name)) {
      problems.push(`table "${name}" is listed twice under ${owner}`);
    }
    seen.set(name, owner);
  };
  for (const name of manifest.kernel.tables ?? []) declare(name, KERNEL);
  for (const [entity, def] of Object.entries(manifest.entities)) {
    for (const name of def.tables ?? []) declare(name, entity);
  }
  const known = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    if (!seen.has(t.name)) problems.push(`${t.schema}.${t.name} (${t.kind}) has no owner in entities.manifest.json`);
  }
  for (const name of seen.keys()) {
    if (!known.has(name) && !referenced.has(name)) {
      problems.push(`table "${name}" is declared in entities.manifest.json but neither ${TYPES_FILE} nor any file knows it`);
    }
  }
  return problems;
}

/**
 * The text of the statement that starts at `start` (the index of `.from(`):
 * up to the first `;` at paren depth zero, or the `)` that closes the
 * enclosing expression, or the end of the source.
 */
function statementFrom(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth < 0) return source.slice(start, i);
    } else if (depth === 0 && (ch === ";" || ch === ",")) {
      // A depth-zero comma ends the chain too: siblings inside Promise.all([...])
      // or an object literal must not share one classification.
      return source.slice(start, i);
    } else if (depth === 0 && i > start && source.startsWith(".from(", i)) {
      // The next chain on the same statement starts its own classification.
      return source.slice(start, i);
    }
  }
  return source.slice(start);
}

/** Every `.from("table")` access in a source string: [{ table, write }]. */
export function tableAccesses(source) {
  source = stripComments(source);
  const out = [];
  for (const m of source.matchAll(/\.from\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\)/g)) {
    if (/storage\s*$/.test(source.slice(0, m.index))) continue;
    const statement = statementFrom(source, m.index);
    out.push({ table: m[1], write: WRITE_CALL.test(statement.slice(m[0].length)) });
  }
  return out;
}

/**
 * Every cross-owner access in the tree: { file, from, table, to, write }.
 * Same-owner accesses and reads of kernel tables are not edges; a table the
 * manifest does not own is attributed to "unowned" so it surfaces.
 */
export function collectAccesses(root, manifest = loadManifest(root)) {
  const entries = ownershipEntries(manifest);
  const owners = tableOwners(manifest);
  const edges = [];
  for (const rel of listSourceFiles(root)) {
    const from = entityOf(rel, manifest, entries);
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    for (const { table, write } of tableAccesses(source)) {
      const to = owners[table] ?? "unowned";
      if (to === from) continue;
      if (to === KERNEL && !write) continue;
      edges.push({ file: rel, from, table, to, write });
    }
  }
  return edges;
}

/** Every table name any scanned file accesses, whoever owns it. */
export function referencedTables(root) {
  const names = new Set();
  for (const rel of listSourceFiles(root)) {
    for (const { table } of tableAccesses(fs.readFileSync(path.join(root, rel), "utf8"))) names.add(table);
  }
  return names;
}

/** Per-pair read counts, keys "from->to", sorted. */
export function measure(root, manifest = loadManifest(root)) {
  const counts = {};
  for (const e of collectAccesses(root, manifest)) {
    if (e.write) continue;
    const key = `${e.from}->${e.to}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
}

export function compare(current, baseline) {
  const violations = [];
  for (const [pair, n] of Object.entries(current)) {
    const allowed = baseline[pair] ?? 0;
    if (n > allowed) violations.push(`${pair}: ${n} cross-entity table read(s), baseline allows ${allowed}`);
  }
  return violations;
}

export function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Cross-owner writes not covered by the allowlist, plus stale allowlist entries. */
export function checkWrites(edges, allowlist) {
  const allowed = new Set(allowlist.map((e) => `${e.file} ${e.table}`));
  const seen = new Set();
  const violations = [];
  for (const e of edges) {
    if (!e.write) continue;
    const key = `${e.file} ${e.table}`;
    seen.add(key);
    if (allowed.has(key)) continue;
    violations.push(`${e.file} writes ${e.table}, owned by ${e.to} (file owner: ${e.from})`);
  }
  const stale = allowlist.filter((e) => !seen.has(`${e.file} ${e.table}`));
  return { violations: [...new Set(violations)], stale };
}

export function writeBaseline(root, file = path.join(root, BASELINE_FILE), manifest = loadManifest(root)) {
  const current = measure(root, manifest);
  const existing = loadJson(file);
  const increases = existing ? compare(current, existing) : [];
  if (increases.length > 0) return { written: false, increases, current };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serialize(current));
  return { written: true, current };
}

/** Appends every un-allowlisted cross-owner write with the pre-existing reason. Never removes. */
export function writeAllowlist(root, file = path.join(root, ALLOWLIST_FILE), manifest = loadManifest(root)) {
  const existing = loadJson(file) ?? [];
  const added = [];
  const seen = new Set(existing.map((e) => `${e.file} ${e.table}`));
  for (const e of collectAccesses(root, manifest)) {
    if (!e.write || seen.has(`${e.file} ${e.table}`)) continue;
    seen.add(`${e.file} ${e.table}`);
    added.push({ file: e.file, table: e.table, reason: PREEXISTING_REASON });
  }
  const next = [...existing, ...added].sort((a, b) => (a.file + a.table).localeCompare(b.file + b.table));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serialize(next));
  return { added, total: next.length };
}

export function checkTableOwnership(
  root,
  {
    baselineFile = path.join(root, BASELINE_FILE),
    allowlistFile = path.join(root, ALLOWLIST_FILE),
    typesFile = path.join(root, TYPES_FILE),
    manifest = loadManifest(root),
  } = {},
) {
  const ownership = validateOwnership(manifest, listTables(root, typesFile), referencedTables(root));
  if (ownership.length > 0) return { current: {}, violations: ownership, stale: [] };
  const edges = collectAccesses(root, manifest);
  const current = measure(root, manifest);
  const violations = [];
  const baseline = loadJson(baselineFile);
  if (!baseline) violations.push(`${BASELINE_FILE} is missing; run with --write-baseline to create it`);
  else violations.push(...compare(current, baseline));
  const writes = checkWrites(edges, loadJson(allowlistFile) ?? []);
  violations.push(...writes.violations);
  return { current, violations, stale: writes.stale };
}

function total(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const argv = process.argv.slice(2);

  const explainAt = argv.indexOf("--explain");
  if (explainAt !== -1) {
    const pair = argv[explainAt + 1];
    const [from, to] = (pair ?? "").split("->");
    if (!from || !to) {
      console.error("check-table-ownership: --explain needs a pair such as team->company-os");
      process.exit(2);
    }
    const edges = collectAccesses(root).filter((e) => e.from === from && e.to === to);
    for (const e of edges) console.log(`${e.file} -> ${e.table}${e.write ? " (write)" : ""}`);
    console.log(`\n${edges.length} edge(s) for ${pair}.`);
    return;
  }

  const wantsBaseline = argv.includes("--write-baseline");
  const wantsAllowlist = argv.includes("--write-allowlist");
  if (wantsBaseline || wantsAllowlist) {
    const ownership = validateOwnership(loadManifest(root), listTables(root), referencedTables(root));
    if (ownership.length > 0) {
      for (const line of ownership) console.error(line);
      console.error(`\ncheck-table-ownership: fix table ownership in entities.manifest.json before writing.`);
      process.exit(1);
    }
    if (wantsAllowlist) {
      const res = writeAllowlist(root);
      console.log(
        `check-table-ownership: wrote ${ALLOWLIST_FILE} (${res.added.length} new, ${res.total} total allowlisted writes).`,
      );
    }
    if (wantsBaseline) {
      const res = writeBaseline(root);
      if (!res.written) {
        for (const line of res.increases) console.error(line);
        console.error(
          `\ncheck-table-ownership: refusing to write ${BASELINE_FILE} — it would raise ` +
            `${res.increases.length} pair(s). The baseline only shrinks; read through the ` +
            `owner's index or an RPC.`,
        );
        process.exit(1);
      }
      console.log(
        `check-table-ownership: wrote ${BASELINE_FILE} (${total(res.current)} cross-entity table reads ` +
          `across ${Object.keys(res.current).length} pairs).`,
      );
    }
    return;
  }

  const { violations, current, stale } = checkTableOwnership(root);
  for (const s of stale) {
    console.warn(`${s.file} ${s.table}: allowlist entry matches no cross-entity write (stale — remove it from ${ALLOWLIST_FILE})`);
  }
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    console.error(
      `\ncheck-table-ownership: ${violations.length} problem(s). Every table has one owner; ` +
        `cross-entity reads may not grow and cross-entity writes go through the owner's ` +
        `index or an RPC. Run \`node scripts/check-table-ownership.mjs --explain <pair>\` to ` +
        `list the edges. See the header of scripts/check-table-ownership.mjs.`,
    );
    process.exit(1);
  }
  console.log(
    `check-table-ownership: ${total(current)} cross-entity table reads across ` +
      `${Object.keys(current).length} pairs; nothing above baseline, no unlisted cross-entity writes.`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
