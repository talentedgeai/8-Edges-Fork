import { redirect } from "next/navigation";
import { companyOs } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Candidates folded into Applications. Old candidate links resolve to the
// person's Contact 360 (the candidates table survives read-only until the
// Phase 5 drop; after that this falls back to the applications list).
export default async function CandidateDetailPage({ params }: { params: { id: string } }) {
  const { data } = await companyOs
    .from("candidates")
    .select("person_id")
    .eq("id", params.id)
    .maybeSingle();
  if (data?.person_id) redirect(`/admin/contacts/${data.person_id}`);
  redirect("/admin/talent/applications");
}
