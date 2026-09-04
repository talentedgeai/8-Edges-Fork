import { notFound } from "next/navigation";
import { requireTeamMember } from "@/lib/team-auth";
import { getClientDocumentsForActor, getActorEmail, companyHasPrograms } from "@/lib/team/clients";
import { ClientDocumentsList } from "../ClientDocumentsList";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Documents" };

// The Documents tab: the client's vault (same files as /portal/documents).
// Upload for any assigned team member; delete only what you uploaded. With AI
// Programs present, untagged documents only; program documents live in their
// AI Program view.

export default async function TeamClientDocumentsTab({ params }: { params: { companyId: string } }) {
  const actor = await requireTeamMember();
  const [documents, actorEmail, hasPrograms] = await Promise.all([
    getClientDocumentsForActor(actor, params.companyId),
    getActorEmail(actor),
    companyHasPrograms(params.companyId),
  ]);
  if (documents === null) notFound();

  const shown = hasPrograms ? documents.filter((d) => !d.programId) : documents;

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title u-mb-3">Documents</h2>
      <ClientDocumentsList documents={shown} companyId={params.companyId} actorEmail={actorEmail} />
    </section>
  );
}
