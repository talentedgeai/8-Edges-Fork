import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getClientInvoicesForActor } from "@/entities/team/modules/hub/clients";
import { InvoicesPanel } from "@/entities/team/modules/hub/ui/InvoicesPanel";

export const metadata = { title: "Client Invoices" };

// The Invoices tab: this client's invoices (synced from QuickBooks), without the
// private memo. Clients see the same list on /portal, gated to portal admins.
export default async function TeamClientInvoicesTab({ params }: { params: { companyId: string } }) {
  const actor = await requireTeamMember();
  const invoices = await getClientInvoicesForActor(actor, params.companyId);
  if (invoices === null) notFound();

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title u-mb-3">Invoices</h2>
      <InvoicesPanel invoices={invoices} />
    </section>
  );
}
