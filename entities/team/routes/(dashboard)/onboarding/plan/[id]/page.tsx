import { notFound, redirect } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { teamRead } from "@/entities/team/lib/data";
import { PageHead } from "@/kernel/ui/PageHead";
import { getPlanMarkdown, isMarkdownPlan, signedPlanUrl } from "@/entities/team/modules/onboarding/cycle";
import { renderPlanMarkdown } from "@/entities/company-os";

export const metadata = { title: "Onboarding plan" };

// In-app view of a journey's onboarding plan, scoped by teamRead: a manager
// (or the person themselves) reads exactly their own scope, nothing else.
// Markdown renders right here; any other file type redirects to a short-lived
// signed URL; a link-plan redirects to the link.
export default async function TeamPlanViewPage({ params }: { params: { id: string } }) {
  const actor = await requireTeamMember();

  const { data } = await teamRead(
    actor,
    "onboarding_plans",
    "id, plan_url, plan_path, team_members:team_members!team_member_id(people:people!person_id(full_name, preferred_name))",
  )
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();

  const row = data as unknown as {
    plan_url: string | null;
    plan_path: string | null;
    team_members:
      | { people: { full_name: string | null; preferred_name: string | null } | { full_name: string | null; preferred_name: string | null }[] | null }
      | { people: { full_name: string | null; preferred_name: string | null } | { full_name: string | null; preferred_name: string | null }[] | null }[]
      | null;
  };

  if (row.plan_url) redirect(row.plan_url);
  if (!row.plan_path) notFound();

  if (!isMarkdownPlan(row.plan_path)) {
    const url = await signedPlanUrl(row.plan_path);
    if (!url) notFound();
    redirect(url);
  }

  const markdown = await getPlanMarkdown(row.plan_path);
  if (!markdown) notFound();
  const html = await renderPlanMarkdown(markdown);

  const tm = Array.isArray(row.team_members) ? row.team_members[0] : row.team_members;
  const person = Array.isArray(tm?.people) ? tm?.people[0] : tm?.people;
  const name = person?.preferred_name || person?.full_name || "team member";

  return (
    <>
      <PageHead eyebrow="Onboarding" title={`${name}'s onboarding plan`} sub="The plan their manager laid out for the first 180 days" />
      <div className="admin-card admin-content u-p-5">
        <div className="admin-plan-doc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}
