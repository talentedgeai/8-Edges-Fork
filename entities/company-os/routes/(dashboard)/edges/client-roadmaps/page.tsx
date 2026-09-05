import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import {
  BACKLOG_SELECT,
  ROADMAP_GROUPS_SELECT,
  type BacklogItem,
  type RoadmapGroup,
} from "@/entities/portal";
import { CompanyDocuments, type ProgramOption } from "@/entities/company-os/modules/crm/ui/CompanyDocuments";
import { listDocumentsForCompanies } from "@/entities/portal";
import { CompanyPicker } from "./CompanyPicker";
import { BacklogAdminEditor } from "./BacklogAdminEditor";
import { OverviewEditor } from "./OverviewEditor";

export const metadata = {
  title: "Client Roadmaps",
  description: "Per-client AI Program roadmap: items, priorities and client proposals.",
};

const CLIENT_STAGES = ["customer", "evangelist"];

type ClientOption = { id: string; name: string };

export default async function ClientBacklogPage({ searchParams }: { searchParams: SearchParamsObj }) {
  const companyId = firstParam(searchParams.company) ?? "";
  const showArchived = firstParam(searchParams.archived) === "1";

  const { data: companyRows } = await companyOs
    .from("companies")
    .select("id, name")
    .in("lifecycle_stage", CLIENT_STAGES)
    .is("archived_at", null)
    .order("name", { ascending: true });
  const clients = (companyRows ?? []) as ClientOption[];

  const selected = clients.find((c) => c.id === companyId) ?? null;

  // ── Detail view: one client's backlog ──────────────────────────────
  if (selected) {
    let query = companyOs
      .from("client_backlog_items")
      .select(BACKLOG_SELECT)
      .eq("company_id", selected.id)
      .order("sort_order", { ascending: true });
    if (!showArchived) query = query.is("archived_at", null);
    let groupsQuery = companyOs
      .from("client_roadmap_groups")
      .select(ROADMAP_GROUPS_SELECT)
      .eq("company_id", selected.id)
      .order("sort_order", { ascending: true });
    if (!showArchived) groupsQuery = groupsQuery.is("archived_at", null);
    const [{ data }, { data: groupRows }, { data: overviewRow }, documents, { data: programRows }] = await Promise.all([
      query,
      groupsQuery,
      companyOs.from("client_roadmap_overview").select("body").eq("company_id", selected.id).maybeSingle(),
      listDocumentsForCompanies([selected.id]),
      companyOs.from("ai_programs").select("id, name").eq("company_id", selected.id).order("created_at", { ascending: false }),
    ]);
    const items = (data ?? []) as unknown as BacklogItem[];
    const groups = (groupRows ?? []) as unknown as RoadmapGroup[];

    // Which items have a live (non-archived) board card linked to them.
    const itemIds = items.map((i) => i.id);
    let liveCardItemIds = new Set<string>();
    if (itemIds.length > 0) {
      const { data: linkRows } = await companyOs
        .from("tasks")
        .select("subject_id")
        .eq("subject_type", "client_backlog_item")
        .in("subject_id", itemIds)
        .is("archived_at", null);
      liveCardItemIds = new Set(((linkRows ?? []) as { subject_id: string }[]).map((r) => r.subject_id));
    }
    const overviewBody = (overviewRow as { body: string } | null)?.body ?? "";
    const programs = (programRows ?? []) as ProgramOption[];
    const proposedCount = items.filter((i) => i.status === "proposed").length;

    return (
      <>
        <PageHead
          eyebrow={<Link href="/admin/edges/client-roadmaps">← All clients</Link>}
          title={selected.name}
          sub={`${items.length} item${items.length === 1 ? "" : "s"}${proposedCount ? ` · ${proposedCount} client proposal${proposedCount === 1 ? "" : "s"} to review` : ""}`}
          action={<CompanyPicker clients={clients} selectedId={companyId} showArchived={showArchived} />}
        />
        <OverviewEditor companyId={selected.id} initialBody={overviewBody} />
        <BacklogAdminEditor
          companyId={selected.id}
          groups={groups}
          items={items}
          showArchived={showArchived}
          liveCardItemIds={liveCardItemIds}
          programs={programs}
        />
        <section className="admin-card admin-section-card u-mt-4">
          <h2 className="admin-card-title u-mb-1">Documents</h2>
          <p className="admin-page-sub u-m-0 u-mb-3">
            Shared with {selected.name}: everything here is visible in their portal and to the assigned team.
          </p>
          <CompanyDocuments companyId={selected.id} documents={documents} programs={programs} />
        </section>
      </>
    );
  }

  // ── Index view: all clients with backlog counts ────────────────────
  const clientIds = clients.map((c) => c.id);
  const countsByCompany = new Map<string, { total: number; proposals: number }>();
  if (clientIds.length > 0) {
    const { data: rows } = await companyOs
      .from("client_backlog_items")
      .select("company_id, status")
      .in("company_id", clientIds)
      .is("archived_at", null);
    for (const r of (rows ?? []) as Array<{ company_id: string; status: string }>) {
      const c = countsByCompany.get(r.company_id) ?? { total: 0, proposals: 0 };
      c.total += 1;
      if (r.status === "proposed") c.proposals += 1;
      countsByCompany.set(r.company_id, c);
    }
  }

  // Clients with a backlog first (most proposals, then most items), then the rest A–Z.
  const withBacklog = clients
    .filter((c) => countsByCompany.has(c.id))
    .sort((a, b) => {
      const ca = countsByCompany.get(a.id)!;
      const cb = countsByCompany.get(b.id)!;
      return cb.proposals - ca.proposals || cb.total - ca.total || a.name.localeCompare(b.name);
    });
  const withoutBacklog = clients.filter((c) => !countsByCompany.has(c.id));

  return (
    <>
      <PageHead
        eyebrow="Edges"
        title="Client Roadmaps"
        sub="Each client's AI Program roadmap: what they see in their portal. Open one to shape its groups, edit items, set priorities, and review their proposals."
      />

      <div className="admin-card u-p-0 u-clip">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Client</th>
              <th className="admin-th--sm u-right">Items</th>
              <th className="admin-th--lg">To review</th>
            </tr>
          </thead>
          <tbody>
            {[...withBacklog, ...withoutBacklog].map((c) => {
              const counts = countsByCompany.get(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/edges/client-roadmaps?company=${c.id}`} className="admin-cell-strong">
                      {c.name}
                    </Link>
                  </td>
                  <td className="u-right">
                    {counts ? counts.total : <span className="admin-cell-muted">—</span>}
                  </td>
                  <td>
                    {counts && counts.proposals > 0 ? (
                      <Badge tone="warn">
                        {counts.proposals} proposal{counts.proposals === 1 ? "" : "s"}
                      </Badge>
                    ) : counts ? (
                      <span className="admin-cell-muted">—</span>
                    ) : (
                      <span className="admin-cell-muted">no backlog yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="admin-cell-muted u-p-4">
                  No client companies found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
