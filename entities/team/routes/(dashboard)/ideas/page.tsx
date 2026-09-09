import Link from "next/link";
import { remark } from "remark";
import remarkHtml from "remark-html";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSharedIdeas, type SharedIdea } from "@/entities/team/lib/data";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { IdeaForm } from "./IdeaForm";
import { LearningForm } from "./LearningForm";
import { IDEA_STATUS_LABEL, OFFICE_LABEL, ideaStatusTone, officeTone, type IdeaOffice, type IdeaStatus } from "@/entities/company-os";

export const metadata = {
  title: "Ideas that Spark Solutions",
  description: "What should we build? What have I learned? The whole team's ideas and learnings.",
};

// Ideas that Spark Solutions: the whole team sees the whole feed (Learn and
// Share). Two sections — Learnings (what have I learned?) and Plans (what
// should we build?, each with its Claude product plan). Sharing happens on
// this same page via ?compose=build|learning — no separate /new route, so
// there's one URL for the whole feature instead of a feed page and a form
// page that both claim to be "Ideas".

export default async function IdeasPage({ searchParams }: { searchParams: SearchParamsObj }) {
  await requireTeamMember();
  const view = firstParam(searchParams.view) === "plans" ? "plans" : "learnings";
  const composeParam = firstParam(searchParams.compose);
  const compose = composeParam === "learning" ? "learning" : composeParam === "build" ? "build" : null;

  if (compose) {
    return (
      <div className="admin-ideas-page">
        <PageHead
          eyebrow="Ideas"
          title={compose === "build" ? "What should we build?" : "What have I learned?"}
          sub={
            compose === "build"
              ? "Walk the 5D framework: Define, Discover, Design, Determine. Claude turns it into a product plan you keep."
              : "A lesson from your work — Learn and Share in action. It lands on the team feed for everyone."
          }
          action={
            <Link href="/team/ideas" className="admin-btn">
              Cancel
            </Link>
          }
        />

        <div className="admin-ideas-tabs">
          <Link
            href="/team/ideas?compose=build"
            className={`admin-ideas-tab${compose === "build" ? " admin-ideas-tab--active" : ""}`}
            aria-current={compose === "build" ? "page" : undefined}
          >
            What should we build?
          </Link>
          <Link
            href="/team/ideas?compose=learning"
            className={`admin-ideas-tab${compose === "learning" ? " admin-ideas-tab--active" : ""}`}
            aria-current={compose === "learning" ? "page" : undefined}
          >
            What have I learned?
          </Link>
        </div>

        <div className="admin-content--form">{compose === "build" ? <IdeaForm /> : <LearningForm />}</div>
      </div>
    );
  }

  const all = await getSharedIdeas();
  const learnings = all.filter((i) => i.kind === "learning");
  const builds = all.filter((i) => i.kind !== "learning");

  // Learnings show the Claude-polished summary when it exists; sanitize on
  // render — the model's output is not a trusted HTML source.
  const md = remark().use(remarkHtml, { sanitize: true });
  const summaryHtml = new Map<string, string>();
  if (view === "learnings") {
    await Promise.all(
      learnings.map(async (l) => {
        if (l.ai_plan) summaryHtml.set(l.id, String(await md.process(l.ai_plan)));
      }),
    );
  }

  const tabs = [
    { key: "learnings", label: `Learnings (${learnings.length})`, href: "/team/ideas" },
    { key: "plans", label: `Plans (${builds.length})`, href: "/team/ideas?view=plans" },
  ];

  return (
    <div className="admin-ideas-page">
      <PageHead
        eyebrow="Ideas"
        title="Ideas that Spark Solutions"
        sub="What should we build, and what have I learned? Everyone sees everything."
      />

      {/* Share: the primary action on this page — two equal-weight entry
          points, not one button hiding a second choice behind it. */}
      <div className="admin-ideas-share-grid">
        <Link href="/team/ideas?compose=build" className="admin-ideas-share-card">
          <div className="admin-ideas-share-icon" aria-hidden>◈</div>
          <h2>What should we build?</h2>
          <p>A workflow AI should own. Walk the 5D framework and get a product plan back in seconds.</p>
        </Link>
        <Link href="/team/ideas?compose=learning" className="admin-ideas-share-card">
          <div className="admin-ideas-share-icon" aria-hidden>✎</div>
          <h2>What have I learned?</h2>
          <p>A lesson worth sharing. Two minutes, no framework — it goes straight onto the team feed.</p>
        </Link>
      </div>

      {/* History: secondary — everything already shared, browsable below the
          share cards rather than competing with them for attention. */}
      <div className="admin-ideas-history">
        <div className="admin-ideas-history-head">
          <h2 className="admin-ideas-history-title">History</h2>
          <div className="admin-ideas-tabs">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`admin-ideas-tab${view === t.key ? " admin-ideas-tab--active" : ""}`}
                aria-current={view === t.key ? "page" : undefined}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {view === "learnings" ? (
          <LearningsFeed learnings={learnings} summaryHtml={summaryHtml} />
        ) : (
          <PlansTable builds={builds} />
        )}
      </div>
    </div>
  );
}

function LearningsFeed({
  learnings,
  summaryHtml,
}: {
  learnings: SharedIdea[];
  summaryHtml: Map<string, string>;
}) {
  if (learnings.length === 0) {
    return (
      <div className="admin-empty">
        Nothing shared yet — be the first with &ldquo;What have I learned?&rdquo; above.
      </div>
    );
  }

  return (
    <div className="admin-content u-stack u-gap-4">
      {learnings.map((l) => {
        const html = summaryHtml.get(l.id);
        return (
          <div key={l.id} className="admin-card u-p-5">
            <div className="u-row u-wrap u-between">
              <h2 className="admin-card-title u-mb-0">
                <Link href={`/team/ideas/${l.id}`}>{l.title}</Link>
              </h2>
              {l.office && (
                <Badge tone={officeTone(l.office)}>{OFFICE_LABEL[l.office as IdeaOffice]}</Badge>
              )}
            </div>
            <p className="admin-page-sub u-mt-1">
              {l.submitterName} · {formatDate(l.created_at)}
            </p>
            {html ? (
              <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <>
                <p className="u-mb-2 u-prewrap">{l.story}</p>
                {l.takeaway && (
                  <p className="u-mb-0 u-strong u-prewrap">{l.takeaway}</p>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlansTable({ builds }: { builds: SharedIdea[] }) {
  if (builds.length === 0) {
    return (
      <div className="admin-empty">
        Nothing submitted yet — be the first with &ldquo;What should we build?&rdquo; above.
      </div>
    );
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Idea</th>
            <th>Submitted by</th>
            <th>Office</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {builds.map((i) => (
            <tr key={i.id}>
              <td>
                <Link href={`/team/ideas/${i.id}`} className="admin-cell-strong">
                  {i.title}
                </Link>
              </td>
              <td>{i.submitterName}</td>
              <td>
                {i.office ? (
                  <Badge tone={officeTone(i.office)}>{OFFICE_LABEL[i.office as IdeaOffice]}</Badge>
                ) : (
                  <span className="admin-cell-muted">—</span>
                )}
              </td>
              <td>
                <Badge tone={ideaStatusTone(i.status)}>
                  {IDEA_STATUS_LABEL[i.status as IdeaStatus] ?? i.status}
                </Badge>
              </td>
              <td>
                {i.ai_plan ? (
                  <Badge tone="ok">Ready</Badge>
                ) : i.ai_error ? (
                  <Badge tone="warn">Pending</Badge>
                ) : (
                  <span className="admin-cell-muted">—</span>
                )}
              </td>
              <td>{formatDate(i.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
