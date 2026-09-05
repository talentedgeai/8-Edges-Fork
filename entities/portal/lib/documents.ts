// Portal "Documents" data access: the company-level document list and
// delete-own for /portal/documents. Same discipline as entities/portal/lib/ai-programs.ts:
// every read/write is scoped to the actor's own companyScope and cross-company
// ids are rejected (IDOR guard). Delete is uploader-only on this surface: you
// may remove what you uploaded, never someone else's file
// (docs/plans/2026-08-11-client-portal-improvements.md, PR 1). The upload,
// record-link and signed-download helpers left with the unused DocumentsView
// in E8-13; lib/client-documents still holds the primitives.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import {
  listDocumentsForCompanies,
  getDocumentRow,
  deleteDocumentRow,
  type ClientDocument,
  type DocResult,
} from "@/entities/portal/lib/client-documents";

export type { ClientDocument } from "@/entities/portal/lib/client-documents";

export async function listDocumentsForActor(actor: PortalActor): Promise<ClientDocument[]> {
  return listDocumentsForCompanies(actor.companyScope);
}

// Uploader-only delete: the row must be in the actor's company scope AND carry
// their email as uploader. Admin-side delete (any document) lives in the admin
// actions, not here.
export async function deleteOwnDocument(actor: PortalActor, documentId: string): Promise<DocResult> {
  const row = await getDocumentRow(documentId);
  if (!row || !actor.companyScope.includes(row.companyId)) return { ok: false, error: "Not found." };
  if ((row.uploadedBy ?? "").toLowerCase() !== actor.email.toLowerCase()) {
    return { ok: false, error: "You can only delete documents you uploaded." };
  }
  return deleteDocumentRow(row);
}
