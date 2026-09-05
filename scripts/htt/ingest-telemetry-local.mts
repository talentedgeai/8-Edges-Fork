// Local telemetry ingest: pull one contributor's session telemetry from the
// tracker's `telemetry` branch and write it straight into the htt schema.
//
// Why this exists: the hosted pipeline (GitHub Actions -> /api/ingest/session
// -> two Supabase edge functions) stays dormant until the Phase 4 cutover
// secrets exist (docs/plans/htt/PHASE4-RUNBOOK.md). Until then, a contributor
// can run this from any machine that has `gh` logged in and a `.env.local`
// with the service key. It applies exactly the same rules as the hosted path:
// committer verification, htt.repos resolution (with aliases), client-identity
// exclusion, the per-day GREATEST merge for man-hours, and the same
// idempotency keys, so running it twice, or from two machines, never double
// counts.
//
// Usage (from the repo root):
//   npx --yes tsx --tsconfig tsconfig.json scripts/htt/ingest-telemetry-local.mts
//     [--login <github login>]   default: the `gh` user
//     [--source <owner/repo>]    default: talentedgeai/human-token-tracker
//     [--file <jsonl>]           ingest a local file (e.g. from backfill-local-sessions.py)
//                                instead of the branch; records are trusted as the gh user's
//     [--dry-run]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// .env.local must be loaded BEFORE kernel/data/supabase is imported, so the client
// construction below happens through dynamic imports.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required (see .env.local)");
}

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const source = opt("--source") ?? "talentedgeai/human-token-tracker";
const gh = (...a: string[]) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const login = opt("--login") ?? gh("api", "user", "--jq", ".login").trim();

const { htt } = await import("@/kernel/data/supabase");
const {
  verifyCommitter,
  resolveRepo,
  buildEndBody,
  buildManHourBodies,
  buildHumanEndBody,
  relinkRepoTokens,
} = await import("@/entities/htt");
type TelemetryEntry = import("@/entities/htt").TelemetryEntry;

const entries: TelemetryEntry[] = [];
const file = opt("--file");
if (file) {
  // Local file: the records were produced on this machine by the same person
  // who is running the ingest, so the committer check is satisfied by fiat.
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (t) entries.push({ ...(JSON.parse(t) as TelemetryEntry), committer_login: login });
  }
  console.log(`${file}: ${entries.length} record(s) for ${login}${dryRun ? " (dry run)" : ""}`);
} else {
// 1) Every telemetry/<owner>/<repo>/<login>/*.jsonl file on the branch.
const tree = JSON.parse(gh("api", `repos/${source}/git/trees/telemetry?recursive=1`)) as {
  tree: Array<{ path: string; type: string }>;
};
const files = tree.tree
  .filter((t) => t.type === "blob")
  .map((t) => t.path)
  .filter((p) => new RegExp(`^telemetry/[^/]+/[^/]+/${login}/[^/]+\\.jsonl$`, "i").test(p));
console.log(`${source}@telemetry: ${files.length} file(s) for ${login}${dryRun ? " (dry run)" : ""}`);

// 2) Read each file and attach the login of whoever last committed it. The
// hosted path takes this from `git log`; here the commits API is the same fact.
for (const path of files) {
  const content = Buffer.from(
    gh("api", `repos/${source}/contents/${path}?ref=telemetry`, "--jq", ".content"),
    "base64",
  ).toString("utf8");
  const committer =
    gh("api", `repos/${source}/commits?sha=telemetry&path=${path}&per_page=1`, "--jq", ".[0].author.login // .[0].committer.login // empty").trim() || null;
  let n = 0;
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push({ ...(JSON.parse(t) as TelemetryEntry), committer_login: committer ?? "" });
      n++;
    } catch {
      // A malformed line is skipped, never fatal, same as the hosted ingest.
    }
  }
  console.log(`  ${path}: ${n} record(s), committed by ${committer ?? "unknown"}`);
}
}

// 3) Person + exclusion checks, mirroring the edge functions.
const personCache = new Map<string, string | null>();
async function resolvePerson(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  if (personCache.has(key)) return personCache.get(key) ?? null;
  const { data, error } = await htt.rpc("resolve_contributor", { p_email: email });
  if (error) throw new Error(`resolve_contributor: ${error.message}`);
  const id = (data as string | null) ?? null;
  personCache.set(key, id);
  return id;
}
async function isClientIdentity(email?: string, ghLogin?: string): Promise<boolean> {
  if (email) {
    const { data, error } = await htt.from("client_identities").select("id").ilike("git_email", email).limit(1).maybeSingle();
    if (error) throw new Error(`client_identities: ${error.message}`);
    if (data) return true;
  }
  if (ghLogin) {
    const { data, error } = await htt.from("client_identities").select("id").ilike("github_login", ghLogin).limit(1).maybeSingle();
    if (error) throw new Error(`client_identities: ${error.message}`);
    if (data) return true;
  }
  return false;
}

// Same as ingest-session-start: one auto_session row per (person, repo, day),
// carrying the GREATEST hours seen, so a re-run or a second machine merges.
async function writeManHours(body: ReturnType<typeof buildManHourBodies>[number], personId: string | null) {
  let sel = htt
    .from("man_hour_entries")
    .select("id, hours")
    .eq("source", "auto_session")
    .eq("occurred_on", body.occurred_on)
    .eq("repo_id", body.repo_id);
  sel = personId === null ? sel.is("person_id", null) : sel.eq("person_id", personId);
  const { data: existing, error } = await sel;
  if (error) throw new Error(`man_hour_entries select: ${error.message}`);
  const existingMax = (existing ?? []).reduce((m, r) => Math.max(m, Number(r.hours) || 0), 0);
  const target = Math.max(existingMax, body.hours);
  if (dryRun) return;
  if ((existing ?? []).length > 0) {
    const { error: delErr } = await htt.from("man_hour_entries").delete().in("id", (existing ?? []).map((r) => r.id));
    if (delErr) throw new Error(`man_hour_entries delete: ${delErr.message}`);
  }
  const { error: insErr } = await htt.from("man_hour_entries").insert({
    person_id: personId,
    company_id: body.company_id,
    repo_id: body.repo_id,
    primary_role: null,
    hours: target,
    occurred_on: body.occurred_on,
    occurred_hour: 0,
    started_at: body.started_at ?? null,
    source: "auto_session",
    status: "recorded",
  });
  if (insErr) throw new Error(`man_hour_entries insert: ${insErr.message}`);
}

// Same as ingest-session-end: token rows keyed by (session_id, kind) for
// Claude sessions and (person, repo, day, kind) for daily human effort.
async function writeTokens(
  body: NonNullable<ReturnType<typeof buildEndBody> | ReturnType<typeof buildHumanEndBody>>,
  personId: string | null,
) {
  const common = {
    company_id: body.company_id,
    repo_id: body.repo_id,
    pull_request_id: null,
    session_branch: body.session_branch ?? null,
    person_id: personId,
    source: body.source,
    occurred_at: body.occurred_at,
    occurred_on: "occurred_on" in body ? body.occurred_on : null,
    status: "recorded",
  };
  const sessionId = "session_id" in body ? body.session_id : null;
  const rows: Array<Record<string, unknown>> = [];
  if (body.human_tokens > 0) rows.push({ ...common, kind: "human", amount: body.human_tokens, session_id: sessionId });
  if (body.claude_tokens > 0) rows.push({ ...common, kind: "claude", amount: body.claude_tokens, session_id: sessionId });
  if (rows.length === 0 || dryRun) return rows.length;
  const onConflict = sessionId ? "session_id,kind" : "person_id,repo_id,occurred_on,kind";
  const { error } = await htt.from("token_entries").upsert(rows, { onConflict });
  if (error) throw new Error(`token_entries upsert: ${error.message}`);
  return rows.length;
}

// 4) Apply.
let linked = 0, skippedRepo = 0, rejected = 0, skippedNoKey = 0, excluded = 0, rows = 0;
const skippedRepos = new Set<string>();
const touched = new Set<string>();
for (const e of entries) {
  if (!verifyCommitter(e)) { rejected++; continue; }
  const ids = await resolveRepo(e.repo_full_name);
  if (!ids) { skippedRepo++; skippedRepos.add(e.repo_full_name); continue; }
  if (await isClientIdentity(e.author_email, e.github_login)) { excluded++; continue; }
  const personId = await resolvePerson(e.author_email);
  if (e.record_type === "human") {
    for (const mh of buildManHourBodies(e, ids)) await writeManHours(mh, personId);
    const body = buildHumanEndBody(e, ids);
    if (!body) { skippedNoKey++; continue; }
    rows += await writeTokens(body, personId);
  } else {
    const body = buildEndBody(e, ids);
    if (!body) { skippedNoKey++; continue; }
    rows += await writeTokens(body, personId);
  }
  linked++;
  touched.add(ids.repoId);
}

let relinked = 0;
if (!dryRun) {
  for (const repoId of touched) relinked += await relinkRepoTokens(repoId);
  const { error } = await htt.from("sync_runs").insert({
    prs_upserted: 0,
    projects_synced: linked,
    unattributed: skippedRepo,
    errors: [{ message: `local telemetry ingest by ${login} from ${file ?? source}` }],
    finished_at: new Date().toISOString(),
  });
  if (error) console.warn(`sync_runs: ${error.message}`);
}

console.log(JSON.stringify({ entries: entries.length, linked, rowsWritten: rows, rejected, excluded, skippedNoKey, skippedRepo, relinked, unattributedPerson: [...personCache.values()].filter((v) => v === null).length }, null, 1));
if (skippedRepos.size) console.log("not onboarded in htt.repos:", [...skippedRepos].join(", "));
