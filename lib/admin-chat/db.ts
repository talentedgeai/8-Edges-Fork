// Server-only. Restricted SQL executors for the admin database assistant.
//
// Reads run through the dedicated `chatbot_reader` Postgres role
// (supabase/migrations/20260715120000_admin_chatbot_reader.sql), which has
// USAGE on company_os only and no write grants anywhere. Defense in depth,
// each layer independently sufficient:
//   1. validation below (single SELECT/WITH statement only)
//   2. structural wrap: the query runs as a subquery, so DML cannot escape
//   3. the extended protocol rejects multi-statement strings
//   4. the role's grants make writes, DDL, and other schemas impossible at the
//      database layer regardless of the SQL text
//   5. role-level statement_timeout of 5s
//
// Writes (privileged admins only, each statement individually approved in the
// chat UI — see app/api/admin/chat/route.ts) run through `chatbot_writer`
// (supabase/migrations/20260718200000_admin_chatbot_writer.sql): INSERT and
// UPDATE on company_os only, no DELETE grant anywhere, people_sensitive
// revoked, same 5s timeout. Validation here (single INSERT/UPDATE statement,
// UPDATE must have WHERE) narrows what the model can even propose; the role's
// grants remain the hard boundary.
//
// NEVER import from a client component.

import postgres from "postgres";

const MAX_ROWS = 200;
const MAX_QUERY_CHARS = 8_000;

// Schema-qualified references the assistant is never allowed to make. Matches a
// blocked schema name immediately followed by a dot + identifier (so a column
// like `auth_user_id` or an unrelated word is not caught). information_schema
// and pg_catalog are intentionally allowed — the model uses them to introspect.
const BLOCKED_SCHEMA =
  /\b(?:auth|storage|vault|cron|net|extensions|realtime|private|supabase_migrations|company_os_archive|agents)\s*\.\s*"?[a-z_]/i;

// Confidential company_os tables the assistant must never read or write. The
// DB grants already close these (no reader/writer policies + revoked grants),
// but reject by name too so the model gets a clear message instead of a bare
// permission error. people_sensitive = PII; compensation_sensitive = real pay data.
const BLOCKED_TABLES = /\b(?:people_sensitive|compensation_sensitive|compensation)\b/i;

// Module-level singletons. Both URLs point at the Supavisor transaction
// pooler (port 6543) as their respective roles; prepare:false is required in
// transaction-pool mode.
let client: ReturnType<typeof postgres> | null = null;
let writeClient: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> | null {
  if (client) return client;
  const url = process.env.CHATBOT_DB_URL;
  if (!url) {
    console.warn("admin-chat/db: CHATBOT_DB_URL is not set; assistant reads disabled");
    return null;
  }
  client = postgres(url, { max: 3, prepare: false, idle_timeout: 20 });
  return client;
}

function getWriteClient(): ReturnType<typeof postgres> | null {
  if (writeClient) return writeClient;
  const url = process.env.CHATBOT_WRITE_DB_URL;
  if (!url) {
    console.warn("admin-chat/db: CHATBOT_WRITE_DB_URL is not set; assistant writes disabled");
    return null;
  }
  writeClient = postgres(url, { max: 2, prepare: false, idle_timeout: 20 });
  return writeClient;
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
  // Belt-and-suspenders on top of the grants: reject references to schemas the
  // assistant must never touch. chatbot_reader already cannot reach most of
  // these, but Supabase grants the pg_net queue tables (schema `net`) to PUBLIC,
  // so this app-layer check is what keeps outbound-request data out of reach —
  // and it also blocks a prompt-injection steering the model off company_os.
  if (BLOCKED_SCHEMA.test(q)) {
    return { ok: false, error: "Queries may only reference the company_os schema." };
  }
  if (BLOCKED_TABLES.test(q)) {
    return { ok: false, error: "people_sensitive and compensation_sensitive are off-limits to the assistant." };
  }

  try {
    // Wrapping as a subquery means anything that survived validation still
    // cannot be DML, and the row cap is enforced server-side.
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
    // Postgres errors go back verbatim: the model self-corrects on
    // "column ... does not exist" / "permission denied for ..." feedback.
    return { ok: false, error: (err as Error).message ?? "Query failed" };
  }
}

const MAX_RETURNED_ROWS = 50;

export type WriteResult =
  | {
      ok: true;
      command: "insert" | "update";
      affectedRows: number;
      rows: Record<string, unknown>[];
    }
  | { ok: false; error: string };

// Validates and runs one admin-approved INSERT or UPDATE as chatbot_writer.
// Only ever called after the privileged admin clicked Approve in the chat UI.
export async function runApprovedWrite(query: string): Promise<WriteResult> {
  const sql = getWriteClient();
  if (!sql) return { ok: false, error: "Database write access is not configured" };

  let q = query.trim();
  if (q.endsWith(";")) q = q.slice(0, -1).trimEnd();

  if (!q) return { ok: false, error: "Empty statement" };
  if (q.length > MAX_QUERY_CHARS) {
    return { ok: false, error: `Statement too long (max ${MAX_QUERY_CHARS} chars)` };
  }
  if (q.includes(";")) {
    return { ok: false, error: "Only a single statement is allowed (no semicolons)" };
  }
  const command = /^\s*insert\b/i.test(q)
    ? ("insert" as const)
    : /^\s*update\b/i.test(q)
      ? ("update" as const)
      : null;
  if (!command) {
    return {
      ok: false,
      error:
        "Only a single INSERT or UPDATE statement is allowed. There is no DELETE: archive rows by setting archived_at instead.",
    };
  }
  // No unqualified UPDATE: a missing WHERE would rewrite the whole table. This
  // is an app-layer guard on the blast radius, not a security boundary.
  if (command === "update" && !/\bwhere\b/i.test(q)) {
    return { ok: false, error: "UPDATE must have a WHERE clause." };
  }
  if (BLOCKED_SCHEMA.test(q)) {
    return { ok: false, error: "Statements may only reference the company_os schema." };
  }
  // The role has no grants on people_sensitive or compensation_sensitive; reject by name
  // too so the model gets a clear message instead of a bare permission error.
  if (BLOCKED_TABLES.test(q)) {
    return { ok: false, error: "people_sensitive and compensation_sensitive are off-limits to the assistant." };
  }

  try {
    const rows = await sql.unsafe(q);
    return {
      ok: true,
      command,
      // postgres.js exposes the DML-affected row count on the result array.
      affectedRows: rows.count ?? rows.length,
      rows: rows.slice(0, MAX_RETURNED_ROWS) as unknown as Record<string, unknown>[],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Statement failed" };
  }
}
