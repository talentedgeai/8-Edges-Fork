/**
 * process-registrations.mjs (edge8 port)
 *
 * Ported from the Human Token Tracker (website/scripts/process-registrations.mjs)
 * and re-pointed to the edge8 identity spine. Reads
 * `registrations/<owner>__<repo>.json` files from this repo's `telemetry`
 * branch, verifies the git committer matches the request's `github_login`,
 * then applies the registration idempotently via the Supabase service role:
 *
 *   tracker clients   -> company_os.companies (upsert by name; is_ai_program true)
 *   tracker projects  -> company_os.ai_programs (one per repo) + htt.repos (1:1)
 *   client_identities -> htt.client_identities (repo-scoped excludes)
 *   contributor_aliases -> company_os.person_git_emails (source 'discovered')
 *
 * Idempotency / "mark processed": after a successful apply the file is DELETED
 * from the telemetry branch with a commit "registered: <repo>", so a repeat
 * run simply finds nothing to do.
 *
 * Environment variables required:
 *   SUPABASE_URL               - edge8 project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - service role key (bypasses RLS)
 *   GITHUB_REPOSITORY          - owner/repo of this repo (set by GH Actions)
 *   GH_TOKEN / GITHUB_TOKEN    - used implicitly by `gh` CLI
 */

// ── Pure helpers (exported for testing) ─────────────────────────────────────

/** Slugify a name for htt.repos.slug. e.g. "Fair Pay Engine" -> "fair-pay-engine" */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validate the shape of a registration request JSON object.
 * Returns null if valid, or a string describing the problem.
 */
export function validateRequest(req) {
  if (!req || typeof req !== 'object') return 'not an object';
  if (typeof req.repo_full_name !== 'string' || !req.repo_full_name.includes('/'))
    return 'invalid repo_full_name';
  if (typeof req.github_login !== 'string' || !req.github_login)
    return 'missing github_login';
  if (req.type !== 'personal' && req.type !== 'client')
    return 'type must be "personal" or "client"';
  if (typeof req.project_name !== 'string' || !req.project_name)
    return 'missing project_name';
  if (!req.client || typeof req.client !== 'object')
    return 'missing client object';
  if (typeof req.client.name !== 'string' || !req.client.name)
    return 'missing client.name';
  return null;
}

// ── Core apply logic (exported for testing) ─────────────────────────────────

/**
 * Apply a single validated registration request.
 *
 * @param {object} req      - The parsed registration request
 * @param {object} supabase - Supabase service-role client (root; .schema() used per call)
 * @returns {{ status: 'applied'|'noop', notes: string[] }}
 */
export async function applyRegistration(req, supabase) {
  const notes = [];
  const companyOs = supabase.schema('company_os');
  const htt = supabase.schema('htt');

  // 1. Upsert company by name; flag it as an AI-program company.
  let companyId;
  {
    const { data: existing } = await companyOs
      .from('companies')
      .select('id, is_ai_program')
      .eq('name', req.client.name)
      .maybeSingle();

    if (existing) {
      companyId = existing.id;
      notes.push(`company exists: ${req.client.name} (${companyId})`);
      if (!existing.is_ai_program) {
        await companyOs.from('companies').update({ is_ai_program: true }).eq('id', companyId);
        notes.push('company flagged is_ai_program');
      }
    } else {
      const { data: inserted, error } = await companyOs
        .from('companies')
        .insert({ name: req.client.name, is_ai_program: true })
        .select('id')
        .single();
      if (error) throw new Error(`insert company failed: ${error.message}`);
      companyId = inserted.id;
      notes.push(`company created: ${req.client.name} (${companyId})`);
    }
  }

  // 2. Upsert the repo. Spine: 1 repo = 1 AI Program = 1 htt.repos row.
  //    If a htt.repos row already exists for this github_repo: no-op.
  let repoId;
  {
    const { data: existing } = await htt
      .from('repos')
      .select('id')
      .eq('github_repo', req.repo_full_name)
      .maybeSingle();

    if (existing) {
      notes.push(`repo already registered for ${req.repo_full_name}: no-op`);
      return { status: 'noop', notes };
    }

    // `ai_programs` is owned by the portal entity (entities.manifest.json);
    // app code goes through its writer, but this script is tooling and cannot
    // import TypeScript, so it writes the table raw under the same shape.
    const { data: program, error: progErr } = await companyOs
      .from('ai_programs')
      .insert({
        company_id: companyId,
        name: req.project_name,
        status: 'active',
        github_repo: req.repo_full_name,
        repo_url: `https://github.com/${req.repo_full_name}`,
        created_by: 'htt-registration',
      })
      .select('id')
      .single();
    if (progErr) throw new Error(`insert ai_program failed: ${progErr.message}`);
    notes.push(`ai_program created: ${req.project_name} (${program.id})`);

    const { data: inserted, error } = await htt
      .from('repos')
      .insert({
        ai_program_id: program.id,
        company_id: companyId,
        name: req.project_name,
        slug: slugify(req.project_name),
        github_repo: req.repo_full_name,
        status: 'active',
        created_by: 'htt-registration',
      })
      .select('id')
      .single();
    if (error) throw new Error(`insert htt.repos failed: ${error.message}`);
    repoId = inserted.id;
    notes.push(`repo created: ${req.repo_full_name} (${repoId})`);
  }

  // 3. For client-type requests: insert exclude_identities into htt.client_identities.
  if (req.type === 'client' && Array.isArray(req.exclude_identities)) {
    for (const identity of req.exclude_identities) {
      const { git_email, github_login, label } = identity;
      const { data: existing } = await htt
        .from('client_identities')
        .select('id')
        .eq('repo_id', repoId)
        .ilike('git_email', git_email ?? '')
        .maybeSingle();

      if (!existing) {
        const { error } = await htt.from('client_identities').insert({
          repo_id: repoId,
          git_email: git_email ?? null,
          github_login: github_login ?? null,
          label: label ?? null,
        });
        if (error) {
          notes.push(`WARN: insert client_identity failed for ${git_email}: ${error.message}`);
        } else {
          notes.push(`client_identity added: ${git_email}`);
        }
      } else {
        notes.push(`client_identity already present: ${git_email}`);
      }
    }
  }

  // 4. Attempt to resolve the submitter as a person and, if found, record their
  //    committing email in company_os.person_git_emails (source 'discovered')
  //    if it isn't already there. The caller passes it via req._committer_email.
  const committerEmail = req._committer_email ?? null;
  if (committerEmail) {
    const { data: resolved } = await htt.rpc('resolve_contributor', { p_email: committerEmail });
    if (resolved) {
      const { data: aliasExists } = await companyOs
        .from('person_git_emails')
        .select('id')
        .eq('git_email', committerEmail)
        .maybeSingle();
      if (!aliasExists) {
        const { error } = await companyOs.from('person_git_emails').insert({
          git_email: committerEmail,
          person_id: resolved,
          source: 'discovered',
        });
        if (error) {
          notes.push(`WARN: insert person_git_emails failed: ${error.message}`);
        } else {
          notes.push(`git email recorded for ${committerEmail}`);
        }
      } else {
        notes.push(`git email already present for ${committerEmail}`);
      }
    } else {
      notes.push(`no person found for ${committerEmail}: repo created, contributor will resolve later`);
    }
  }

  return { status: 'applied', notes };
}

// ── Main (I/O) ──────────────────────────────────────────────────────────────

const BRANCH = 'telemetry';
const REPO = process.env.GITHUB_REPOSITORY ?? 'talentedgeai/edge8-web';

async function main() {
  const { execSync } = await import('node:child_process');
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: repoRoot }).trim();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Fetch the telemetry branch so we can read from it.
  sh(`git fetch origin ${BRANCH}`);
  let head = sh(`git rev-parse origin/${BRANCH}`); // reassigned after each deletion

  // List all registration request files on the telemetry branch.
  let files;
  try {
    const raw = sh(`git ls-tree --name-only ${head} registrations/`);
    files = raw.split('\n')
      .map((s) => { const p = s.trim(); return p.startsWith('registrations/') ? p.slice('registrations/'.length) : p; })
      .filter((s) => s.endsWith('.json'));
  } catch {
    console.log('registrations: no registrations/ directory on telemetry branch');
    return;
  }

  if (files.length === 0) {
    console.log('registrations: nothing to process');
    return;
  }

  console.log(`registrations: found ${files.length} request file(s)`);

  const loginCache = {};

  /** GitHub login of whoever last committed the file on the telemetry branch. */
  const committerLoginFor = (path) => {
    const sha = sh(`git log -1 --format=%H ${head} -- "${path}"`);
    if (sha in loginCache) return loginCache[sha];
    let login = null;
    try {
      login =
        sh(`gh api repos/${REPO}/commits/${sha} --jq '.author.login // .committer.login'`) || null;
    } catch {
      login = null;
    }
    loginCache[sha] = login;
    return login;
  };

  /** Author email of whoever last committed the file (for alias resolution). */
  const committerEmailFor = (path) => {
    try {
      return sh(`git log -1 --format=%ae ${head} -- "${path}"`) || null;
    } catch {
      return null;
    }
  };

  let applied = 0, noop = 0, rejected = 0;

  // We need to write back to the telemetry branch for deletions: set up identity.
  const needsGitSetup = !sh('git config user.email || true');
  if (needsGitSetup) {
    sh('git config user.email "github-actions[bot]@users.noreply.github.com"');
    sh('git config user.name "github-actions[bot]"');
  }

  for (const file of files) {
    const fullPath = `registrations/${file}`;
    let req;
    try {
      const content = sh(`git show ${head}:${fullPath}`);
      req = JSON.parse(content);
    } catch (e) {
      console.warn(`registrations: SKIP ${file}: could not read/parse: ${e.message}`);
      rejected++;
      continue;
    }

    const validationError = validateRequest(req);
    if (validationError) {
      console.warn(`registrations: SKIP ${file}: invalid: ${validationError}`);
      rejected++;
      continue;
    }

    // Committer verification: the GitHub login of the commit author must match
    // the request's github_login.
    const committerLogin = committerLoginFor(fullPath);
    if (!committerLogin) {
      console.warn(`registrations: SKIP ${file}: could not resolve committer login`);
      rejected++;
      continue;
    }
    if (committerLogin.toLowerCase() !== req.github_login.toLowerCase()) {
      console.warn(
        `registrations: REJECT ${file}: committer=${committerLogin} does not match request.github_login=${req.github_login}`,
      );
      rejected++;
      continue;
    }

    const committerEmail = committerEmailFor(fullPath);
    if (committerEmail) req._committer_email = committerEmail;

    try {
      const result = await applyRegistration(req, supabase);
      console.log(`registrations: ${result.status} ${req.repo_full_name}: ${result.notes.join('; ')}`);
      if (result.status === 'noop') {
        noop++;
      } else {
        applied++;
      }

      // Mark processed: delete the file from the telemetry branch by building a
      // new commit directly (no checkout needed).
      _deleteRegistrationFile(sh, head, fullPath, req.repo_full_name);
      head = sh(`git rev-parse origin/${BRANCH}`); // refresh for next iteration
    } catch (e) {
      console.error(`registrations: ERROR applying ${file}: ${e.message}`);
      // Do not mark processed: will retry next run.
    }
  }

  console.log(`registrations done: applied=${applied} noop=${noop} rejected=${rejected}`);
}

/**
 * Delete a file from the telemetry branch by building a new commit directly
 * (no need to check out the branch: avoids conflicts with the current checkout).
 */
function _deleteRegistrationFile(sh, _currentHead, filePath, repoFullName) {
  const parentSha = sh(`git rev-parse origin/${BRANCH}`);
  const tmpIndex = `/tmp/reg-index-${Date.now()}`;
  const env = `GIT_INDEX_FILE=${tmpIndex}`;
  sh(`${env} git read-tree ${parentSha}`);
  sh(`${env} git rm --cached "${filePath}" --quiet`);
  const treeSha = sh(`${env} git write-tree`);
  const commitSha = sh(
    `git commit-tree ${treeSha} -p ${parentSha} -m "registered: ${repoFullName}"`,
  );
  sh(`git push origin ${commitSha}:refs/heads/${BRANCH}`);
  sh(`git fetch origin ${BRANCH} --quiet`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
