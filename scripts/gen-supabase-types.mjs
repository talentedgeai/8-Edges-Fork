// Regenerates kernel/data/supabase/database.types.ts from the live Supabase project, or
// (with --check) verifies the committed file still matches what the CLI emits.
//
// Both modes shell out to the same command with the same flags, so the only way
// the check can drift from the generator is by editing this file. `--check`
// exits non-zero when the schema has moved on without a regeneration, which is
// the whole point: the types are a snapshot of the database and a stale
// snapshot is worse than none because it type-checks against columns that no
// longer exist.
//
// Requires the Supabase CLI (`supabase`) on PATH plus ONE of:
//   SUPABASE_DB_URL   a Postgres connection string; the CLI reads the schema
//                     directly and needs no Supabase account. This is what CI
//                     uses (repository secret), because the only alternative is
//                     a personal access token tied to one person's account.
//                     Use the session-mode POOLER url from the dashboard
//                     (…pooler.supabase.com:5432, user postgres.<ref>): GitHub
//                     runners are IPv4-only and the direct db.<ref>.supabase.co
//                     host resolves to IPv6 unless the IPv4 add-on is bought.
//   a login session   `supabase login` locally, then --project-id (default).
// Missing credentials are a hard failure, never a skip — a gate that passes
// when it cannot run is not a gate.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "kernel", "data", "supabase", "database.types.ts");
const PROJECT_ID = "wwchefrgkkxmhlkntufm";
const SCHEMAS = "public,company_os,htt";

const HEADER = `// GENERATED FILE — do not edit by hand.
//
// Produced by \`npm run gen:types\` (scripts/gen-supabase-types.mjs), which runs
//   supabase gen types typescript --project-id ${PROJECT_ID} --schema ${SCHEMAS}
// and prepends this header. \`npm run check:types-fresh\` (CI job \`types-fresh\`)
// fails when the live schema no longer matches this file; regenerate and commit.
//
// The Supabase CLI output is deterministic for a given schema (verified by
// running it twice and comparing byte-for-byte), so a diff here means the
// database changed, not the tool. The generator's __InternalSupabase version
// block is stripped so the hosted and db-url paths produce the same bytes.

`;

// The hosted generator (`--project-id`) prepends a `__InternalSupabase` block carrying the
// PostgREST version; the database generator (`--db-url`, which CI uses) does not. The block
// only lets supabase-js pick a client option and changes with every PostgREST upgrade, so
// it is dropped from both paths to keep the committed file identical however it was made.
function stripInternalVersion(text) {
  return text.replace(
    /\n  \/\/ Allows to automatically instantiate createClient[^\n]*\n  \/\/ instead of createClient[^\n]*\n  __InternalSupabase: \{\n    PostgrestVersion: "[^"]*"\n  \}\n/,
    "\n",
  );
}

// Newer CLI builds wrap the generic-helper conditional types in parentheses
// (`TableName extends (X extends {…} ? … : never) = never`); older ones and the
// hosted generator do not. The two are the same type, and the difference
// re-appeared on main every time a developer regenerated locally (2026-09-05
// twice), so the parenthesised form is folded to the bare one here.
function stripHelperParens(text) {
  return text
    .replace(/ extends \(((?:DefaultSchema|Public)\w+) extends \{/g, " extends $1 extends {")
    .replace(/\n(\s+): never\) = never,/g, "\n$1: never = never,");
}

function generate() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const source = dbUrl ? ["--db-url", dbUrl] : ["--project-id", PROJECT_ID];
  const result = spawnSync(
    "supabase",
    ["gen", "types", "typescript", ...source, "--schema", SCHEMAS],
    { encoding: "utf8", env: process.env },
  );
  if (result.error) {
    console.error(
      `gen-supabase-types: could not run the Supabase CLI (${result.error.message}). ` +
        "Install it (https://supabase.com/docs/guides/cli) and retry.",
    );
    process.exit(2);
  }
  if (result.status !== 0 || !result.stdout.trim()) {
    console.error(
      dbUrl
        ? "gen-supabase-types: `supabase gen types --db-url` failed. Check the SUPABASE_DB_URL " +
            "secret: it must be the session-mode pooler url with the database password filled in."
        : "gen-supabase-types: `supabase gen types` failed. Locally run `supabase login`, or set " +
            "SUPABASE_DB_URL; in CI the SUPABASE_DB_URL secret must be added by a human.",
    );
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(2);
  }
  // Normalise line endings and guarantee a single trailing newline so the
  // committed file is byte-stable across platforms.
  const body = stripHelperParens(
    stripInternalVersion(result.stdout.replace(/\r\n/g, "\n").replace(/\s*$/, "\n")),
  );
  return HEADER + body;
}

const check = process.argv.includes("--check");
const fresh = generate();

if (!check) {
  writeFileSync(OUTPUT, fresh);
  console.log(`gen:types: wrote ${OUTPUT}`);
  process.exit(0);
}

let committed;
try {
  committed = readFileSync(OUTPUT, "utf8");
} catch {
  console.error(
    `check:types-fresh: ${OUTPUT} is missing. Run \`npm run gen:types\` and commit it.`,
  );
  process.exit(1);
}

if (committed === fresh) {
  console.log("check:types-fresh: kernel/data/supabase/database.types.ts matches the live schema.");
  process.exit(0);
}

const a = committed.split("\n");
const b = fresh.split("\n");
let first = 0;
while (first < a.length && first < b.length && a[first] === b[first]) first++;
console.error(
  "check:types-fresh: kernel/data/supabase/database.types.ts is stale — the live schema differs " +
    `(first difference at line ${first + 1}; committed ${a.length} lines, generated ${b.length}).\n` +
    "Run `npm run gen:types` and commit the result.",
);
// Show the first few differing lines from each side so a CI failure is diagnosable
// without reproducing the generator locally, and keep the whole fresh output where the
// workflow can upload it as an artifact.
const context = 4;
console.error("--- committed");
console.error(a.slice(first, first + context).join("\n"));
console.error("+++ generated");
console.error(b.slice(first, first + context).join("\n"));
const out = process.env.TYPES_FRESH_OUT;
if (out) {
  writeFileSync(out, fresh);
  console.error(`check:types-fresh: fresh output written to ${out}`);
}
process.exit(1);
