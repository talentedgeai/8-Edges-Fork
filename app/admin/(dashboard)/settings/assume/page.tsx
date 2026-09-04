import { requireAdmin } from "@/lib/admin-auth";
import { listAssumableClients } from "@/lib/admin/portal-assume";
import { PageHead } from "@/components/admin/PageHead";
import { ASSUME_SESSION_MINUTES } from "@/lib/portal-auth";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { ClientsActiveToggle } from "@/app/admin/(dashboard)/revenue/clients/ClientsActiveToggle";
import { AssumeManager } from "./AssumeManager";

export const dynamic = "force-dynamic";

// Settings → Assume. View the client portal exactly as one of the active
// client companies would see it, without ever leaving your admin session.
// Matches the admin Clients list: active clients by default, with a toggle to
// reveal inactive companies.
export default async function AssumePage({ searchParams }: { searchParams: SearchParamsObj }) {
  await requireAdmin();
  const showInactive = firstParam(searchParams.inactive) === "1";
  const clients = await listAssumableClients(showInactive);

  const noun = clients.length === 1 ? "company" : "companies";
  const sessionNote = `Sessions expire after ${ASSUME_SESSION_MINUTES} minutes and can be ended anytime from the banner shown on every portal page.`;

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Assume"
        sub={
          showInactive
            ? `View /portal as any of ${clients.length} ${noun}, including inactive. ${sessionNote}`
            : `View /portal as one of ${clients.length} active client ${noun}. ${sessionNote}`
        }
        action={<ClientsActiveToggle basePath="/admin/settings/assume" searchParams={searchParams} showInactive={showInactive} />}
      />

      <div className="admin-card admin-section-card">
        <AssumeManager clients={clients} />
      </div>
    </>
  );
}
