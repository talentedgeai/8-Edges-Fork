// Shared core for client documents (company_os.program_documents + the private
// program-documents bucket). Documents belong to a client COMPANY; tagging to an
// AI Program is optional (docs/plans/2026-08-11-client-portal-improvements.md).
//
// This module is auth-agnostic on purpose: it filters by whatever company ids the
// caller passes and trusts nothing else. Every surface wraps it with its own
// gate + scope: /portal via the actor's companyScope (lib/portal/documents.ts),
// /admin via requireAdmin (documents-actions.ts), /team via the actor's active
// staff_assignments (lib/team/clients.ts). Never call it with ids that did not
// come from one of those scopes.

import { supabase, companyOs } from "@/lib/supabase";
import { one } from "@/lib/embedded";

export const DOCUMENTS_BUCKET = "program-documents";
const DOWNLOAD_TTL_SECONDS = 60 * 5;

export type ClientDocument = {
  id: string;
  companyId: string;
  programId: string | null;
  programName: string | null;
  filename: string;
  url: string | null; // external link rows carry a url instead of a storage object
  sizeBytes: number | null;
  uploadedBy: string | null; // email as recorded at upload time
  uploaderName: string | null; // resolved display name, when the email matches a person
  createdAt: string;
};

type Err = { ok: false; error: string };
export type DocResult<T = unknown> = ({ ok: true } & T) | Err;

type DocRow = {
  id: string;
  company_id: string;
  ai_program_id: string | null;
  storage_path: string | null;
  filename: string;
  url: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  program: { name: string | null } | { name: string | null }[] | null;
};

// Sanitize a user filename for use as a storage object key segment.
export function safeDocName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

// Normalize user link input: bare domains get https://, only http(s) accepted.
export function normalizeDocLink(raw: string): { url: string; host: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { url: u.toString(), host: u.hostname };
  } catch {
    return null;
  }
}

const SELECT =
  "id, company_id, ai_program_id, storage_path, filename, url, size_bytes, uploaded_by, created_at, program:ai_programs!ai_program_id(name)";

// Uploaded-by emails resolve to people names for display; unmatched emails show
// as-is. One IN query for the whole list.
async function uploaderNames(emails: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  if (unique.length === 0) return new Map();
  const { data } = await companyOs
    .from("people")
    .select("email, full_name, preferred_name")
    .in("email", unique);
  const map = new Map<string, string>();
  for (const p of (data ?? []) as Array<{ email: string; full_name: string | null; preferred_name: string | null }>) {
    const name = p.preferred_name || p.full_name;
    if (p.email && name) map.set(p.email.toLowerCase(), name);
  }
  return map;
}

function mapRows(rows: DocRow[], names: Map<string, string>): ClientDocument[] {
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    programId: r.ai_program_id,
    programName: one(r.program)?.name ?? null,
    filename: r.filename,
    url: r.url,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    uploaderName: r.uploaded_by ? names.get(r.uploaded_by.toLowerCase()) ?? null : null,
    createdAt: r.created_at,
  }));
}

// Every document for the given companies, newest first. companyIds MUST come
// from the caller's own scope (see module header).
export async function listDocumentsForCompanies(companyIds: string[]): Promise<ClientDocument[]> {
  if (companyIds.length === 0) return [];
  const { data } = await companyOs
    .from("program_documents")
    .select(SELECT)
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as DocRow[];
  const names = await uploaderNames(rows.map((r) => r.uploaded_by ?? ""));
  return mapRows(rows, names);
}

// One document row, unscoped — the caller must check company_id against its own
// scope before acting on the result.
export async function getDocumentRow(id: string): Promise<{
  id: string;
  companyId: string;
  storagePath: string | null;
  filename: string;
  url: string | null;
  uploadedBy: string | null;
} | null> {
  const { data } = await companyOs
    .from("program_documents")
    .select("id, company_id, storage_path, filename, url, uploaded_by")
    .eq("id", id)
    .maybeSingle();
  const row = data as {
    id: string;
    company_id: string;
    storage_path: string | null;
    filename: string;
    url: string | null;
    uploaded_by: string | null;
  } | null;
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    storagePath: row.storage_path,
    filename: row.filename,
    url: row.url,
    uploadedBy: row.uploaded_by,
  };
}

// Short-lived signed download URL (private bucket). Scope-check the row first.
export async function signedDownloadForPath(
  storagePath: string,
  filename: string,
): Promise<DocResult<{ url: string }>> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_TTL_SECONDS, { download: filename });
  if (error || !data) return { ok: false, error: "Could not open the document." };
  return { ok: true, url: data.signedUrl };
}

// Step 1 of direct-to-storage upload: a one-shot signed upload URL. Company-level
// documents live under company/<id>/docs/; program-tagged uploads keep the
// original company/<id>/program/<id>/ prefix (set by the caller via programId).
export async function createSignedDocumentUpload(input: {
  companyId: string;
  filename: string;
  programId?: string | null;
}): Promise<DocResult<{ signedUrl: string; path: string }>> {
  const segment = input.programId ? `program/${input.programId}` : "docs";
  const path = `company/${input.companyId}/${segment}/${crypto.randomUUID()}-${safeDocName(input.filename)}`;
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload." };
  return { ok: true, signedUrl: data.signedUrl, path };
}

// Step 2: record the uploaded object. The path guard pins the object under the
// company's prefix so a tampered path can never cross companies.
export async function recordDocument(input: {
  companyId: string;
  programId?: string | null;
  path: string;
  filename: string;
  sizeBytes: number | null;
  uploadedBy: string;
}): Promise<DocResult> {
  if (!input.path.startsWith(`company/${input.companyId}/`)) {
    return { ok: false, error: "Invalid upload path." };
  }
  const { error } = await companyOs.from("program_documents").insert({
    company_id: input.companyId,
    ai_program_id: input.programId ?? null,
    storage_path: input.path,
    filename: safeDocName(input.filename),
    size_bytes: input.sizeBytes,
    uploaded_by: input.uploadedBy,
  });
  if (error) {
    // Unique violation means another row already owns this object — do NOT
    // remove it, or a re-claimed path would delete the original row's file.
    if (error.code !== "23505") {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([input.path]);
    }
    return { ok: false, error: "Could not save the document." };
  }
  return { ok: true };
}

// Record an external link as a document row. No storage object; filename holds
// the display title (caller-provided title, or the link's hostname).
export async function recordLink(input: {
  companyId: string;
  programId?: string | null;
  url: string;
  title?: string | null;
  uploadedBy: string;
}): Promise<DocResult> {
  const link = normalizeDocLink(input.url);
  if (!link) return { ok: false, error: "Enter a valid http(s) link." };
  const { error } = await companyOs.from("program_documents").insert({
    company_id: input.companyId,
    ai_program_id: input.programId ?? null,
    storage_path: null,
    url: link.url,
    filename: (input.title ?? "").trim().slice(0, 120) || link.host,
    size_bytes: null,
    uploaded_by: input.uploadedBy,
  });
  if (error) return { ok: false, error: "Could not save the link." };
  return { ok: true };
}

// Remove the storage object, then the row. Callers do the scope/ownership check;
// this just executes. Storage-first so a failed removal never leaves a row that
// points at a live file the user believes deleted. Link rows have no object.
export async function deleteDocumentRow(row: { id: string; storagePath: string | null }): Promise<DocResult> {
  if (row.storagePath) {
    const { error: storageErr } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]);
    if (storageErr) return { ok: false, error: "Could not delete the file." };
  }
  const { error } = await companyOs.from("program_documents").delete().eq("id", row.id);
  if (error) return { ok: false, error: "Could not delete the document record." };
  return { ok: true };
}
