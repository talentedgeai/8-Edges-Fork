import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { getProgramDetail, PR_PAGE_SIZE, moveCard } from "@/entities/team";
import { formatLeverage } from "@/entities/portal";
import { getLiveCardItemIds } from "@/entities/company-os/modules/crm/company-hub";
import { getAdminUser } from "@/kernel/identity/admin-auth";
import { getBoardBySlug, listBoardManageOptions } from "@/entities/company-os/modules/boards/data";
import { BoardView } from "@/entities/company-os/modules/boards/ui/BoardView";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { Tabs, type TabDef } from "@/entities/company-os/ui/Tabs";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { BarChart } from "@/entities/company-os/ui/charts/BarChart";
import { CompanyDocuments, type ProgramOption } from "@/entities/company-os/modules/crm/ui/CompanyDocuments";
import { MeetingsPanel } from "@/entities/team";
import { setMeetingPublished, setMeetingProgram } from "@/entities/company-os/routes/(dashboard)/revenue/meetings/actions";
import { BacklogAdminEditor } from "@/entities/company-os/routes/(dashboard)/edges/client-roadmaps/BacklogAdminEditor";
import { OverviewEditor } from "@/entities/company-os/routes/(dashboard)/edges/client-roadmaps/OverviewEditor";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import type { ProgramPullRequest, ProgramStatus } from "@/entities/team";

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

  // One program = one workboard (ensureProgramBoard keeps it that way), so the
  // Work Board tab renders the board itself instead of a one-row list to click
  // through. Should an older program still carry several, the first by
  // sort_order is the one shown.
  const programBoard = detail.boards[0] ?? null;
  const [liveCardItemIds, boardDetail, boardOptions, admin] = await Promise.all([
    getLiveCardItemIds(detail.roadmapItems.map((i) => i.id)),
    programBoard ? getBoardBySlug(programBoard.slug) : Promise.resolve(null),
    programBoard ? listBoardManageOptions() : Promise.resolve({ team: [], clients: [], programs: [] }),
    getAdminUser(),
  ]);
  // The admin's own person row, so cards freshly assigned to them wear "New".
  let viewerPersonId: string | null = null;
  if (admin && boardDetail) {
    const { data: viewer, error: viewerErr } = await companyOs
      .from("people")
      .select("id")
      .eq("email", admin.email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (viewerErr) console.error("ProgramDetailPage: viewer lookup failed:", viewerErr.message);
    else viewerPersonId = (viewer as { id: string } | null)?.id ?? null;
  }

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
      label: "Work Board",
      content: boardDetail ? (
        <>
          <div className="u-row u-end u-mb-3">
            <Link className="admin-btn admin-btn--sm" href={`/admin/boards/${boardDetail.board.slug}`}>
              Open full board
            </Link>
          </div>
          <BoardView
            onMove={moveCard}
            detail={boardDetail}
            canManage
            teamOptions={boardOptions.team}
            clientOptions={boardOptions.clients}
            programOptions={boardOptions.programs}
            viewerPersonId={viewerPersonId}
          />
        </>
      ) : (
        <section className="admin-card admin-section-card">
          <Empty text="No work board for this program yet. Link one from Work Boards." />
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
          <div className="u-stack u-items-end">
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
