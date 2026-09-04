import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { MetricCard } from "@/components/admin/MetricCard";
import { OfficeGoalsCard } from "@/components/admin/OfficeGoalsCard";
import { getOfficeGoals, healthSummary } from "@/lib/admin/office-goals";
import { MS_DAY } from "@/lib/admin/dashboard-helpers";
import { formatDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = {
  title: "Innovation cockpit",
  description: "Ideas, learnings, the internal backlog, and how much of the work AI carries.",
};

type IdeaRow = { id: string; title: string | null; kind: string | null; status: string | null; created_at: string };
type BoardRow = { id: string; name: string | null; client_company_id: string | null };

export default async function InnovationCockpitPage() {
  const now = new Date();
  const iso30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();

  const [ideasRes, boardsRes, tasksRes, krRes, trendRes, goals] = await Promise.all([
    companyOs.from("ideas").select("id, title, kind, status, created_at").neq("status", "archived").order("created_at", { ascending: false }).limit(200),
    companyOs.from("boards").select("id, name, client_company_id").is("archived_at", null),
    // status is only 'open' | 'done'; count top-level, unarchived, open cards.
    companyOs.from("tasks").select("board_id").eq("status", "open").is("archived_at", null).is("parent_task_id", null),
    companyOs.from("key_results").select("delivery_mix"),
    // Newest AI trends summary, written weekly by the idea-trends cron.
    companyOs.from("idea_trend_reports").select("themes, generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    getOfficeGoals(),
  ]);

  const err = ideasRes.error || boardsRes.error || tasksRes.error || krRes.error;

  const ideas = (ideasRes.data as IdeaRow[] | null) ?? [];
  const buildIdeas = ideas.filter((i) => i.kind === "build").length;
  const learnings30 = ideas.filter((i) => i.kind === "learning" && i.created_at >= iso30).length;

  // Internal backlog = open cards on our own (non-client) boards.
  const boards = (boardsRes.data as BoardRow[] | null) ?? [];
  const internalBoardIds = new Set(boards.filter((b) => b.client_company_id === null).map((b) => b.id));
  const tasks = (tasksRes.data as { board_id: string }[] | null) ?? [];
  const internalBacklog = tasks.filter((t) => internalBoardIds.has(t.board_id)).length;

  // AI delivery mix across every key result.
  const krs = (krRes.data as { delivery_mix: string | null }[] | null) ?? [];
  const mix = { human: 0, ai: 0, blended: 0 };
  for (const kr of krs) {
    if (kr.delivery_mix === "human" || kr.delivery_mix === "ai" || kr.delivery_mix === "blended") mix[kr.delivery_mix] += 1;
  }
  const mixTotal = mix.human + mix.ai + mix.blended;
  const agentShare = mixTotal ? Math.round(((mix.ai + mix.blended) / mixTotal) * 100) : 0;

  const recent = ideas.slice(0, 8);

  const trend = trendRes.data as { themes: string[] | null; generated_at: string } | null;
  const themes = (trend?.themes ?? []).filter((t) => typeof t === "string" && t.trim().length > 0);

  const innovation = goals.byOffice.innovation;
  const chips = healthSummary(innovation.health);

  return (
    <>
      <PageHead
        eyebrow="Four Offices · Innovation"
        title="Innovation cockpit"
        sub="Ideas, learnings, and how much of the work AI already carries."
      />

      {err && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {err.message}
        </div>
      )}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Ideas" value={buildIdeas} sub="open build ideas" href="/admin/innovation/ideas" />
        <MetricCard label="Learning · 30d" value={learnings30} sub="learnings logged" href="/admin/innovation/ideas" />
        <MetricCard label="Internal backlog" value={internalBacklog} sub="open cards, our boards" href="/admin/client-hubs" />
        <MetricCard
          label="AI delivery mix"
          value={`${agentShare}%`}
          sub={mixTotal ? `agent-run of ${mixTotal} key results` : "no key results yet"}
        />
      </div>

      {chips && (
        <div className="admin-kpi-label u-mb-4">
          Innovation goals · {goals.quarter.label}: {chips}
          {innovation.openIssues > 0 ? ` · ${innovation.openIssues} open ${innovation.openIssues === 1 ? "issue" : "issues"}` : ""}
        </div>
      )}

      <div className="admin-cockpit-cols u-mb-5">
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Trends across ideas</h2>
          {themes.length === 0 ? (
            <div className="admin-empty">
              An AI summary of the themes running through recent ideas and learnings will appear here, refreshed weekly.
            </div>
          ) : (
            <div className="admin-list">
              {themes.map((t, i) => (
                <div key={i} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{t}</div>
                  </div>
                </div>
              ))}
              {trend?.generated_at && (
                <div className="admin-list-sub u-pt-3">
                  Updated {formatDate(trend.generated_at)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">AI delivery mix</h2>
          <div className="admin-list">
            {(["ai", "blended", "human"] as const).map((k) => (
              <div key={k} className="admin-list-row">
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    {k === "ai" ? "Agent" : k === "blended" ? "Blended" : "Human"}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <span className="admin-list-sub">
                    {mix[k]}
                    {mixTotal ? ` · ${Math.round((mix[k] / mixTotal) * 100)}%` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-cockpit-cols">
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title">Recent ideas & learnings</h2>
          {recent.length === 0 ? (
            <div className="admin-empty">Nothing posted yet.</div>
          ) : (
            <div className="admin-list">
              {recent.map((i) => (
                <div key={i.id} className="admin-list-row">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{i.title || "Untitled"}</div>
                    <div className="admin-list-sub">{i.kind === "learning" ? "learning" : "build"}</div>
                  </div>
                  <div className="admin-list-aside">
                    <span className="admin-list-sub">{formatDate(i.created_at)}</span>
                  </div>
                </div>
              ))}
              <div className="u-pt-3">
                <Link href="/admin/innovation/ideas" className="admin-auth-link">
                  Open idea backlog →
                </Link>
              </div>
            </div>
          )}
        </div>

        <OfficeGoalsCard snapshot={innovation} quarterLabel={goals.quarter.label} />
      </div>
    </>
  );
}
