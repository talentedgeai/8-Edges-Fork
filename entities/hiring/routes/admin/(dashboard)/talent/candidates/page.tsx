import { redirect } from "next/navigation";

// Candidates folded into Applications (a candidate is just a person; the
// application holds the job-specific record). Old bookmarks land on the ATS.
export default function CandidatesPage() {
  redirect("/admin/talent/applications");
}
