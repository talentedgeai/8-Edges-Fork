// Ported from the Human Token Tracker (website/scripts/ingest-telemetry.mjs).
// Re-pointed for edge8: the default telemetry repo is talentedgeai/edge8-web
// (contributors commit telemetry/**/*.jsonl to this repo's `telemetry` branch),
// and the POST target carries a trailing slash because edge8-web builds with
// trailingSlash: true (a slashless POST would 308 and the run could stall).
// Run by .github/workflows/htt-ingest-telemetry.yml.

export function collectEntries(filesByPath, committerFor) {
  const out = [];
  for (const [path, content] of Object.entries(filesByPath)) {
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push({ ...JSON.parse(t), committer_login: committerFor(path) });
      } catch {
        /* skip malformed line: resilience */
      }
    }
  }
  return out;
}

const BRANCH = 'telemetry';
const TAG = 'telemetry-ingested';
const REPO = process.env.GITHUB_REPOSITORY ?? 'talentedgeai/edge8-web';
// Small enough that one batch's sequential edge-function calls finish inside
// the route's maxDuration even on a cold backlog.
const BATCH = 25;

async function main() {
  const { execSync } = await import('node:child_process');
  // Resolve repo root once so all git commands work regardless of the cwd the
  // workflow sets.
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: repoRoot }).trim();

  const url = process.env.INGEST_URL;
  const secret = process.env.INGEST_TRIGGER_SECRET;
  if (!url || !secret) throw new Error('INGEST_URL and INGEST_TRIGGER_SECRET are required');

  sh(`git fetch origin ${BRANCH} --tags`);
  const head = sh(`git rev-parse origin/${BRANCH}`);
  let base;
  try { base = sh(`git rev-parse ${TAG}`); }
  catch { base = sh('git hash-object -t tree /dev/null'); } // first run: empty tree, all files

  if (base === head) { console.log('telemetry: nothing new'); return; }

  const files = sh(`git diff --name-only ${base} ${head} -- 'telemetry/**/*.jsonl'`)
    .split('\n').map((s) => s.trim()).filter(Boolean);
  if (files.length === 0) { console.log('telemetry: no telemetry files changed'); }

  // committerFor(path) = GitHub login of the commit that last touched the file
  // on the telemetry branch. This is the integrity source: a contributor can
  // only log for themselves because they commit their own file under their own
  // GitHub identity.
  const loginCache = {};
  const committerFor = (path) => {
    const sha = sh(`git log -1 --format=%H ${head} -- "${path}"`);
    if (sha in loginCache) return loginCache[sha];
    let login = null;
    try { login = sh(`gh api repos/${REPO}/commits/${sha} --jq '.author.login // .committer.login'`) || null; }
    catch { login = null; }
    loginCache[sha] = login;
    return login;
  };

  const filesByPath = {};
  for (const f of files) filesByPath[f] = sh(`git show ${head}:${f}`);
  const entries = collectEntries(filesByPath, committerFor);

  // Post one batch, retrying on a transient 5xx. The ingest is idempotent
  // (tokens dedup on session_id; man-hours merge on person/repo/day), so
  // re-posting a batch is safe.
  const MAX_ATTEMPTS = 4;
  const postBatch = async (batch) => {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Trailing slash is REQUIRED: edge8-web sets trailingSlash: true, so the
      // slashless path answers 308.
      const res = await fetch(`${url.replace(/\/$/, '')}/api/ingest/session/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify(batch),
      });
      if (res.ok) return res.json();
      const body = await res.text();
      // 4xx is a real rejection (bad request/auth): do not retry. Only 5xx is transient.
      if (res.status < 500) throw new Error(`ingest POST failed: ${res.status} ${body}`);
      lastErr = `ingest POST failed: ${res.status} ${body}`;
      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = 2000 * attempt;
        console.log(`  batch attempt ${attempt}/${MAX_ATTEMPTS} got ${res.status}; retrying in ${backoffMs}ms`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw new Error(`${lastErr} (after ${MAX_ATTEMPTS} attempts)`);
  };

  let linked = 0, skipped = 0, rejected = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const r = await postBatch(batch);
    linked += r.linked ?? 0; skipped += r.skipped ?? 0; rejected += r.rejected ?? 0;
    console.log(`batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(entries.length / BATCH)}: linked=${linked} skipped=${skipped} rejected=${rejected}`);
  }
  console.log(`telemetry ingested: ${entries.length} entries: linked=${linked} skipped=${skipped} rejected=${rejected}`);

  // Advance the watermark only after a fully successful run, and publish it.
  // (This force-push touches ONLY the telemetry watermark tag, never a branch.)
  sh(`git tag -f ${TAG} ${head}`);
  sh(`git push origin ${TAG} --force`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
