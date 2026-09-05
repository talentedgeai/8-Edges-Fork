import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  getActorClientCompanies,
  getActorEmail,
  getProgramDetailForActor,
} from "@/entities/team/modules/hub/clients";
import { PR_PAGE_SIZE, type ProgramPullRequest, type ProgramStatus } from "@/entities/team/modules/hub/program";
import { formatLeverage } from "@/entities/portal";
import { getRepoStory, type RepoStoryBlock } from "@/entities/htt";
import { ROADMAP_GROUPS_SELECT, type RoadmapGroup } from "@/entities/portal";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { BotText } from "@/entities/assistant";
import { MeetingsPanel, type ProgramOption } from "@/entities/team/modules/hub/ui/MeetingsPanel";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { ClientDocumentsList } from "../../(hub)/ClientDocumentsList";
import { AddItemForm } from "../../(hub)/roadmap/AddItemForm";
import { RoadmapItemCard } from "../../(hub)/roadmap/RoadmapItemCard";
import { publishMeeting, setMeetingProgram } from "../../(hub)/meetings/actions";
import { Tabs, type TabDef, BarChart, BoardView, listBoardManageOptions } from "@/entities/company-os";
import { getBoardForActor } from "@/entities/team/lib/boards";
import { moveCard } from "@/entities/team/lib/move-card";

export const metadata = { title: "AI Program" };

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

// The team AI Program view, mirroring the admin program view (KPI strip +
// Roadmap / Boards / Tokens / Pull Requests / Documents / Meetings) with team
// affordances: roadmap add/edit as the team roadmap tab allows, boards linking
// to the team board routes, the team publish/tag meeting actions, and the team
// documents list. Authorization mirrors the hub layout: the company must be in
// the actor's active staff assignments, and the program must belong to that
// company; either miss is a 404.
export default async function TeamProgramDetailPage({
  params,
  searchParams,
}: {
  params: { companyId: string; programId: string };
  searchParams: SearchParamsObj;
}) {
  const actor = await requireTeamMember();

  // PR tab state from the URL: server-side search + pagination over the full
  // PR set (the table's links/search preserve ?tab= so they land back here).
  const prSearch = firstParam(searchParams.q) ?? "";
  const prPageParam = Number(firstParam(searchParams.page)) || 1;

  const [companies, detail, actorEmail] = await Promise.all([
    getActorClientCompanies(actor),
    getProgramDetailForActor(actor, params.companyId, params.programId, {
      page: prPageParam,
      search: prSearch,
    }),
    getActorEmail(actor),
  ]);
  const company = companies.find((c) => c.id === params.companyId);
  if (!company || !detail) notFound();

  // The company's programs (Meetings tag options) and its full group list
  // (Add-item options: the program's own groups plus every company-wide one,
  // so the first program item can land under a company-wide section too).
  const [{ data: programRows }, { data: groupRows }, { data: overviewRow }] = await Promise.all([
    companyOs.from("ai_programs").select("id, name").eq("company_id", params.companyId).order("created_at", { ascending: false }),
    companyOs.from("client_roadmap_groups").select(ROADMAP_GROUPS_SELECT).eq("company_id", params.companyId).is("archived_at", null).order("sort_order", { ascending: true }),
    companyOs.from("client_roadmap_overview").select("body").eq("company_id", params.companyId).maybeSingle(),
  ]);
  const programOptions = (programRows ?? []) as ProgramOption[];
  const allGroups = (groupRows ?? []) as unknown as RoadmapGroup[];
  const addableGroups = allGroups.filter((g) => g.ai_program_id === detail.id || g.ai_program_id === null);
  const overview = ((overviewRow as { body: string } | null)?.body ?? "").trim() || null;
  const hasRepo = !!detail.repoId;
  // Cached AI story for the program's repo (executive summary + latest-PRs digest),
  // written nightly by htt-refresh-summaries. Pure cache read; when no rows exist yet
  // the section renders nothing at all.
  const story = detail.repoId
    ? await getRepoStory(detail.repoId)
    : { executive: null, latestPrs: null };
  const basePath = `/team/clients/${company.id}/programs/${detail.id}`;

  // One program = one workboard, so the Work Board tab renders the board
  // itself instead of a one-row list to click through. getBoardForActor is
  // the authorization: null unless the actor is a member (or admin), and
  // active staff assignments to the client already imply membership.
  const programBoard = detail.boards[0] ?? null;
  const [boardDetail, boardOptions] = await Promise.all([
    programBoard ? getBoardForActor(actor, programBoard.slug) : Promise.resolve(null),
    actor.isAdmin && programBoard ? listBoardManageOptions() : Promise.resolve({ team: [], clients: [], programs: [] }),
  ]);

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
        <div className="admin-roadmap">

          {overview && (
            <section className="admin-card admin-section-card u-mb-4">
              <h2 className="admin-card-title u-mb-2">Overview</h2>
              <div className="u-lead-sm">
                <BotText text={overview} />
              </div>
            </section>
          )}

          <AddItemForm companyId={company.id} groups={addableGroups} programId={detail.id} />

          {detail.roadmapItems.length === 0 ? (
            <div className="admin-card admin-section-card u-p-5">
              <p className="admin-page-sub u-m-0">No roadmap items on this program yet.</p>
            </div>
          ) : (
            detail.roadmapGroups.map((g) => {
              const groupItems = detail.roadmapItems.filter((i) => i.group_key === g.key);
              if (groupItems.length === 0) return null;
              return (
                <div key={g.key} className="admin-roadmap-group">
                  <div className="admin-roadmap-group-head">
                    {g.step_label && <span className="admin-roadmap-step">{g.step_label}</span>}
                    <span className="admin-roadmap-group-title">{g.title}</span>
                  </div>
                  {g.intro && <div className="admin-roadmap-group-intro">{g.intro}</div>}
                  {groupItems.map((it) => (
                    <RoadmapItemCard key={it.id} item={it} companyId={company.id} />
                  ))}
                </div>
              );
            })
          )}
        </div>
      ),
    },
    {
      key: "boards",
      label: "Work Board",
      content: boardDetail ? (
        <>
          <div className="u-row u-end u-mb-3">
            <Link className="admin-btn admin-btn--sm" href={`/team/boards/${boardDetail.board.slug}`}>
              Open full board
            </Link>
          </div>
          <BoardView
            onMove={moveCard}
            detail={boardDetail}
            canManage={actor.isAdmin}
            teamOptions={boardOptions.team}
            clientOptions={boardOptions.clients}
            programOptions={boardOptions.programs}
            viewerPersonId={actor.personId}
          />
        </>
      ) : (
        <section className="admin-card admin-section-card">
          <Empty text={programBoard ? "This program's board isn't shared with you." : "No work board for this program yet."} />
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
          <ClientDocumentsList
            documents={detail.documents}
            companyId={company.id}
            actorEmail={actorEmail}
            programId={detail.id}
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
            publishAction={publishMeeting}
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
        eyebrow={<Link href={`/team/clients/${company.id}`}>← {company.name}</Link>}
        title={detail.name}
        sub={detail.githubRepo ?? undefined}
        action={
          <div className="u-stack u-items-end">
            <span className="u-row u-wrap">{/* layout-ok: mirrors the admin program badge row verbatim */}
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

      {(story.executive || story.latestPrs) && (
        <div className="u-grid-auto-340 u-mb-4">
          {story.executive && (
            <StoryCard title="About this program" label="Condensed from the project's status page" block={story.executive} />
          )}
          {story.latestPrs && (
            <StoryCard title="What changed lately" label="Written from the pull request record, refreshed nightly" block={story.latestPrs} />
          )}
        </div>
      )}

      <div className="admin-card admin-section-card">
        <Tabs tabs={tabs} initialKey={firstParam(searchParams.tab)} syncParam="tab" />
      </div>
    </div>
  );
}

function StoryCard({ title, label, block }: { title: string; label: string; block: RepoStoryBlock }) {
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-story-card-head">
        <h3 className="admin-story-card-title">{title}</h3>
        {block.asOf && (
          <span className="admin-cell-muted u-sm u-nowrap">{/* layout-ok: small as-of stamp */}
            as of {formatDate(block.asOf)}
          </span>
        )}
      </div>
      <p className="admin-cell-muted admin-story-card-label">{label}</p>
      {block.stale && (
        <p className="admin-cell-muted admin-story-card-note">
          The status page has not changed in over a week.
        </p>
      )}
      <p className="admin-story-card-body">{block.content}</p>
    </section>
  );
}
