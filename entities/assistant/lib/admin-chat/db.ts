// Server-only. Restricted SQL executors for the admin database assistant.
//
// Reads run through the dedicated `chatbot_reader` Postgres role
// (supabase/migrations/20260715120000_admin_chatbot_reader.sql), which has
// USAGE on company_os only and no write grants anywhere. Defense in depth,
// each layer independently sufficient:
//   1. validation in ../read-executor.ts (single SELECT/WITH statement only)
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
import { BLOCKED_SCHEMA, MAX_QUERY_CHARS, makeReadExecutor } from "../read-executor";

// Confidential company_os tables the assistant must never read or write. The
// DB grants already close these (no reader/writer policies + revoked grants),
// but reject by name too so the model gets a clear message instead of a bare
// permission error. people_sensitive = PII; compensation_sensitive = real pay data.
const BLOCKED_TABLES = /\b(?:people_sensitive|compensation_sensitive|compensation)\b/i;

const BLOCKED_TABLES_MESSAGE =
  "people_sensitive and compensation_sensitive are off-limits to the assistant.";

export const runReadOnlyQuery = makeReadExecutor({
  envVar: "CHATBOT_DB_URL",
  logPrefix: "admin-chat/db",
  poolMax: 3,
  blocked: { pattern: BLOCKED_TABLES, message: BLOCKED_TABLES_MESSAGE },
});

// Module-level singleton for the writer role. The URL points at the Supavisor
// transaction pooler (port 6543) as chatbot_writer; prepare:false is required
// in transaction-pool mode.
let writeClient: ReturnType<typeof postgres> | null = null;

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
    return { ok: false, error: BLOCKED_TABLES_MESSAGE };
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
