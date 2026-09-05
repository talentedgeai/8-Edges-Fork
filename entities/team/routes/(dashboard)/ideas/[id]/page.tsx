import Link from "next/link";
import { notFound } from "next/navigation";
import { remark } from "remark";
import remarkHtml from "remark-html";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getSharedIdea, type SharedIdea } from "@/entities/team/lib/data";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { EditablePlan } from "./EditablePlan";
import { IDEA_STATUS_LABEL, OFFICE_LABEL, ideaStatusTone, officeTone, type IdeaOffice, type IdeaStatus } from "@/entities/company-os";

export const metadata = { title: "Idea" };

const D_SECTIONS: { key: keyof SharedIdea; d: string; label: string }[] = [
  { key: "problem", d: "Define", label: "The problem" },
  { key: "data_needed", d: "Discover", label: "Data it needs" },
  { key: "workflow", d: "Design", label: "The workflow" },
  { key: "roi", d: "Determine", label: "Expected ROI" },
];

// Ideas and learnings are company-visible (Learn and Share); getSharedIdea
// hides archived rows from everyone but their submitter.

export default async function IdeaDetailPage({ params }: { params: { id: string } }) {
  const actor = await requireTeamMember();
  const idea = await getSharedIdea(actor, params.id);
  if (!idea) notFound();

  const isOwner = idea.person_id === actor.personId;
  const isLearning = idea.kind === "learning";

  // AI-generated markdown: sanitize on render — the model's output is not a
  // trusted HTML source.
  const aiHtml = idea.ai_plan
    ? String(await remark().use(remarkHtml, { sanitize: true }).process(idea.ai_plan))
    : null;

  return (
    <>
      <PageHead
        eyebrow={isLearning ? "Learning" : "Idea"}
        title={idea.title}
        sub={`${isOwner ? "Submitted" : `Shared by ${idea.submitterName}`} ${formatDate(idea.created_at)}`}
        action={
          <Link href={isLearning ? "/team/ideas" : "/team/ideas?view=plans"} className="admin-btn">
            All ideas
          </Link>
        }
      />

      <div className="u-row u-mb-4">
        {idea.office && <Badge tone={officeTone(idea.office)}>{OFFICE_LABEL[idea.office as IdeaOffice]}</Badge>}
        {!isLearning && (
          <Badge tone={ideaStatusTone(idea.status)}>
            {IDEA_STATUS_LABEL[idea.status as IdeaStatus] ?? idea.status}
          </Badge>
        )}
      </div>

      <div className="admin-content">
        {isLearning ? (
          <>
            {aiHtml ? (
              <div className="admin-card u-p-5 u-mb-5">
                <h2 className="admin-card-title">The learning</h2>
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
              </div>
            ) : null}
            <div className="admin-card u-p-5">
              <h2 className="admin-card-title">{aiHtml ? (isOwner ? "What you shared" : "As shared") : "The learning"}</h2>
              <dl className="admin-kv">
                <div className="u-span-all u-mb-3">
                  <dt className="u-mb-1">What happened</dt>
                  <dd className="u-prewrap">{idea.story ?? ""}</dd>
                </div>
                <div className={`u-span-all ${idea.source_urls?.length ? "u-mb-3" : "u-mb-0"}`}>
                  <dt className="u-mb-1">The takeaway</dt>
                  <dd className="u-prewrap">{idea.takeaway ?? ""}</dd>
                </div>
                {idea.source_urls && idea.source_urls.length > 0 && (
                  <div className="u-span-all">
                    <dt className="u-mb-1">Source</dt>
                    <dd>
                      <ul className="u-list">
                        {idea.source_urls.map((url) => (
                          <li key={url}>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        ) : (
          <>
            {aiHtml && isOwner ? (
              <EditablePlan
                ideaId={idea.id}
                title={idea.title}
                markdown={idea.ai_plan ?? ""}
                html={aiHtml}
                sub={
                  "Written from your 5D answers. It's in the company backlog now — this is the document to bring when someone asks \"what would we actually build?\""
                }
              />
            ) : aiHtml ? (
              <div className="admin-card u-p-5 u-mb-5">
                <h2 className="admin-card-title">The product plan</h2>
                <p className="admin-page-sub u-mt-0">
                  {`Written from ${idea.submitterName}'s 5D answers. It's in the company backlog.`}
                </p>
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: aiHtml }} />
              </div>
            ) : (
              <div className="admin-card u-p-5 u-mb-5">
                <h2 className="admin-card-title">Plan not ready yet</h2>
                <p className="admin-page-sub u-mt-0">
                  The idea is safely in the backlog, but the product plan didn&apos;t generate. It
                  will be retried — check back here soon.
                </p>
              </div>
            )}

            <div className="admin-card u-p-5">
              <h2 className="admin-card-title">{isOwner ? "What you submitted" : "The 5D answers"}</h2>
              <dl className="admin-kv">
                {D_SECTIONS.map((s) => (
                  <div key={s.key as string} className="u-span-all u-mb-3">
                    <dt className="u-mb-1">
                      {s.d} · {s.label}
                    </dt>
                    <dd className="u-prewrap">{String(idea[s.key] ?? "")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}
      </div>
    </>
  );
}
