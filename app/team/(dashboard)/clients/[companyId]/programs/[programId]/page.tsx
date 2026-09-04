import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/team-auth";
import {
  getActorClientCompanies,
  getActorEmail,
  getProgramDetailForActor,
} from "@/lib/team/clients";
import { PR_PAGE_SIZE, type ProgramPullRequest, type ProgramStatus } from "@/lib/hub/program";
import { formatLeverage } from "@/lib/hub/tokens";
import { getRepoStory, type RepoStoryBlock } from "@/lib/htt/project-summaries";
import { ROADMAP_GROUPS_SELECT, type RoadmapGroup } from "@/lib/client-backlog";
import { PageHead } from "@/components/admin/PageHead";
import { Badge, type BadgeTone } from "@/components/admin/Badge";
import { Tabs, type TabDef } from "@/components/admin/Tabs";
import { MetricCard } from "@/components/admin/MetricCard";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { BarChart } from "@/components/admin/charts/BarChart";
import { BotText } from "@/components/assistant/BotText";
import { MeetingsPanel, type ProgramOption } from "@/components/hub/MeetingsPanel";
import { formatDate } from "@/lib/admin/format";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";
import { ClientDocumentsList } from "../../(hub)/ClientDocumentsList";
import { AddItemForm } from "../../(hub)/roadmap/AddItemForm";
import { RoadmapItemCard } from "../../(hub)/roadmap/RoadmapItemCard";
import { publishMeeting, setMeetingProgram } from "../../(hub)/meetings/actions";

export const dynamic = "force-dynamic";

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
              <div style={{ fontSize: 14, lineHeight: 1.65 }}>
                <BotText text={overview} />
              </div>
            </section>
          )}

          <AddItemForm companyId={company.id} groups={addableGroups} programId={detail.id} />

          {detail.roadmapItems.length === 0 ? (
            <div className="admin-card admin-section-card" style={{ padding: 22 }}>
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
      label: "Boards",
      count: detail.boards.length,
      content: (
        <section className="admin-card admin-section-card">
          {detail.boards.length === 0 ? (
            <Empty text="No active boards keyed to this program yet." />
          ) : (
            <div className="admin-list">
              {detail.boards.map((b) => (
                <div className="admin-list-row" key={b.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">
                      <Link href={`/team/boards/${b.slug}`}>{b.name}</Link>
                    </div>
                    <div className="admin-list-sub">
                      {b.cardCount} {b.cardCount === 1 ? "card" : "cards"}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Link className="admin-btn admin-btn--sm" href={`/team/boards/${b.slug}`}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>{/* layout-ok: mirrors the admin program PageHead action stack verbatim */}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: 16 }}>{/* layout-ok: story-card grid, mirrors the kpi grid spacing above */}
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>{/* layout-ok: title row with the as-of stamp right-aligned */}
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>{/* layout-ok: card heading, matches admin card headings */}
        {block.asOf && (
          <span className="admin-cell-muted u-sm u-nowrap">{/* layout-ok: small as-of stamp */}
            as of {formatDate(block.asOf)}
          </span>
        )}
      </div>
      <p className="admin-cell-muted" style={{ margin: "2px 0 10px", fontSize: 12 }}>{/* layout-ok: source label under the heading */}{label}</p>
      {block.stale && (
        <p className="admin-cell-muted" style={{ margin: "0 0 8px", fontSize: 12, fontStyle: "italic" }}>{/* layout-ok: stale note */}
          The status page has not changed in over a week.
        </p>
      )}
      <p style={{ whiteSpace: "pre-line", margin: 0, fontSize: 14, lineHeight: 1.6 }}>{/* layout-ok: summary prose */}{block.content}</p>
    </section>
  );
}
