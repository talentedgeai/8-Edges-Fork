import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { STAGE_ACCENT_CYCLE } from "@/entities/company-os/lib/stageColors";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { JobReqBoard, type AppCard } from "./JobReqBoard";
import { JobPostingEditor } from "./JobPostingEditor";
import { AiRanking, type AiRankRow } from "./AiRanking";
import type { AiScreenSummary } from "@/entities/company-os/modules/hiring/resume-screen";
import { getInterviewerOptions, getLoop } from "@/entities/company-os/modules/hiring/ats/loop";
import { InterviewLoop } from "./InterviewLoop";
import { one } from "@/kernel/config/embedded";

// Data cache can freeze Supabase reads despite force-dynamic — see applications/page.tsx.
export const metadata = {
  title: "Job requisition",
  description: "One open role and its applicants.",
};

const STAGE_ACCENT = STAGE_ACCENT_CYCLE;

type Co = { name: string | null };
type ReqRow = {
  id: string;
  title: string | null;
  status: string | null;
  employment_type: string | null;
  location: string | null;
  remote_policy: string | null;
  salary_min_cents: number | null;
  salary_max_cents: number | null;
  currency: string | null;
  opened_at: string | null;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  slug: string | null;
  is_public: boolean;
  full_jd: string | null;
  application_questions: unknown;
  metadata: Record<string, unknown> | null;
  companies: Co | Co[] | null;
};
type Cp = { headline: string | null };
type P = { full_name: string | null; email: string; candidate_profile: Cp | Cp[] | null };
type AppRow = {
  id: string;
  current_stage_id: string | null;
  status: string | null;
  rating: number | null;
  applied_at: string | null;
  person_id: string | null;
  resume_document_id: string | null;
  ai_rating: number | null;
  ai_screen_status: string | null;
  ai_screen_error: string | null;
  ai_screened_at: string | null;
  ai_summary: AiScreenSummary | null;
  people: P | P[] | null;
};

export default async function JobReqDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const reqRes = await companyOs
    .from("job_requisitions")
    .select(
      "id, title, status, employment_type, location, remote_policy, salary_min_cents, salary_max_cents, currency, opened_at, description, requirements, responsibilities, slug, is_public, full_jd, application_questions, metadata, companies!client_company_id(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (reqRes.error || !reqRes.data) notFound();
  const req = reqRes.data as ReqRow;

  const [stagesRes, appsRes] = await Promise.all([
    companyOs.from("application_stages").select("id, name, position, is_terminal").eq("job_requisition_id", id).order("position"),
    companyOs
      .from("applications")
      .select(
        "id, current_stage_id, status, rating, applied_at, person_id, resume_document_id, ai_rating, ai_screen_status, ai_screen_error, ai_screened_at, ai_summary, people!person_id(full_name, email, candidate_profile(headline))",
      )
      .eq("job_requisition_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const stages = (stagesRes.data ?? []) as Array<{ id: string; name: string; position: number; is_terminal: boolean }>;
  const columns: KanbanColumn[] = stages.map((s, i) => ({ id: s.id, label: s.name, accent: STAGE_ACCENT[i % STAGE_ACCENT.length] }));
  const firstStageId = columns[0]?.id ?? "";

  const cards: AppCard[] = ((appsRes.data ?? []) as AppRow[]).map((a) => {
    const p = one(a.people);
    const cp = one(p?.candidate_profile ?? null);
    return {
      id: a.id,
      columnId: a.current_stage_id ?? firstStageId,
      candidateName: p?.full_name ?? p?.email ?? null,
      personId: a.person_id,
      headline: cp?.headline ?? null,
      status: a.status,
      rating: a.rating,
      appliedAt: a.applied_at,
    };
  });

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const aiRows: AiRankRow[] = ((appsRes.data ?? []) as AppRow[]).map((a) => {
    const p = one(a.people);
    return {
      id: a.id,
      candidateName: p?.full_name ?? p?.email ?? null,
      personId: a.person_id,
      stageName: a.current_stage_id ? stageName.get(a.current_stage_id) ?? null : null,
      aiRating: a.ai_rating,
      aiStatus: a.ai_screen_status,
      aiError: a.ai_screen_error,
      screenedAt: a.ai_screened_at,
      summary: a.ai_summary,
      resumeDocumentId: a.resume_document_id,
    };
  });

  const [loopSteps, interviewerOptions] = await Promise.all([getLoop(id), getInterviewerOptions()]);

  const co = one(req.companies)?.name ?? null;
  const salary =
    req.salary_min_cents != null || req.salary_max_cents != null
      ? `${formatCents(req.salary_min_cents, req.currency ?? undefined)} – ${formatCents(req.salary_max_cents, req.currency ?? undefined)}`
      : null;

  const sections = [
    { label: "Description", body: req.description },
    { label: "Requirements", body: req.requirements },
    { label: "Responsibilities", body: req.responsibilities },
  ].filter((s) => s.body);

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/talent/jobs">← Job Reqs</Link>}
        title={req.title || "(untitled req)"}
        sub={[co, salary].filter(Boolean).join(" · ") || undefined}
        action={
          req.status === "open" ? (
            <Link href={`/admin/talent/applications/new?req=${req.id}`} className="admin-btn admin-btn--primary">
              Add applicants
            </Link>
          ) : undefined
        }
      />

      <div className="u-row u-wrap u-mb-5">
        {req.status && <Badge tone={statusTone(req.status)}>{humanize(req.status)}</Badge>}
        {req.employment_type && <Badge>{humanize(req.employment_type)}</Badge>}
        {req.remote_policy && <Badge>{humanize(req.remote_policy)}</Badge>}
        {req.location && <Badge>{req.location}</Badge>}
        {req.opened_at && <span className="admin-cell-muted u-sm">Opened {formatDate(req.opened_at)}</span>}
      </div>

      <div className="u-strong u-lg u-m-0 u-mt-1 u-mb-3">
        Hiring pipeline · {cards.length} {cards.length === 1 ? "applicant" : "applicants"}
      </div>
      <JobReqBoard jobReqId={id} columns={columns} initialCards={cards} />

      <AiRanking jobReqId={id} rows={aiRows} />

      <InterviewLoop reqId={id} steps={loopSteps} interviewerOptions={interviewerOptions} />

      <JobPostingEditor
        reqId={id}
        posting={{
          isPublic: req.is_public,
          slug: req.slug ?? "",
          fullJd: req.full_jd ?? "",
          excerpt: typeof req.metadata?.excerpt === "string" ? req.metadata.excerpt : "",
          department: typeof req.metadata?.department === "string" ? req.metadata.department : "",
          featured: req.metadata?.featured === true,
          questions: Array.isArray(req.application_questions)
            ? (req.application_questions as unknown[]).filter((q): q is string => typeof q === "string").slice(0, 3)
            : [],
          reqIsOpen: req.status === "open",
        }}
      />

      {sections.length > 0 && (
        <div className="u-mt-6 u-stack u-gap-4">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="admin-label u-mb-1">{s.label}</div>
              <div className="admin-card u-p-4 u-lg u-prewrap">{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
