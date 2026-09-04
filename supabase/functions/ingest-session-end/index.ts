// Supabase edge function (Deno). Ported from the Human Token Tracker's
// ingest-session-end, re-pointed to edge8's htt schema:
//   client_id -> company_id, project_id -> repo_id, team_member_id -> person_id.
// Writes htt.token_entries. Auth: x-ingest-secret == INGEST_SECRET.
// Deploy with: supabase functions deploy ingest-session-end (see
// docs/plans/htt/PHASE4-RUNBOOK.md). Requires the `htt` and `company_os`
// schemas to be in the project's exposed (PostgREST) schemas.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VALID_SOURCES = ['pr_commit', 'pr_review', 'planning', 'design', 'research', 'manual', 'session'];

// deno-lint-ignore no-explicit-any
type Client = any;

async function isClientIdentity(supabase: Client, email?: string, login?: string): Promise<boolean> {
  const db = supabase.schema('htt');
  if (email) {
    const { data } = await db.from('client_identities').select('id').ilike('git_email', email).limit(1).maybeSingle();
    if (data) return true;
  }
  if (login) {
    const { data } = await db.from('client_identities').select('id').ilike('github_login', login).limit(1).maybeSingle();
    if (data) return true;
  }
  return false;
}

// Cross-company: resolve to a contributor regardless of the repo's company.
async function resolvePerson(supabase: Client, userId?: string, email?: string): Promise<string | null> {
  if (userId) {
    const { data } = await supabase.schema('company_os').from('people').select('id').eq('auth_user_id', userId).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  if (email) {
    const { data } = await supabase.schema('htt').rpc('resolve_contributor', { p_email: email });
    return data ?? null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (req.headers.get('x-ingest-secret') !== Deno.env.get('INGEST_SECRET')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const b = await req.json();
  const { company_id, repo_id, pull_request_id, session_branch, source, occurred_at, occurred_on, author_email, github_login, session_id } = b;
  const human = Number(b.human_tokens ?? 0);
  const claude = Number(b.claude_tokens ?? 0);

  if (!company_id || !occurred_at || !VALID_SOURCES.includes(source)) {
    return new Response(JSON.stringify({ error: 'missing/invalid fields' }), { status: 400 });
  }
  if (!b.user_id && !author_email) {
    return new Response(JSON.stringify({ error: 'user_id or author_email required' }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const db = supabase.schema('htt');

  // Exclude the client/owner themselves: their own commits are not counted.
  if (await isClientIdentity(supabase, author_email, github_login)) {
    return new Response(JSON.stringify({ excluded: true }), { status: 200 });
  }

  const person_id = await resolvePerson(supabase, b.user_id, author_email);

  const common = {
    company_id,
    repo_id: repo_id ?? null,
    pull_request_id: pull_request_id ?? null,
    session_branch: session_branch ?? null,
    person_id,
    source,
    occurred_at,
    occurred_on: occurred_on ?? null,
    status: 'recorded',
  };
  // Idempotency key: a row is deduped EITHER on (session_id, kind), per-session
  // claude, OR on (person_id, repo_id, occurred_on, kind), per-day human. A row
  // with NEITHER session_id NOR occurred_on has no key, so it would re-insert
  // (double-count) on every re-ingest. Reject it instead.
  if (!session_id && !occurred_on) {
    return new Response(
      JSON.stringify({ error: 'no idempotency key: session_id or occurred_on required' }),
      { status: 400 },
    );
  }

  const rows = [];
  if (human > 0) rows.push({ ...common, kind: 'human', amount: human, session_id: session_id ?? null });
  if (claude > 0) rows.push({ ...common, kind: 'claude', amount: claude, session_id: session_id ?? null });
  if (rows.length === 0) return new Response(JSON.stringify({ inserted: 0 }), { status: 200 });

  // Two valid upsert paths only, never a plain INSERT. session_id wins when present.
  const onConflict = session_id ? 'session_id,kind' : 'person_id,repo_id,occurred_on,kind';
  const { error } = await db.from('token_entries').upsert(rows, { onConflict });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ upserted: rows.length, attributed: person_id != null }), { status: 200 });
});
