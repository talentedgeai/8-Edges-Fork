#!/usr/bin/env node
// Human Token Tracker to edge8, Phase 2 data copy generator.
// Reads the tracker table exports (JSON files from `supabase db query --linked "select * from public.<t>"`,
// one per table, in the directory given as argv[2]) plus phase2-identity-map.json, and writes a single
// idempotent SQL file (argv[3]) that:
//   1. flags the 5 companies is_ai_program=true, backfills people.github_login,
//      inserts company_github_orgs and person_git_emails (source='discovered'),
//   2. creates one company_os.ai_programs row per tracker project (deterministic
//      uuid passed in, so re-runs upsert), one htt.repos row per project keeping
//      the tracker project uuid as the repo id,
//   3. copies pull_requests, token_entries, man_hour_entries, client_identities,
//      pr_attribution_overrides, sync_runs, project_summaries, goal_events keeping
//      original uuids (ON CONFLICT (id) DO NOTHING),
//   4. copies project_goals and token_allocations ordered by original seq (identity
//      columns re-generate; order preserves "latest seq wins").
// Usage: node scripts/htt/phase2-copy.mjs <tracker-data-dir> <out.sql>
// Apply with: supabase db query --linked -f <out.sql>   (edge8-linked worktree)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const [dataDir, outFile] = process.argv.slice(2);
if (!dataDir || !outFile) {
  console.error("usage: node phase2-copy.mjs <tracker-data-dir> <out.sql>");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(join(here, "phase2-identity-map.json"), "utf8"));

const load = (t) => {
  const s = readFileSync(join(dataDir, `${t}.json`), "utf8");
  return JSON.parse(s.slice(s.indexOf("{"))).rows;
};
const companyOf = (clientId) => {
  const m = map.companies[clientId];
  if (!m) throw new Error(`unmapped client ${clientId}`);
  return m.edge8_company_id;
};
const personOf = (memberId) => {
  if (memberId == null) return null;
  const m = map.team_members[memberId];
  if (!m) throw new Error(`unmapped team member ${memberId}`);
  return m.edge8_person_id;
};
// Deterministic uuid v5-style (sha1-based) so re-running the generator yields identical ids.
const detUuid = (label) => {
  const h = createHash("sha1").update(`htt-phase2:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const jsonb = (v) => ({ __jsonb: v ?? [] });
const q = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object" && v.__jsonb !== undefined)
    return `'${JSON.stringify(v.__jsonb).replace(/'/g, "''")}'::jsonb`;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `array[${v.map(q).join(",")}]::text[]`;
  if (typeof v === "object") return `${q(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
// Statement separator: the Management API caps request size, so the output is
// split into multiple files at these boundaries (never inside a statement).
const SEP = "\n--<<STMT>>--\n";
const insert = (table, cols, rows, conflict) => {
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  const chunks = [];
  for (let i = 0; i < rows.length; i += 500) {
    const vals = rows
      .slice(i, i + 500)
      .map((r) => `(${cols.map((c) => q(r[c])).join(",")})`)
      .join(",\n");
    chunks.push(
      `insert into ${table} (${cols.join(",")})\nvalues\n${vals}\n${conflict ?? ""};\n`
    );
  }
  return `-- ${table}: ${rows.length} rows\n` + chunks.join(SEP) + SEP;
};

const clients = load("clients");
const members = load("team_members");
const projects = load("projects");
const prs = load("pull_requests");
const tokenEntries = load("token_entries");
const manHours = load("man_hour_entries");
const clientIdentities = load("client_identities");
const aliases = load("contributor_aliases");
const overrides = load("pr_attribution_overrides");
const syncRuns = load("sync_runs");
const goals = load("project_goals");
const goalEvents = load("goal_events");
const summaries = load("project_summaries");
const allocations = load("token_allocations");

// pull_requests.author_human_user_id may hold a team_members.id or a team_members.user_id.
const byMemberId = new Map(members.map((m) => [m.id, m.id]));
const byUserId = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id, m.id]));
const authorPerson = (v) => {
  if (!v) return null;
  const memberId = byMemberId.get(v) ?? byUserId.get(v);
  return memberId ? personOf(memberId) : null;
};

const programStatus = (s) =>
  ["active", "ramping", "paused"].includes(s) ? "active" : ["complete", "archived"].includes(s) ? "complete" : "draft";

let sql = `-- Applied via Supabase Management API (supabase db query --linked, role postgres).
-- Human Token Tracker integration, Phase 2: tracker -> edge8 data copy.
-- Generated by scripts/htt/phase2-copy.mjs from a point-in-time tracker export.
-- Idempotent: identity rows upsert, data rows ON CONFLICT (id) DO NOTHING,
-- seq-ordered ledgers guarded by an emptiness check. Split into numbered files
-- (API request-size cap); apply in order, re-apply safe.

-- 1) companies touched become AI-program companies
update company_os.companies set is_ai_program = true
 where id in (${[...new Set(clients.map((c) => companyOf(c.id)))].map(q).join(",")});

`;

// people.github_login backfill (only members that carry a login in the map)
for (const [memberId, m] of Object.entries(map.team_members)) {
  if (!m.github_login) continue;
  sql += `update company_os.people set github_login = ${q(m.github_login)} where id = ${q(m.edge8_person_id)} and github_login is null;\n`;
}
sql += "\n-- company_github_orgs (unambiguous orgs only, see identity map)\n";
sql += insert(
  "company_os.company_github_orgs",
  ["id", "company_id", "org_login"],
  Object.entries(map.github_orgs)
    .filter(([k]) => k !== "comment")
    .map(([org, companyId]) => ({ id: detUuid(`org:${org}`), company_id: companyId, org_login: org })),
  "on conflict (org_login) do nothing"
);

sql += "\n-- person_git_emails from tracker contributor_aliases (source='discovered')\n";
sql += insert(
  "company_os.person_git_emails",
  ["id", "person_id", "git_email", "source"],
  aliases.map((a) => ({
    id: detUuid(`alias:${a.git_email}`),
    person_id: personOf(a.team_member_id),
    git_email: a.git_email,
    source: "discovered",
  })),
  "on conflict (git_email) do nothing"
);

sql += "\n-- 2) one AI Program per tracker project (deterministic ids), then htt.repos keeping project uuids\n";
sql += insert(
  "company_os.ai_programs",
  ["id", "company_id", "name", "status", "repo_url", "github_repo", "github_repo_id", "created_by"],
  projects.map((p) => ({
    id: detUuid(`program:${p.id}`),
    company_id: companyOf(p.client_id),
    name: p.name,
    status: programStatus(p.status),
    repo_url: p.github_repo ? `https://github.com/${p.github_repo}` : null,
    github_repo: p.github_repo,
    github_repo_id: p.github_repo_id,
    created_by: "htt-phase2",
  })),
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.repos",
  ["id", "ai_program_id", "company_id", "slug", "name", "github_repo", "github_repo_id", "github_repo_aliases",
   "roi_metric_name", "roi_metric_unit", "roi_metric_baseline", "roi_metric_target", "roi_metric_period",
   "started_at", "ended_at", "status", "last_synced_at", "live_url", "created_by", "created_at", "updated_at"],
  projects.map((p) => ({
    ...p,
    ai_program_id: detUuid(`program:${p.id}`),
    company_id: companyOf(p.client_id),
    github_repo_aliases: p.github_repo_aliases ?? [],
    created_by: p.created_by == null ? null : String(p.created_by),
  })),
  "on conflict (id) do nothing"
);

sql += "\n-- 3) data tables, original uuids kept\n";
sql += insert(
  "htt.pull_requests",
  ["id", "repo_id", "github_pr_id", "number", "title", "author_login", "author_person_id", "url", "state",
   "status", "opened_at", "merged_at", "closed_at", "head_branch", "created_by", "created_at", "updated_at"],
  prs.map((r) => ({
    ...r,
    repo_id: r.project_id,
    author_person_id: authorPerson(r.author_human_user_id),
    created_by: r.created_by == null ? null : String(r.created_by),
  })),
  "on conflict (id) do nothing"
);
// Person merges (two tracker members resolving to one person) can collide on the
// (person_id, repo_id, occurred_on, kind) unique index. Merge those rows by summing
// amount into the first row (NULL components never conflict, so only full keys merge).
const mappedTokenEntries = tokenEntries.map((r) => ({
  ...r,
  company_id: companyOf(r.client_id),
  repo_id: r.project_id,
  person_id: personOf(r.team_member_id),
  created_by: r.created_by == null ? null : String(r.created_by),
}));
const byDayKey = new Map();
const mergedTokenEntries = [];
for (const r of mappedTokenEntries) {
  const parts = [r.person_id, r.repo_id, r.occurred_on, r.kind];
  if (parts.some((x) => x == null)) { mergedTokenEntries.push(r); continue; }
  const k = parts.join("|");
  const prev = byDayKey.get(k);
  if (prev) {
    prev.amount = Number(prev.amount) + Number(r.amount);
    console.log(`merged token_entry ${r.id} into ${prev.id} (${k}, summed amount)`);
  } else {
    byDayKey.set(k, r);
    mergedTokenEntries.push(r);
  }
}
sql += insert(
  "htt.token_entries",
  ["id", "company_id", "repo_id", "pull_request_id", "person_id", "kind", "amount", "source", "occurred_at",
   "occurred_on", "status", "session_branch", "session_id", "created_by", "created_at", "updated_at"],
  mergedTokenEntries,
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.man_hour_entries",
  ["id", "person_id", "company_id", "repo_id", "primary_role", "hours", "occurred_on", "occurred_hour",
   "source", "description", "rate_cents", "currency", "status", "started_at", "created_by", "created_at", "updated_at"],
  manHours.map((r) => ({
    ...r,
    person_id: personOf(r.team_member_id),
    company_id: companyOf(r.client_id),
    repo_id: r.project_id,
    created_by: r.created_by == null ? null : String(r.created_by),
  })),
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.client_identities",
  ["id", "repo_id", "git_email", "github_login", "label", "created_at"],
  clientIdentities.map((r) => ({ ...r, repo_id: r.project_id })),
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.pr_attribution_overrides",
  ["id", "pull_request_id", "repo_id", "kind", "started_at", "reason", "corrected_by", "revoked_at", "revoked_by", "created_at"],
  overrides.map((r) => ({ ...r, repo_id: r.project_id, corrected_by: String(r.corrected_by) })),
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.sync_runs",
  ["id", "started_at", "finished_at", "projects_synced", "prs_upserted", "unattributed", "errors", "backfill"],
  syncRuns.map((r) => ({ ...r, errors: jsonb(r.errors) })),
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.project_summaries",
  ["id", "repo_id", "kind", "content", "as_of", "source_key", "model", "generated_at"],
  summaries.map((r) => ({ ...r, repo_id: r.project_id })),
  "on conflict (id) do nothing"
);
sql += insert(
  "htt.goal_events",
  ["id", "repo_id", "state", "object", "count", "occurred_on", "recorded_by", "created_at"],
  goalEvents.map((r) => ({ ...r, repo_id: r.project_id, recorded_by: String(r.recorded_by) })),
  "on conflict (id) do nothing"
);

sql += `\n-- 4) seq-ordered ledgers: identity re-generates seq; insertion order preserves "latest wins".
-- Guarded so a re-run does not duplicate the ledger.
do $$
begin
  if not exists (select 1 from htt.project_goals) then
`;
for (const r of [...goals].sort((a, b) => Number(a.seq) - Number(b.seq))) {
  sql += `    insert into htt.project_goals (id, repo_id, metric, unit, period, quantity, source, source_key, set_by, state, created_at)
      values (${q(r.id)}, ${q(r.project_id)}, ${q(r.metric)}, ${q(r.unit)}, ${q(r.period)}, ${q(r.quantity)}, ${q(r.source)}, ${q(r.source_key)}, ${q(String(r.set_by))}, ${q(r.state)}, ${q(r.created_at)});\n`;
}
sql += `  end if;
  if not exists (select 1 from htt.token_allocations) then
`;
for (const r of [...allocations].sort((a, b) => Number(a.seq) - Number(b.seq))) {
  sql += `    insert into htt.token_allocations (id, company_id, tokens, set_by_email, set_at)
      values (${q(r.id)}, ${q(companyOf(r.client_id))}, ${q(r.tokens)}, ${q(r.set_by_email)}, ${q(r.set_at)});\n`;
}
sql += `  end if;
end $$;
`;

// Split at statement boundaries into files under the API request cap.
const MAX = 700 * 1024;
const pieces = sql.split(SEP);
const files = [];
let buf = "";
for (const piece of pieces) {
  if (buf && buf.length + piece.length > MAX) { files.push(buf); buf = ""; }
  buf += piece;
}
if (buf.trim()) files.push(buf);
files.forEach((content, i) => {
  const path = outFile.replace(/\.sql$/, `.${String(i + 1).padStart(2, "0")}.sql`);
  writeFileSync(path, content);
  console.log(`wrote ${path} (${(content.length / 1024).toFixed(0)}KB)`);
});
console.log(`rows: programs=${projects.length} repos=${projects.length} prs=${prs.length} token_entries=${tokenEntries.length} man_hours=${manHours.length} identities=${clientIdentities.length} aliases=${aliases.length} overrides=${overrides.length} sync_runs=${syncRuns.length} goals=${goals.length} goal_events=${goalEvents.length} summaries=${summaries.length} allocations=${allocations.length}`);
