import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { getProgramForActor, getPlanBriefForActor } from "@/entities/portal/lib/ai-programs";
import {
  getPortalProgramDelivery,
  listHubBoardsForActor,
  listPortalProgramPullRequests,
  getProgramHighlights,
  type PortalPullRequest,
  type ProgramHighlightWeek,
} from "@/entities/portal/lib/program-hub";
import { getWorkboardForBoard } from "@/entities/portal/lib/boards";
import { getBacklogForActor, getGroupsForActor, getRoadmapOverviewForActor } from "@/entities/portal/lib/backlog";
import { getMeetingsForActor } from "@/entities/portal/lib/meetings";
import { isPortalAdmin, canContribute } from "@/entities/portal/lib/roles";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone, type BadgeTone } from "@/kernel/ui/Badge";
import { BarChart, type TabDef, Tabs, Workboard } from "@/entities/company-os";
import { MeetingsPanel, PR_PAGE_SIZE, moveCard } from "@/entities/team";
import { BotText } from "@/entities/assistant";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { formatLeverage } from "@/entities/portal/lib/hub-tokens";
import { BacklogPortalView } from "../../roadmap/BacklogPortalView";
import { formatDate, formatHours, humanize } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { BriefViewer } from "./BriefViewer";
import { ProgramDocuments } from "./ProgramDocuments";

export const metadata = {
  title: "AI Program",
  description: "Your AI program's roadmap, work board, tokens, pull requests, documents, and meetings.",
};

const PR_STATE_TONE: Record<PortalPullRequest["state"], BadgeTone> = {
  open: "info",
  merged: "ok",
  closed: "neutral",
};

function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}

// The client-facing AI Program workspace, the same composition as the admin
// program view (KPI strip, then Roadmap / Work Board / Tokens / Pull Requests
// / Documents / Meetings tabs) with client-safe fields only: program name,
// counts and PR titles. Repo org/name, PR numbers, author logins and sync
// details never render here.
export default async function AiProgramDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParamsObj;
}) {
  const actor = await requirePortalMember();
  // IDOR gate first: the program must belong to the actor's companyScope.
  const program = await getProgramForActor(actor, params.id);
  if (!program) notFound();

  // PR tab state from the URL: server-side search + pagination over the full
  // PR set (the table's links/search preserve ?tab= so they land back here).
  const prSearch = firstParam(searchParams.q) ?? "";
  const prPageParam = Number(firstParam(searchParams.page)) || 1;

  const [delivery, prs, overview, allItems, allGroups, allMeetings, allBoards] = await Promise.all([
    getPortalProgramDelivery(actor, program.id),
    listPortalProgramPullRequests(actor, program.id, { page: prPageParam, search: prSearch }),
    getRoadmapOverviewForActor(actor, program.companyId),
    getBacklogForActor(actor),
    getGroupsForActor(actor),
    getMeetingsForActor(actor),
    listHubBoardsForActor(actor),
  ]);
  if (!delivery) notFound();
  const companyName = actor.memberships.find((m) => m.companyId === program.companyId)?.companyName ?? "AI Programs";

  // Roadmap: this program's items, under its own sections plus any
  // company-wide section a program item still sits in (same rule as the hub).
  const roadmapItems = allItems.filter((i) => i.ai_program_id === program.id);
  const usedKeys = new Set(roadmapItems.map((i) => i.group_key));
  const roadmapGroups = allGroups.filter(
    (g) => g.ai_program_id === program.id || (g.ai_program_id === null && usedKeys.has(g.key)),
  );
  const canPrioritize = isPortalAdmin(actor, program.companyId);
  const canPropose = canContribute(actor, program.companyId);

  // Work board(s): the program's boards; ?board= picks one when several exist.
  const programBoards = allBoards.filter((b) => b.aiProgramId === program.id);
  const boardSlug = firstParam(searchParams.board);
  const selectedBoard = programBoards.find((b) => b.slug === boardSlug) ?? programBoards[0] ?? null;
  const boardView = selectedBoard ? await getWorkboardForBoard(actor, selectedBoard.id) : null;

  // Delivery figures exist only once a repo is connected.
  const hasRepo = delivery.hasRepo;
  const highlights: ProgramHighlightWeek[] = hasRepo ? await getProgramHighlights(actor, program.id) : [];

  // Meetings: this program's tagged meetings. Visibility is the lib's own
  // rule (same as the hub): getMeetingsForActor returns published meetings,
  // plus drafts of companies the actor manages.
  const meetings = allMeetings.filter((m) => m.aiProgramId === program.id);

  // Plan briefs (guided 5Ds plans with saved HTML).
  const briefs = new Map<string, string>();
  await Promise.all(
    program.plans
      .filter((p) => p.method === "chat" && p.hasBrief)
      .map(async (p) => {
        const html = await getPlanBriefForActor(actor, p.id);
        if (html) briefs.set(p.id, html);
      }),
  );

  const basePath = `/portal/programs/${program.id}`;
  const prColumns: Column<PortalPullRequest>[] = [
    { key: "title", header: "Title", cell: (p) => <span className="admin-cell-strong">{p.title}</span> },
    { key: "state", header: "State", cell: (p) => <Badge tone={PR_STATE_TONE[p.state]}>{p.state}</Badge> },
    { key: "merged", header: "Merged", cell: (p) => (p.mergedAt ? formatDate(p.mergedAt) : "") },
  ];

  const tabs: TabDef[] = [
    {
      key: "roadmap",
      label: "Roadmap",
      count: roadmapItems.length,
      content: (
        <>
          {overview && (
            <section className="admin-card admin-section-card u-mb-4">
              <h2 className="admin-card-title u-mb-2">Overview</h2>
              <div className="u-lead-sm">
                <BotText text={overview} />
              </div>
            </section>
          )}
          {roadmapItems.length === 0 && roadmapGroups.length === 0 ? (
            <section className="admin-card admin-section-card">
              <Empty text="No roadmap items in this program yet. Edge8 adds them as the program is scoped." />
            </section>
          ) : (
            <BacklogPortalView
              items={roadmapItems}
              groups={roadmapGroups}
              companyId={program.companyId}
              canPrioritize={canPrioritize}
              canPropose={canPropose}
              programId={program.id}
            />
          )}
        </>
      ),
    },
    {
      key: "boards",
      label: "Work Board",
      content: boardView ? (
        <>
          {programBoards.length > 1 && (
            <div className="admin-viewtoggle u-mb-4">
              {programBoards.map((b) => (
                <Link
                  key={b.id}
                  href={`${basePath}?tab=boards&board=${b.slug}`}
                  className={selectedBoard?.id === b.id ? "is-active" : ""}
                >
                  {b.name}
                </Link>
              ))}
            </div>
          )}
          {/* Read-only: the client never moves, adds or edits a card. moveCard is
              handed over only because the component takes it; it is never called. */}
          <Workboard data={boardView} onMove={moveCard} viewerPersonId={actor.personId} canMove={false} canAdd={false} canEdit={false} />
        </>
      ) : (
        <section className="admin-card admin-section-card">
          <Empty text="No work board for this program yet." />
        </section>
      ),
    },
    {
      key: "tokens",
      label: "Tokens",
      content: (
        <section className="admin-card admin-section-card">
          {!hasRepo ? (
            <Empty text="Delivery tracking starts when a repo is connected." />
          ) : (
            <>
              <div className="admin-kpi-grid u-mb-4">
                <MetricCard label="Delivered hrs (total)" value={formatHours(delivery.deliveredHours)} />
                <MetricCard label="AI tokens (total)" value={delivery.aiTokens.toLocaleString()} />
                <MetricCard
                  label="AI leverage"
                  value={formatLeverage(delivery.leverage)}
                  sub="AI value delivered per human hour"
                />
              </div>
              <h2 className="admin-card-title">Delivered hours, last 8 weeks</h2>
              <BarChart
                ariaLabel="Delivered hours per ISO week, last 8 weeks"
                data={delivery.weeklyHours.map((w) => ({ label: w.isoWeek.slice(5), value: Math.round(w.hours * 10) / 10 }))}
                emptyText="No delivered hours tracked in the last 8 weeks."
                formatValue={(n) => `${formatHours(n)}h`}
              />
              <h2 className="admin-card-title u-mt-5">Shipped highlights</h2>
              {highlights.length === 0 ? (
                <Empty text="Nothing shipped in the last 8 weeks yet." />
              ) : (
                highlights.map((w) => (
                  <div key={w.isoWeek} className="u-mb-4">
                    <div className="admin-cell-muted u-mb-1 u-sm u-strong">
                      Week {w.isoWeek.slice(5).replace("W", "")} ({w.isoWeek.slice(0, 4)})
                    </div>
                    <ul className="u-list-inset u-lg">
                      {w.titles.map((t, i) => (
                        <li key={`${w.isoWeek}-${i}`}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </>
          )}
        </section>
      ),
    },
    {
      key: "prs",
      label: "Pull Requests",
      count: prs.totalAll,
      content: (
        <section className="admin-card admin-section-card">
          {!hasRepo ? (
            <Empty text="Pull requests appear once delivery tracking is connected." />
          ) : (
            <DataTable
              columns={prColumns}
              rows={prs.rows}
              total={prs.total}
              page={prs.page}
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
      count: program.documents.length,
      content: (
        <>
          <section className="admin-card admin-section-card">
            {program.documents.length === 0 ? (
              <Empty text="No documents uploaded." />
            ) : (
              <ProgramDocuments documents={program.documents} actorEmail={actor.email} />
            )}
          </section>
          {program.plans.length > 0 && (
            <section className="admin-card admin-section-card u-mt-4">
              <h2 className="admin-card-title u-mb-3">Plan</h2>
              <div className="u-stack u-gap-4">
                {program.plans.map((pl) => (
                  <div key={pl.id}>
                    <div className="u-row u-mb-2">
                      <strong>{pl.title}</strong>
                      <Badge>{pl.method === "chat" ? "Guided plan" : "Documents"}</Badge>
                      <span className="admin-cell-muted">{formatDate(pl.createdAt)}</span>
                    </div>
                    {pl.method === "chat" && briefs.has(pl.id) ? (
                      <BriefViewer html={briefs.get(pl.id)!} title={pl.title} />
                    ) : pl.method === "chat" ? (
                      <div className="admin-cell-muted">This plan has no saved brief.</div>
                    ) : (
                      <div className="admin-cell-muted">See the documents above.</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ),
    },
    {
      key: "meetings",
      label: "Meetings",
      count: meetings.length,
      content: (
        <section className="admin-card admin-section-card">
          <MeetingsPanel meetings={meetings} detailBasePath="/portal/meetings" />
        </section>
      ),
    },
  ];

  return (
    <div>
      <PageHead
        eyebrow={<Link href="/portal/hub">← {companyName}</Link>}
        title={program.name}
        sub={`Created ${formatDate(program.createdAt)}`}
        action={<Badge tone={statusTone(program.status)}>{humanize(program.status)}</Badge>}
      />

      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Delivered hrs"
          value={hasRepo ? formatHours(delivery.deliveredHours) : "Not tracked"}
          sub={hasRepo ? undefined : "Delivery tracking not connected"}
        />
        <MetricCard
          label="AI tokens"
          value={hasRepo ? delivery.aiTokens.toLocaleString() : "Not tracked"}
          sub={hasRepo ? undefined : "Delivery tracking not connected"}
        />
        <MetricCard
          label="AI leverage"
          value={hasRepo ? formatLeverage(delivery.leverage) : "Not tracked"}
          sub={hasRepo ? "AI value delivered per human hour" : "Delivery tracking not connected"}
        />
        <MetricCard label="Planned tokens" value={delivery.plannedTokens.toLocaleString()} sub="Roadmap high estimates" />
        <MetricCard
          label="PRs merged 30d"
          value={hasRepo ? delivery.prsMerged30d.toLocaleString() : "Not tracked"}
          sub={hasRepo ? undefined : "Delivery tracking not connected"}
        />
      </div>

      <div className="admin-card admin-section-card">
        <Tabs tabs={tabs} initialKey={firstParam(searchParams.tab)} syncParam="tab" />
      </div>
    </div>
  );
}
