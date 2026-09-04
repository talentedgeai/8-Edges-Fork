import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/lib/supabase";
import { getProgramDetail, PR_PAGE_SIZE } from "@/lib/hub/program";
import { formatLeverage } from "@/lib/hub/tokens";
import { getLiveCardItemIds } from "@/lib/admin/company-hub";
import { PageHead } from "@/components/admin/PageHead";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { Tabs, type TabDef } from "@/components/admin/Tabs";
import { MetricCard } from "@/components/admin/MetricCard";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { BarChart } from "@/components/admin/charts/BarChart";
import { CompanyDocuments, type ProgramOption } from "@/components/admin/CompanyDocuments";
import { MeetingsPanel } from "@/components/hub/MeetingsPanel";
import { setMeetingPublished, setMeetingProgram } from "@/app/admin/(dashboard)/revenue/meetings/actions";
import { BacklogAdminEditor } from "@/app/admin/(dashboard)/edges/client-roadmaps/BacklogAdminEditor";
import { OverviewEditor } from "@/app/admin/(dashboard)/edges/client-roadmaps/OverviewEditor";
import { formatDate } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import type { ProgramPullRequest, ProgramStatus } from "@/lib/hub/program";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ProgramStatus, BadgeTone> = {
  draft: "neutral",
  active: "ok",
  complete: "info",
  archived: "neutral",
};

const PR_STATE_TONE: Record<ProgramPullRequest["state"], BadgeTone> = {
  open: "info",
  merged: "ok",
  closed: "neutral",
};

function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}

function fmtHours(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// The AI Program view (Client Hub by AI Program, PR 1): one program = one
// repo = one roadmap = one token view = its work boards, plus tagged documents
// and pull requests. Data comes from lib/hub/program.ts; a program with no htt
// repo shows real zero states, never fake numbers.
export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: { id: string; programId: string };
  searchParams: SearchParamsObj;
}) {
  // PR tab state from the URL: server-side search + pagination over the full
  // PR set (the table's links/search preserve ?tab= so they land back here).
  const prSearch = firstParam(searchParams.q) ?? "";
  const prPageParam = Number(firstParam(searchParams.page)) || 1;

  const [detail, { data: companyRow }, { data: programRows }, { data: overviewRow }] = await Promise.all([
    getProgramDetail(params.id, params.programId, { page: prPageParam, search: prSearch }),
    companyOs.from("companies").select("id, name").eq("id", params.id).maybeSingle(),
    companyOs.from("ai_programs").select("id, name").eq("company_id", params.id).order("created_at", { ascending: false }),
    companyOs.from("client_roadmap_overview").select("body").eq("company_id", params.id).maybeSingle(),
  ]);
  const company = companyRow as { id: string; name: string | null } | null;
  if (!detail || !company) notFound();

  const companyName = company.name || "(no name)";
  const overviewBody = (overviewRow as { body: string } | null)?.body ?? "";
  const programOptions = (programRows ?? []) as ProgramOption[];
  const hasRepo = !!detail.repoId;
  const basePath = `/admin/revenue/companies/${company.id}/programs/${detail.id}`;

  const liveCardItemIds = await getLiveCardItemIds(detail.roadmapItems.map((i) => i.id));

  const prColumns: Column<ProgramPullRequest>[] = [
    {
      key: "number",
      header: "#",
      cell: (p) =>
        p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer">{p.number != null ? `#${p.number}` : "PR"}</a>
        ) : (
          p.number != null ? `#${p.number}` : "PR"
        ),
    },
    { key: "title", header: "Title", cell: (p) => <span className="admin-cell-strong">{p.title}</span> },
    { key: "state", header: "State", cell: (p) => <Badge tone={PR_STATE_TONE[p.state]}>{p.state}</Badge> },
    { key: "author", header: "Author", cell: (p) => p.author ?? "unknown" },
    { key: "merged", header: "Merged", cell: (p) => (p.mergedAt ? formatDate(p.mergedAt) : "") },
  ];

  const tabs: TabDef[] = [
    {
      key: "roadmap",
      label: "Roadmap",
      count: detail.roadmapItems.length,
      content: (
        <>
          <OverviewEditor companyId={company.id} initialBody={overviewBody} />
          <BacklogAdminEditor
            companyId={company.id}
            groups={detail.roadmapGroups}
            items={detail.roadmapItems}
            programs={programOptions}
            showArchived={false}
            liveCardItemIds={liveCardItemIds}
            defaultProgramId={detail.id}
          />
        </>
      ),
    },
    {
      key: "boards",
      label: "Boards",
      count: detail.boards.length,
      content: (
        <section className="admin-card admin-section-card">
          {detail.boards.length === 0 ? (
            <Empty text="No active boards keyed to this program yet. Link one from Work Boards." />
          ) : (
            <div className="admin-list">
              {detail.boards.map((b) => (
                <div className="admin-list-row" key={b.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">
                      <Link href={`/admin/boards/${b.slug}`}>{b.name}</Link>
                    </div>
                    <div className="admin-list-sub">
                      {b.cardCount} {b.cardCount === 1 ? "card" : "cards"}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Link className="admin-btn admin-btn--sm" href={`/admin/boards/${b.slug}`}>
                      Open board
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ),
    },
    {
      key: "tokens",
      label: "Tokens",
      content: (
        <section className="admin-card admin-section-card">
          {!hasRepo ? (
            <Empty text="No repo connected. Delivery tracking starts once this program is linked to a GitHub repo." />
          ) : (
            <>
              <div className="admin-kpi-grid u-mb-4">
                <MetricCard label="Delivered hrs (total)" value={fmtHours(detail.deliveredHours)} />
                <MetricCard label="AI tokens (total)" value={detail.aiTokens.toLocaleString()} />
                <MetricCard
                  label="AI leverage"
                  value={formatLeverage(detail.leverage)}
                  sub="AI value delivered per human hour"
                />
              </div>
              <h2 className="admin-card-title">Delivered hours, last 8 weeks</h2>
              <BarChart
                ariaLabel="Delivered hours per ISO week, last 8 weeks"
                data={detail.weeklyHours.map((w) => ({ label: w.isoWeek.slice(5), value: Math.round(w.hours * 10) / 10 }))}
                emptyText="No delivered hours tracked in the last 8 weeks."
                formatValue={(n) => `${fmtHours(n)}h`}
              />
            </>
          )}
        </section>
      ),
    },
    {
      key: "prs",
      label: "Pull Requests",
      count: detail.prTotalAll,
      content: (
        <section className="admin-card admin-section-card">
          {!hasRepo ? (
            <Empty text="No repo connected. Pull requests appear once this program is linked to a GitHub repo." />
          ) : (
            <DataTable
              columns={prColumns}
              rows={detail.pullRequests}
              total={detail.prTotal}
              page={detail.prPage}
              pageSize={PR_PAGE_SIZE}
              basePath={basePath}
              searchParams={searchParams}
              searchPlaceholder="Search pull requests"
              emptyText={prSearch ? "No pull requests match this search." : "No pull requests tracked yet."}
            />
          )}
        </section>
      ),
    },
    {
      key: "documents",
      label: "Documents",
      count: detail.documents.length,
      content: (
        <section className="admin-card admin-section-card">
          <CompanyDocuments
            companyId={company.id}
            documents={detail.documents}
            programs={programOptions}
            defaultProgramId={detail.id}
          />
        </section>
      ),
    },
    {
      key: "meetings",
      label: "Meetings",
      count: detail.meetings.length,
      content: (
        <section className="admin-card admin-section-card">
          <MeetingsPanel
            meetings={detail.meetings}
            publishAction={setMeetingPublished}
            programAction={setMeetingProgram}
            programOptions={programOptions}
          />
        </section>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        eyebrow={<Link href={`/admin/revenue/companies/${company.id}?view=hub`}>← {companyName}</Link>}
        title={detail.name}
        sub={detail.githubRepo ?? undefined}
        action={
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>{/* layout-ok: mirrors the company 360 PageHead action stack verbatim */}
            <span className="u-row u-wrap">{/* layout-ok: mirrors the company 360 badge row verbatim */}
              <Badge tone={STATUS_TONE[detail.status]}>{detail.status}</Badge>
              {detail.githubRepo && <Badge tone="neutral">{detail.githubRepo}</Badge>}
            </span>
            <span className="admin-cell-muted u-sm">
              {detail.liveUrl && (
                <>
                  <a href={detail.liveUrl} target="_blank" rel="noopener noreferrer">Live site</a>
                  {" · "}
                </>
              )}
              {detail.lastSyncedAt ? `Synced ${formatDate(detail.lastSyncedAt)}` : "Not synced yet"}
            </span>
          </div>
        }
      />

      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Delivered hrs"
          value={hasRepo ? fmtHours(detail.deliveredHours) : "Not tracked"}
          sub={hasRepo ? undefined : "No repo connected"}
        />
        <MetricCard
          label="AI tokens"
          value={hasRepo ? detail.aiTokens.toLocaleString() : "Not tracked"}
          sub={hasRepo ? undefined : "No repo connected"}
        />
        <MetricCard
          label="AI leverage"
          value={hasRepo ? formatLeverage(detail.leverage) : "Not tracked"}
          sub={hasRepo ? "AI value delivered per human hour" : "No repo connected"}
        />
        <MetricCard label="Planned tokens" value={detail.plannedTokens.toLocaleString()} sub="Roadmap high estimates" />
        <MetricCard
          label="PRs merged 30d"
          value={hasRepo ? detail.prsMergedLast30d.toLocaleString() : "Not tracked"}
          sub={hasRepo ? undefined : "No repo connected"}
        />
      </div>

      <div className="admin-card admin-section-card">
        <Tabs tabs={tabs} initialKey={firstParam(searchParams.tab)} syncParam="tab" />
      </div>
    </div>
  );
}
