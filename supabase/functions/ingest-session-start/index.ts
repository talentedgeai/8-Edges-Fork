// Supabase edge function (Deno). Ported from the Human Token Tracker's
// ingest-session-start, re-pointed to edge8's htt schema:
//   client_id -> company_id, project_id -> repo_id, team_member_id -> person_id.
// Writes htt.man_hour_entries. Auth: x-ingest-secret == INGEST_SECRET.
// Deploy with: supabase functions deploy ingest-session-start (see
// docs/plans/htt/PHASE4-RUNBOOK.md). Requires the `htt` and `company_os`
// schemas to be in the project's exposed (PostgREST) schemas.
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// Cross-company: credit the contributor on ANY repo; repo-level if unknown.
// user_id (a Supabase auth uuid from the telemetry) maps via
// company_os.people.auth_user_id; email maps via htt.resolve_contributor
// (people email or person_git_emails). Both return a person_id.
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
  const { company_id, repo_id, primary_role, occurred_on, occurred_hour, author_email, github_login } = b;
  if (!company_id || occurred_on == null) {
    return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400 });
  }
  // occurred_hour is part of the man-hour idempotency key. A null or
  // out-of-range hour would escape dedup, so require an integer 0-23.
  if (typeof occurred_hour !== 'number' || !Number.isInteger(occurred_hour) || occurred_hour < 0 || occurred_hour > 23) {
    return new Response(JSON.stringify({ error: 'occurred_hour must be an integer 0-23' }), { status: 400 });
  }

  let started_at: string | null = null;
  if (b.started_at != null) {
    const t = Date.parse(b.started_at);
    if (!Number.isNaN(t)) started_at = new Date(t).toISOString();
  }
  if (!b.user_id && !author_email) {
    return new Response(JSON.stringify({ error: 'user_id or author_email required' }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const db = supabase.schema('htt');

  // Exclude the client/owner themselves.
  if (await isClientIdentity(supabase, author_email, github_login)) {
    return new Response(JSON.stringify({ excluded: true }), { status: 200 });
  }

  const person_id = await resolvePerson(supabase, b.user_id, author_email);

  // `hours` is the day's resolved_hours, supplied by buildManHourBodies (exactly
  // one body per person/repo/day). Fall back to 1.0 only for legacy callers.
  const hours = typeof b.hours === 'number' && Number.isFinite(b.hours) && b.hours >= 0 ? b.hours : 1.0;

  // Idempotent merge on (person_id, repo_id, occurred_on). A day's man-hours are
  // ONE row. We read any existing auto_session rows for this key, take the
  // GREATEST hours (so a re-ingest is a no-op and a second machine's delivery
  // for the same day keeps the fuller measurement), then replace them with a
  // single row at occurred_hour 0. NULL person is matched null-safely.
  // Non-atomic, but ingest is sequential; concurrent runs at worst converge to
  // greatest.
  // NULL keys must use .is(): PostgREST's eq.null never matches a NULL column,
  // so an .eq('repo_id', null) select would find nothing and re-insert
  // duplicates on every ingest of a repo-less entry.
  let sel = db
    .from('man_hour_entries')
    .select('id, hours')
    .eq('source', 'auto_session')
    .eq('occurred_on', occurred_on);
  sel = repo_id == null ? sel.is('repo_id', null) : sel.eq('repo_id', repo_id);
  sel = person_id === null ? sel.is('person_id', null) : sel.eq('person_id', person_id);
  const { data: existing } = await sel;

  const existingMax = (existing ?? []).reduce(
    (m: number, r: { hours: number | string }) => Math.max(m, Number(r.hours) || 0),
    0,
  );
  const target = Math.max(existingMax, hours);
  const wasPresent = (existing ?? []).length > 0;

  if (wasPresent) {
    const ids = (existing ?? []).map((r: { id: string }) => r.id);
    const { error: delErr } = await db.from('man_hour_entries').delete().in('id', ids);
    if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500 });
  }

  const { error } = await db.from('man_hour_entries').insert({
    person_id,
    company_id,
    repo_id: repo_id ?? null,
    primary_role: primary_role ?? null,
    hours: target,
    occurred_on,
    occurred_hour: 0,
    started_at,
    source: 'auto_session',
    status: 'recorded',
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, hours: target, merged: wasPresent, attributed: person_id != null }), { status: 200 });
});
