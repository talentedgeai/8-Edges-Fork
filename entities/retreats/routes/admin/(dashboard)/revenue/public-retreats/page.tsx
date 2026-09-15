import { redirect } from "next/navigation";
import { surfaceBase } from "@/kernel/shell/surface";

// Superseded: retreats are now company_os.events (type='retreat') rather than
// a cohort_slug aggregation. Kept as a redirect so old bookmarks/links keep
// working (same pattern as the earlier registrations → public-retreats move).
export default function PublicRetreatsRedirect() {
  redirect(`${surfaceBase()}/revenue/events`);
}
