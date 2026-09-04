import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalMember } from "@/lib/portal-auth";
import { getProgramForActor, getPlanBriefForActor } from "@/lib/portal/ai-programs";
import {
  getPortalProgramDelivery,
  listHubBoardsForActor,
  getBoardViewForActor,
  getProgramHighlights,
  type PortalBoardView,
  type ProgramHighlightWeek,
} from "@/lib/portal/program-hub";
import { getBacklogForActor, getGroupsForActor } from "@/lib/portal/backlog";
import { getMeetingsForActor } from "@/lib/portal/meetings";
import { isPortalAdmin, canContribute } from "@/lib/portal/roles";
import { PageHead } from "@/components/admin/PageHead";
import { Badge, statusTone } from "@/components/admin/Badge";
import { Tabs, type TabDef } from "@/components/admin/Tabs";
import { MetricCard } from "@/components/admin/MetricCard";
import { formatLeverage } from "@/lib/hub/tokens";
import { BarChart } from "@/components/admin/charts/BarChart";
import { ClientBoardView } from "@/components/hub/ClientBoardView";
import { MeetingsPanel } from "@/components/hub/MeetingsPanel";
import { BacklogPortalView } from "../../roadmap/BacklogPortalView";
import { formatDate, humanize } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { BriefViewer } from "./BriefViewer";
import { ProgramDocuments } from "./ProgramDocuments";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Program",
  description: "Your AI program's overview, roadmap, work board, documents, and meetings.",
};

function fmtHours(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
}
// AI tokens run into the millions; compact keeps the KPI legible.
function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}

// The client-facing AI Program workspace: one program's roadmap, work board,
// progress, documents, plan brief, and meetings, mirroring the admin program
// view with client-safe fields only (program name + counts + PR titles; repo
// org/name, author logins, and sync details never render here).
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

  const [delivery, allItems, allGroups, allMeetings, allBoards] = await Promise.all([
    getPortalProgramDelivery(actor, program.id),
    getBacklogForActor(actor),
    getGroupsForActor(actor),
    getMeetingsForActor(actor),
    listHubBoardsForActor(actor),
  ]);
  if (!delivery) notFound();

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
  const boardView: PortalBoardView | null = selectedBoard
    ? await getBoardViewForActor(actor, selectedBoard.id)
    : null;

  // Progress: delivery stats exist only once a repo is connected.
  const hasRepo = delivery.hasRepo;
  const highlights: ProgramHighlightWeek[] = hasRepo
    ? await getProgramHighlights(actor, program.id)
    : [];

  // Meetings: this program's tagged meetings. Visibility is the lib's own
  // rule (same as the hub): getMeetingsForActor returns published meetings,
  // plus drafts of companies the actor manages, so client managers see this
  // program's drafts here too and other members stay published-only.
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

  const tabs: TabDef[] = [
    {
      key: "overview",
      label: "Overview",
      content: (
        <>
          <section className="admin-card admin-section-card">
            {!hasRepo ? (
              <Empty text="Delivery tracking starts when a repo is connected." />
            ) : (
              <>
                <div className="admin-kpi-grid u-mb-4">
                  <MetricCard
                    label="Human Tokens"
                    value={fmtHours(delivery.deliveredHours)}
                    sub="hours of skilled work delivered"
                  />
                  <MetricCard label="AI Tokens" value={fmtCompact(delivery.aiTokens)} sub="Claude + app tokens used" />
                  <MetricCard
                    label="Pull Requests"
                    value={delivery.prsMergedTotal.toLocaleString("en-US")}
                    sub="merged to date"
                  />
                  <MetricCard
                    label="Leverage"
                    value={formatLeverage(delivery.leverage)}
                    sub="AI value delivered per human hour"
                  />
                </div>
                <h2 className="admin-card-title">Delivered hours, last 8 weeks</h2>
                <BarChart
                  ariaLabel="Delivered hours per ISO week, last 8 weeks"
                  data={delivery.weeklyHours.map((w) => ({ label: w.isoWeek.slice(5), value: Math.round(w.hours * 10) / 10 }))}
                  emptyText="No delivered hours tracked in the last 8 weeks."
                  formatValue={(n) => `${fmtHours(n)}h`}
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
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
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
          {program.plans.length > 0 && (
            <section className="admin-card admin-section-card" style={{ maxWidth: 900, marginTop: 16 }}>
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
                      <div className="admin-cell-muted">See the Documents tab.</div>
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
      key: "roadmap",
      label: "Roadmap",
      count: roadmapItems.length,
      content:
        roadmapItems.length === 0 && roadmapGroups.length === 0 ? (
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
        ),
    },
    {
      key: "board",
      label: "Work Board",
      content: boardView ? (
        <>
          {programBoards.length > 1 && (
            <div className="admin-viewtoggle u-mb-4">
              {programBoards.map((b) => (
                <Link
                  key={b.id}
                  href={`/portal/programs/${program.id}?tab=board&board=${b.slug}`}
                  className={selectedBoard?.id === b.id ? "is-active" : ""}
                >
                  {b.name}
                </Link>
              ))}
            </div>
          )}
          <ClientBoardView board={boardView} viewerPersonId={actor.personId} />
        </>
      ) : (
        <section className="admin-card admin-section-card">
          <Empty text="No work board for this program yet." />
        </section>
      ),
    },
    {
      key: "documents",
      label: "Documents",
      count: program.documents.length,
      content: (
        <section className="admin-card admin-section-card u-max-narrow">
          {program.documents.length === 0 ? (
            <Empty text="No documents uploaded." />
          ) : (
            <ProgramDocuments documents={program.documents} actorEmail={actor.email} />
          )}
        </section>
      ),
    },
    {
      key: "meetings",
      label: "Meetings",
      count: meetings.length,
      content: (
        <section className="admin-card admin-section-card u-max-narrow">
          <MeetingsPanel meetings={meetings} detailBasePath="/portal/meetings" />
        </section>
      ),
    },
  ];

  return (
    <div className="admin-content">
      <PageHead
        eyebrow={<Link href="/portal/hub">← AI Programs</Link>}
        title={program.name}
        sub={`Created ${formatDate(program.createdAt)}`}
        action={<Badge tone={statusTone(program.status)}>{humanize(program.status)}</Badge>}
      />
      <Tabs tabs={tabs} initialKey={firstParam(searchParams.tab)} syncParam="tab" />
    </div>
  );
}
