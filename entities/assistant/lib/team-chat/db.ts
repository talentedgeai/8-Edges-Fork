// Server-only. Restricted SQL executor for the /team portal assistant.
//
// Reads run through the dedicated `team_chatbot_reader` Postgres role
// (supabase/migrations/20260720160000_team_chatbot_reader_and_knowledge.sql).
// Unlike the admin assistant's chatbot_reader, this role is DEFAULT-DENY: it has
// USAGE on company_os and SELECT on an explicit allow-list of tables only, so
// payroll, compensation, sensitive PII, recruiting/candidate data, survey
// responses, and the like are unreachable at the database layer no matter what
// SQL the model emits. Defense in depth, each layer independently sufficient:
//   1. validation below (single SELECT/WITH statement only)
//   2. structural wrap: the query runs as a subquery, so DML cannot escape
//   3. the extended protocol rejects multi-statement strings
//   4. the role's grants make writes, DDL, other schemas, and every non-allowed
//      table impossible at the database layer regardless of the SQL text
//   5. role-level statement_timeout of 5s
//
// This module never writes: there is no team writer role and no write executor.
// NEVER import from a client component.

import postgres from "postgres";

const MAX_ROWS = 200;
const MAX_QUERY_CHARS = 8_000;

// Schema-qualified references the assistant is never allowed to make. Same list
// as the admin reader: information_schema and pg_catalog are intentionally
// allowed so the model can introspect column names.
const BLOCKED_SCHEMA =
  /\b(?:auth|storage|vault|cron|net|extensions|realtime|private|supabase_migrations|company_os_archive|agents)\s*\.\s*"?[a-z_]/i;

// Crown-jewel company_os tables the role cannot read anyway (denied by omission
// from the allow-list). Named here too so a coaxed query gets a clear message
// instead of a bare "permission denied", and as one more layer against a model
// being steered toward payroll/PII. The grants remain the hard boundary.
const BLOCKED_TABLE =
  /\b(?:people_sensitive|compensation_sensitive|compensation|performance_reviews|one_on_ones|goals|applications|candidates|candidate_profile|survey_responses|survey_answers|audit_log|coaching_profiles|coaching_one_on_ones|coaching_commitments|coaching_checkins|coaching_trends|coaching_context|coaching_priorities|coaching_ocean_profiles|coaching_goal_comments)\b/i;

let client: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> | null {
  if (client) return client;
  const url = process.env.TEAM_CHATBOT_DB_URL;
  if (!url) {
    console.warn("team-chat/db: TEAM_CHATBOT_DB_URL is not set; assistant reads disabled");
    return null;
  }
  // Supavisor transaction pooler (port 6543) as team_chatbot_reader;
  // prepare:false is required in transaction-pool mode.
  client = postgres(url, { max: 3, prepare: false, idle_timeout: 20 });
  return client;
}

export type QueryResult =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

export async function runReadOnlyQuery(query: string): Promise<QueryResult> {
  const sql = getClient();
  if (!sql) return { ok: false, error: "Database access is not configured" };

  let q = query.trim();
  if (q.endsWith(";")) q = q.slice(0, -1).trimEnd();

  if (!q) return { ok: false, error: "Empty query" };
  if (q.length > MAX_QUERY_CHARS) {
    return { ok: false, error: `Query too long (max ${MAX_QUERY_CHARS} chars)` };
  }
  if (q.includes(";")) {
    return { ok: false, error: "Only a single statement is allowed (no semicolons)" };
  }
  if (!/^\s*(select|with)\b/i.test(q)) {
    return { ok: false, error: "Only SELECT queries are allowed" };
  }
  if (BLOCKED_SCHEMA.test(q)) {
    return { ok: false, error: "Queries may only reference the company_os schema." };
  }
  if (BLOCKED_TABLE.test(q)) {
    return {
      ok: false,
      error:
        "That table is off-limits to the team assistant (payroll, compensation, " +
        "sensitive personal data, recruiting/candidate records, survey responses, " +
        "and audit logs are not readable here). Answer from the tables you can read.",
    };
  }

  try {
    // Wrapping as a subquery means anything that survived validation still cannot
    // be DML, and the row cap is enforced server-side.
    const rows = await sql.unsafe(`select * from (\n${q}\n) chatbot_q limit ${MAX_ROWS + 1}`);
    const truncated = rows.length > MAX_ROWS;
    const out = truncated ? rows.slice(0, MAX_ROWS) : [...rows];
    return {
      ok: true,
      rows: out as unknown as Record<string, unknown>[],
      rowCount: out.length,
      truncated,
    };
  } catch (err) {
    // Postgres errors go back verbatim: the model self-corrects on "column ...
    // does not exist" / "permission denied for ..." feedback.
    return { ok: false, error: (err as Error).message ?? "Query failed" };
  }
}
