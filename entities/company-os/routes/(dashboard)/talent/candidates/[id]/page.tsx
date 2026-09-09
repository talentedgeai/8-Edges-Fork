import { redirect } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";

// Candidates folded into Applications. Old candidate links resolve to the
// person's Contact 360 (the candidates table survives read-only until the
// Phase 5 drop; after that this falls back to the applications list).
export default async function CandidateDetailPage({ params }: { params: { id: string } }) {
  const { data, error } = await companyOs
    .from("candidates")
    .select("person_id")
    .eq("id", params.id)
    .maybeSingle();
  if (error) console.error("[talent/candidates] candidate lookup failed:", error.message);
  if (data?.person_id) redirect(`/admin/contacts/${data.person_id}`);
  redirect("/admin/talent/applications");
}
