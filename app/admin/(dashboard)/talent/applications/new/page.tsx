import Link from "next/link";
import { companyOs } from "@/lib/supabase";
import { PageHead } from "@/components/admin/PageHead";
import { AddCandidates } from "./AddCandidates";

export const dynamic = "force-dynamic";
// Data cache can freeze Supabase reads despite force-dynamic — see ../page.tsx.
export const fetchCache = "force-no-store";

export const metadata = {
  title: "Add candidates",
  description: "Add candidates from resumes or by hand.",
};

// Recruiter intake: sourced candidates enter the pipeline here rather than via
// the public careers form. Only open reqs are offered — sourcing into a closed
// role is always a mistake. ?req=<id> preselects the position (the req page's
// "Add applicants" button links here with it).
export default async function AddCandidatesPage({
  searchParams,
}: {
  searchParams: { req?: string | string[] };
}) {
  const { data, error } = await companyOs
    .from("job_requisitions")
    .select("id, title, location")
    .eq("status", "open")
    .order("title");

  const jobReqs = (data ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? "(untitled req)",
    location: (r.location as string | null) ?? null,
  }));

  const reqParam = Array.isArray(searchParams.req) ? searchParams.req[0] : searchParams.req;
  const initialReqId = jobReqs.some((r) => r.id === reqParam) ? reqParam! : "";

  return (
    <>
      <PageHead
        eyebrow="Talent · Applications"
        title="Add candidates"
        sub="Drop resumes and let AI prefill the details, or enter a candidate by hand."
        action={
          <Link href="/admin/talent/applications" className="admin-btn admin-btn--sm">
            Back to applications
          </Link>
        }
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error.message}
        </div>
      )}
      <AddCandidates jobReqs={jobReqs} initialReqId={initialReqId} />
    </>
  );
}
