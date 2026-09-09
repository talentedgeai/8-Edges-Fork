import { redirect } from "next/navigation";

// Superseded: retreats are now company_os.events (type='retreat') rather than
// a cohort_slug aggregation. Kept as a redirect so old bookmarks/links keep
// working (same pattern as the earlier registrations → public-retreats move).
export default function PublicRetreatsRedirect() {
  redirect("/admin/revenue/events");
}
