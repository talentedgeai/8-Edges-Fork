import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { ClientCards } from "@/components/admin/ClientCards";
import { humanize } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { ClientHubFilter, type HubStatus } from "./ClientHubFilter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client Hubs",
  description: "Pick a client to open their hub: work board, roadmap, documents, meetings, and team.",
};

const CLIENT_STAGES = ["customer", "evangelist"];
const DEFAULT_STATUS: HubStatus = "active";

function parseStatus(value: string | undefined): HubStatus {
  return value === "inactive" || value === "all" ? value : DEFAULT_STATUS;
}

type Row = {
  id: string;
  name: string | null;
  industry: string | null;
  industry_normalized: string | null;
  priority: string | null;
  metadata: { client_hub_active?: boolean } | null;
};

// Client Hubs: a launcher that lists clients as cards. Opening one lands on
// that company's 360, which defaults to the Client Hub tab for clients, so the
// board / roadmap / documents / meetings / team are front and centre. The
// Active/Inactive filter is driven by metadata.client_hub_active and defaults
// to active clients.
export default async function ClientHubsPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const status = parseStatus(firstParam(searchParams.status));

  const { data } = await companyOs
    .from("companies")
    .select("id, name, industry, industry_normalized, priority, metadata")
    .in("lifecycle_stage", CLIENT_STAGES)
    .is("archived_at", null)
    .order("name", { ascending: true });

  const all = (data ?? []) as Row[];
  const isActive = (r: Row) => r.metadata?.client_hub_active === true;

  const counts: Record<HubStatus, number> = {
    active: all.filter(isActive).length,
    inactive: all.filter((r) => !isActive(r)).length,
    all: all.length,
  };

  const rows =
    status === "all" ? all : status === "inactive" ? all.filter((r) => !isActive(r)) : all.filter(isActive);

  const noun = status === "all" ? "client" : `${status} client`;

  return (
    <div>
      <PageHead
        eyebrow="Operating System"
        title="Client Hubs"
        sub={`${rows.length} ${noun}${rows.length === 1 ? "" : "s"}. Open one to work their hub.`}
      />
      <div className="u-mb-4">
        <ClientHubFilter active={status} defaultStatus={DEFAULT_STATUS} counts={counts} searchParams={searchParams} />
      </div>
      {rows.length === 0 ? (
        <div className="admin-card admin-section-card">
          <p className="admin-page-sub u-m-0">No {noun}s.</p>
        </div>
      ) : (
        <ClientCards
          rows={rows}
          detailBasePath="/admin/revenue/companies"
          hrefQuery="?from=client-hubs"
          subText={(r) => [r.industry_normalized || r.industry, r.priority ? humanize(r.priority) : null].filter(Boolean).join(" · ")}
        />
      )}
    </div>
  );
}
